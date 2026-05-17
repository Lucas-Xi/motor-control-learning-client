/**
 * 死区补偿（Dead-Time Compensation, DTC）—— 电流符号法（current-sign method）。
 *
 * 物理背景：
 *   两电平三相逆变器为防直通在上下管间插入死区 t_dead（μs）。死区窗口内电压由相电流方向
 *   通过反并联续流二极管决定，导致一个与电流方向相反的平均压降偏差：
 *
 *     ΔV_phase = sign(i_phase) × t_dead × f_sw × Udc           [V]
 *
 *   等价的占空比偏差（对单边压降归一化到母线）为：
 *
 *     Δd_phase = sign(i_phase) × t_dead / T_sw                 [无量纲]
 *
 *   补偿就是把这个偏差以**相反符号**加到名义占空比上：
 *
 *     d'_phase = d_phase - Δd_phase
 *              = d_phase - sign(i_phase) × (t_dead / T_sw)
 *
 * Hysteresis（滞环）：
 *   过零附近 sign(i) 抖动 → 补偿量在 ±Δd 之间跳变 → 反而引入更大的电压谐波（"过补偿振荡"）。
 *   工程上把硬阈值 sign(i) 替换成带滞环的"软符号"：
 *     - |i| > +i_hys → +1
 *     - |i| < -i_hys → -1
 *     - 之间保持上一周期的符号，或线性过渡到 0
 *   滞环带宽 i_hys 一般取额定电流的 2-5%，频谱分析下能显著抑制 5/7 次谐波。
 *
 * 参考：
 *   - 阮毅《电力拖动自动控制系统》第 5 章 5.4 节"死区效应及补偿"
 *   - Bose, "Modern Power Electronics and AC Drives" §5.2.4
 *   - TI Application Report SPRABQ7 "Dead-Time Insertion and PWM Implementation"
 *
 * 单位：
 *   - ia/ib/ic：相电流 A（瞬时值）
 *   - t_dead_us：死区时间 μs
 *   - t_sw_us：开关周期 μs（= 1/f_sw × 1e6）
 *   - Vdc：母线电压 V（保留参数以便扩展为压降比例补偿，本函数当前不直接乘 Vdc，
 *     因为输出是占空比修正量，移植到 STM32 时直接加到 TIMx_CCRx）
 *
 * STM32 移植要点：
 *   - q15 实现：t_dead/T_sw 通常 < 0.05，定点表达直接用 Q15 即可；sign() 用 __SSAT 或位移。
 *   - ISR 周期：放在 ADC EOC 中断的电流环里，与 Park/SVPWM 同节拍；不要拖到 1 ms 任务。
 *   - 查表 vs 迭代：滞环逻辑分支极浅（3 路 if），不必查表；保留 phase 上一拍 sign 即可（state machine）。
 *   - i_hys 推荐用额定电流 × 0.03 作硬编码常量，过小会让滞环失效。
 */

export interface DeadTimeCompensationInput {
  /** 三相瞬时电流 A */
  ia: number;
  ib: number;
  ic: number;
  /** 死区时间 μs（典型 1-5 μs） */
  t_dead_us: number;
  /** 开关周期 μs（典型 62.5 = 16 kHz） */
  t_sw_us: number;
  /** 母线电压 V（保留，便于上层换算为 ΔV） */
  Vdc: number;
  /** 滞环阈值 A，过零附近 |i| < i_hys 时不补偿（默认 0，等价无滞环硬符号） */
  i_hys?: number;
  /** 上一拍 sign（启用滞环时用作"无人区"的保持值） */
  prevSign?: { a: number; b: number; c: number };
}

export interface DeadTimeCompensationOutput {
  /** 占空比修正量 Δd（应**加到**理想占空比上以抵消死区误差，故内部已取反号） */
  ddA: number;
  ddB: number;
  ddC: number;
  /** 等价电压偏差 V（便于教学/绘图，未直接参与占空比修正计算） */
  dvA: number;
  dvB: number;
  dvC: number;
  /** 本拍判定出的电流符号，下一拍可回灌为 prevSign 形成滞环记忆 */
  signA: number;
  signB: number;
  signC: number;
}

/**
 * 带滞环的"软符号"。
 * |i| ≥ i_hys → 走真实 sign；
 * |i| < i_hys → 维持上一拍 prevSign（若 prevSign=0 则输出 0，避免开机冷启动跳变）。
 *
 * 注意：滞环只针对**输出符号**，不修改电流值。如果上层希望"渐变补偿"，可以再乘 |i|/i_hys
 * 形成线性过渡，本函数留给上层组合。
 */
function softSign(i: number, i_hys: number, prev: number): number {
  if (i_hys <= 0) {
    // 无滞环：纯硬符号
    return Math.sign(i);
  }
  if (i >= i_hys) return 1;
  if (i <= -i_hys) return -1;
  // 无人区：保持记忆值
  return prev;
}

/**
 * 死区补偿主函数。
 *
 *   d_compensated = d_ideal + Δd_correction
 *   Δd_correction = -sign(i_phase) × t_dead / T_sw
 *
 * 返回的 ddX 就是 Δd_correction（已含负号）。
 * 上层把它**加到**名义占空比上即可。
 */
export function compensateDeadTime(input: DeadTimeCompensationInput): DeadTimeCompensationOutput {
  const tSw = Math.max(input.t_sw_us, 1e-6);
  const dutyDelta = input.t_dead_us / tSw; // 归一化偏差（正数）
  const voltDelta = input.t_dead_us * 1e-6 * (1 / (input.t_sw_us * 1e-6)) * input.Vdc; // = (t_dead/T_sw)·Vdc

  const hys = input.i_hys ?? 0;
  const prev = input.prevSign ?? { a: 0, b: 0, c: 0 };

  const sA = softSign(input.ia, hys, prev.a);
  const sB = softSign(input.ib, hys, prev.b);
  const sC = softSign(input.ic, hys, prev.c);

  // 补偿量与"误差量"反号：误差是 sign(i)×Δd，补偿是 -sign(i)×Δd
  return {
    ddA: -sA * dutyDelta,
    ddB: -sB * dutyDelta,
    ddC: -sC * dutyDelta,
    dvA: sA * voltDelta,
    dvB: sB * voltDelta,
    dvC: sC * voltDelta,
    signA: sA,
    signB: sB,
    signC: sC,
  };
}
