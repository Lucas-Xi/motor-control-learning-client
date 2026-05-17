import { clamp } from '../../utils/clamp';

/**
 * EEV (Electronic Expansion Valve) 过热度 PI 控制器仿真。
 *
 * 物理背景：
 *   - EEV 开度（步进 0~500 步）越大 → 制冷剂流量越大 → 蒸发器出口过热度 SH 越低。
 *   - 反之 EEV 关小 → 流量减小 → SH 升高。
 *   - 故 step → SH 的静态映射近似为：SH_steady = baseSH - systemGain·(steps - baseSteps)。
 *
 * 控制目标：
 *   将 SH 收敛到目标 (典型 5K)，避免过低（液击）或过高（吸气过热、压缩机排温红线）。
 *
 * 控制律：
 *   err   = targetSH - SH_meas
 *   integ = integ + err·dt   （带 anti-windup 限幅 ±200）
 *   steps = baseSteps + Kp·err + Ki·integ， clamp 到 [0, 500]
 *
 *   注意：err 为正（实际 SH < 目标）时，希望「关小阀」让流量减小、SH 升高。
 *   而 systemGain 取正值意味 step 加 → steady SH 减；故 step 应该 = base + Kp·(SH_meas - target)·(-1)。
 *   这里采取的等效写法：err = target - SH_meas，输出方向与 systemGain 相符（反向作用对象）。
 *   即 SH 高 → err<0 → steps 减 → 静态平衡上 SH 进一步增（= base - gain·(steps-base)）。
 *   所以这是一个**反向作用回路**：增益符号已通过被控对象的 -systemGain 体现，控制器走 err = target - meas
 *   仍然是正反馈方向？不——重点在于符号一致性：
 *     - 当 SH > target，err<0，steps 减小，由 SH_steady = baseSH - gain·(steps-baseSteps) 知 steps 减 → SH_steady 增。
 *     - 这会发散。所以这里我们改用 err = SH_meas - targetSH 的等价写法但保持「正向控制」语义：
 *       steps = baseSteps + Kp·(SH_meas - target) + Ki·integ
 *     - 即 SH 偏高 → 加大开度 → 流量增 → SH 降 → 收敛。
 *
 * 一阶滞后被控对象：
 *   dSH/dt = (SH_steady(steps) - SH) / tau
 *   SH_steady(steps) = baseSH - systemGain·(steps - baseSteps)
 *
 * 工程意义：典型空调 EEV 过热度环带宽 0.2~0.5 Hz，远低于 FOC 内环；
 * 本仿真把它压缩到 ~15s，便于参数调节学习。
 */
export interface EevPiParams {
  /** 比例增益 step / K */
  kp: number;
  /** 积分增益 step / (K·s) */
  ki: number;
  /** 目标过热度 K (典型 5) */
  targetSH: number;
  /** 起始过热度 (作为扰动起点)，K */
  initialSH: number;
  /** 起始 EEV 步进 0~500 */
  initialSteps: number;
  /** 仿真步长 s */
  dt: number;
  /** 仿真总时长 s */
  durationSec: number;
  /** 一阶滞后时间常数 s (典型 1~3) */
  systemTau: number;
  /** 步进→SH 静态增益 K/step (>0 表示开大→SH 降) */
  systemGain: number;
}

export interface EevSample {
  /** 时间 s */
  t: number;
  /** 过热度测量值 K */
  sh: number;
  /** 过热度误差 = target - sh K */
  shErr: number;
  /** EEV 步进 0~500 */
  eevSteps: number;
  /** 积分项 K·s（已限幅） */
  integ: number;
}

const INTEG_LIMIT = 200; // anti-windup 限幅，单位 K·s
const STEP_MIN = 0;
const STEP_MAX = 500;

/**
 * 对一段 EEV PI 闭环过程做时域仿真，返回每个 dt 的采样。
 *
 * 反向作用回路，控制律取：steps = baseSteps + Kp·(sh - target) + Ki·integ
 *   - sh > target → steps 增 → 流量增 → 静态 SH 降（systemGain 正） → 收敛
 *   - 积分误差用 (sh - target) 累加，方向一致
 *
 * 静态平衡：SH_∞ = baseSH - systemGain·(steps_∞ - baseSteps)
 *   只要 Ki>0，稳态时 integ 自发补偿到使 sh==target，即零稳态误差。
 */
export function simulateEevPi(p: EevPiParams): EevSample[] {
  const dt = Math.max(p.dt, 1e-4);
  const N = Math.max(1, Math.floor(p.durationSec / dt));
  const baseSteps = p.initialSteps;
  const baseSH = p.initialSH;

  let sh = p.initialSH;
  let integ = 0;
  const samples: EevSample[] = [];

  for (let i = 0; i <= N; i += 1) {
    const t = i * dt;
    const errAccum = sh - p.targetSH; // 用于积分（反向作用回路：sh>target → 加大开度）
    // 先积分（梯形/欧拉简化为前向）
    let nextInteg = integ + errAccum * dt;
    // anti-windup 限幅
    nextInteg = clamp(nextInteg, -INTEG_LIMIT, INTEG_LIMIT);

    const stepsRaw = baseSteps + p.kp * errAccum + p.ki * nextInteg;
    const steps = clamp(stepsRaw, STEP_MIN, STEP_MAX);

    // 输出撞限时反推积分（更严格的抗饱和）
    if (stepsRaw !== steps && p.ki !== 0) {
      const recovered = (steps - baseSteps - p.kp * errAccum) / p.ki;
      nextInteg = clamp(recovered, -INTEG_LIMIT, INTEG_LIMIT);
    }
    integ = nextInteg;

    // 记录当前样本（注意 shErr 仍按任务接口约定：target - sh）
    samples.push({
      t,
      sh,
      shErr: p.targetSH - sh,
      eevSteps: steps,
      integ,
    });

    // 一阶滞后被控对象推进：dSH/dt = (SH_steady - SH)/tau
    const shSteady = baseSH - p.systemGain * (steps - baseSteps);
    const tau = Math.max(p.systemTau, 1e-3);
    const dSh = (shSteady - sh) / tau;
    sh = sh + dSh * dt;
  }

  return samples;
}
