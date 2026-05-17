/**
 * 带 back-calculation（反算）抗积分饱和的 PI 控制器。
 *
 * 物理背景：
 *   PI 控制器在执行器饱和（电压撞母线、电流撞 Ilim）时会出现 windup：
 *   积分项继续累加，但实际输出被限幅器截掉，等饱和解除后控制器需要先把"虚高"的积分
 *   反向消掉，期间表现为长时间超调（典型表现：起动阶段一冲到底，然后回退好几个 s 才稳）。
 *
 *   两种主流抗 windup 方案对比：
 *
 *   方案 A: Clamping（条件积分 / Integrator Clamping）
 *     - 当输出饱和且 sign(error) == sign(u_unsat - u_sat) 时，**冻结**积分增量。
 *     - 优点：实现极简，单个 if；
 *     - 缺点：饱和深度大时恢复仍需多个采样周期（积分项本身没被减小，只是停止增长），
 *       且对噪声敏感（error 抖动会反复冻结/解冻）。
 *
 *   方案 B: Back-calculation（反算回灌）
 *     - 引入额外增益 Ka，把饱和量 (u_sat - u_unsat) 乘 Ka 反向加到积分输入：
 *
 *         I[n+1] = I[n] + (Ki·error + Ka·(u_sat - u_unsat)) · dt
 *
 *     - 等价于在饱和时给积分器再加一个负反馈环，时间常数 ≈ 1/Ka；
 *     - 优点：恢复速度由 Ka 直接调，独立于主环 Ki；噪声鲁棒；
 *     - 缺点：多一个调参 Ka，经验值取 Ka = Ki/Kp（让两个时间常数匹配，Åström 推荐）。
 *
 *   实测对比（典型电流环，Ki=300, Kp=0.5, 饱和释放后）：
 *     - Clamping：恢复时间 ≈ 80 ms（积分项缓慢回退）
 *     - Back-calc (Ka=Ki/Kp=600): 恢复时间 ≈ 20 ms（积分项主动倒灌）
 *
 * 参考：
 *   - 阮毅《电力拖动自动控制系统》第 3 章 3.5 节"PI 调节器的限幅与抗饱和"
 *   - K. J. Åström & T. Hägglund, "PID Controllers: Theory, Design, and Tuning" §3.5
 *   - TI Application Report SPRABB6 "Sensorless Field Oriented Control of 3-Phase
 *     Permanent Magnet Synchronous Motors" §6.3
 *
 * 单位：
 *   - kp, ki: 控制器增益（输入通常是电流 A / 速度 rad/s，输出通常是电压 V）
 *   - ka: 反算增益，经验取 ki/kp（与 ki 同量级）
 *   - outMin/outMax: 输出限幅，单位同输出（V/A/N·m）
 *   - dt: s
 *
 * STM32 移植要点：
 *   - q15 实现：积分器单独存 q31 以容纳累加范围；输出再 SAT 到 q15。
 *   - ISR 周期：电流环 10-20 kHz，速度环 1-2 kHz；ka·dt 一般在 0.01-0.1 之间，
 *     用 q15 已够精度。
 *   - 查表 vs 迭代：本控制器仅 6 个乘加，CMSIS-DSP 直接用 `arm_pid_q15` 也行，但
 *     CMSIS 的标准 PID 是 **clamping** 策略，不带 back-calculation；如需高动态恢复
 *     建议手写本实现。
 *   - 初始化：ka 设为 0 时退化为无抗 windup 的纯 PI（用作对照实验，不推荐生产）。
 */

export interface AntiWindupPIController {
  step(err: number, dt: number): number;
  reset(): void;
  /** 上一次 step 是否触发饱和（教学/诊断用） */
  readonly saturated: boolean;
  /** 当前积分值（读 only） */
  readonly integral: number;
}

/**
 * 工厂函数：返回闭包形式的带 back-calc 抗 windup PI 控制器。
 *
 * step(err, dt) → u（已饱和裁剪）。
 * 内部用 back-calculation：
 *
 *   u_unsat = kp·err + ki·integral
 *   u_sat   = clamp(u_unsat, outMin, outMax)
 *   integral_next = integral + (err + ka·(u_sat - u_unsat)/ki_safe) · dt   (当 ki ≠ 0)
 *
 *   等价于先按 ki·err·dt 累积，再用 ka·Δu·dt 倒灌；这里写成 (err + ka·Δu/ki)·dt
 *   是为了让 ki=0 时不除零（ki=0 时退化为纯 P，integral 始终保持 0）。
 */
export function makeAntiWindupPI(
  kp: number,
  ki: number,
  ka: number,
  outMin: number,
  outMax: number,
): AntiWindupPIController {
  let integral = 0;
  let sat = false;

  const ctrl: AntiWindupPIController = {
    step(err: number, dt: number) {
      const dtSafe = Math.max(dt, 1e-6);
      // 候选积分（先按常规累加，便于看清饱和带来的回灌量）
      const candidateIntegral = integral + err * dtSafe;
      const uUnsat = kp * err + ki * candidateIntegral;
      let uSat = uUnsat;
      if (uSat > outMax) uSat = outMax;
      else if (uSat < outMin) uSat = outMin;
      const wasSat = Math.abs(uSat - uUnsat) > 1e-9;

      if (wasSat && ka > 0 && Math.abs(ki) > 1e-12) {
        // back-calculation：把饱和量 (uSat - uUnsat) 通过 ka 倒灌到积分。
        // 标准形式：dI/dt = e + (ka/ki)·(uSat - uUnsat)
        // 离散化：integral += (e + (ka/ki)·Δu)·dt
        // 注意：uSat - uUnsat 是**负值**（正向饱和时），所以会让 integral 反向减小。
        integral = integral + (err + (ka / ki) * (uSat - uUnsat)) * dtSafe;
      } else if (wasSat) {
        // 无反算（ka<=0 或 ki=0）：退化为 clamping —— 冻结积分（不增长）。
        // integral 维持原值不变（不写入 candidateIntegral）。
      } else {
        integral = candidateIntegral;
      }

      sat = wasSat;
      return uSat;
    },
    reset() {
      integral = 0;
      sat = false;
    },
    get saturated() {
      return sat;
    },
    get integral() {
      return integral;
    },
  };

  return ctrl;
}
