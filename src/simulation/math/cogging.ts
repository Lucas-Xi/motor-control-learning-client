/**
 * 齿槽转矩 + BEMF 空间谐波模型。
 *
 * **为什么需要**：
 *   - 齿槽转矩 T_cog 来自定子槽与转子永磁体之间的磁阻周期性变化；
 *     纯正弦驱动时它表现为机械转矩上的周期性纹波，频率 = N_slots × ω_mech 的最小公倍数。
 *     家用压缩机典型 N_slots=12, 极数=8 (P=4)，LCM=24 → 每机械圈 24 个齿槽峰值。
 *     幅值通常 = 额定转矩的 1-5%，**低速时**最显著（高速被惯性平滑掉）。
 *
 *   - BEMF 空间谐波：理想模型假设 BEMF 是纯正弦 e = ψ_f · ω · sin(θ_e)。
 *     真实电机由于齿槽 + 极弧系数 + 转子形状，BEMF 含 5/7/11/13 次空间谐波。
 *     5/7 是 fractional-pitch 绕组的典型；11/13 是齿槽相关。
 *     这些谐波会被 Park 投影成 dq 上的 6 倍频纹波，进而被电流环放大。
 *
 * **公式**：
 *   T_cog(θ_mech) = Σ Tc_n · sin(n · N_lcm · θ_mech + φ_n)
 *     主要项 n=1 (基波)，n=2 (二次)，n=3 (三次)
 *
 *   BEMF spatial harmonics:
 *     e(θ_e) = ψ_f · ω_e · Σ k_h · sin(h · θ_e)
 *     h = 1, 5, 7, 11, 13；k_1 = 1，k_5 ≈ 0.05，k_7 ≈ 0.03，k_11 ≈ 0.015
 *
 * **教学意义**：
 *   - 学员调"低速 30 rpm 平台测试"时听到的"咯咯咯"声 → 齿槽转矩
 *   - 电流环输出看到的 6 倍频毛刺 → BEMF 5/7 次谐波被 Park 投影
 *   - 这些都不是"控制器问题"而是电机本征特性，控制器只能减小不能消除
 *
 * **参考**：
 *   - Hanselman D, "Brushless Permanent-Magnet Motor Design" Ch.4 (cogging analysis)
 *   - Zhu Z.Q., Howe D., "Influence of design parameters on cogging torque in
 *     permanent magnet machines", IEEE Trans. Energy Convers. 15(4), 2000
 *   - Bose《Modern Power Electronics and AC Drives》§7.4 PMSM BEMF harmonics
 *
 * **STM32 移植**：齿槽前馈补偿用 1D LUT (θ_mech → T_cog_estimate)，
 *   速度环用 Iq_ref += T_cog_LUT / Kt 做前馈，能压低 60-70% 的转矩纹波。
 */

export interface CoggingParams {
  /** 槽数 (typical 12 / 18 / 24 for compressor) */
  slots: number;
  /** 极对数 */
  polePairs: number;
  /** 齿槽转矩各次谐波幅值 (N·m)，依次是 1×LCM, 2×LCM, 3×LCM */
  amplitudes: number[];
  /** 各次谐波相位 (rad)，长度应与 amplitudes 一致 */
  phases: number[];
}

export interface CoggingResult {
  /** 当前瞬时齿槽转矩 (N·m) */
  torque: number;
  /** 周期数 = slots × poles / gcd(slots, poles) / poles */
  periodPerRev: number;
}

/**
 * GCD（辗转相除法）— 用来算齿槽周期 LCM。
 */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * 计算齿槽转矩。
 *
 * @param thetaMechRad 机械角度 (rad)
 * @example
 *   // 海立 1.5HP 压缩机 12 槽 8 极 (P=4)
 *   const t = coggingTorque(theta, { slots: 12, polePairs: 4, amplitudes: [0.08, 0.02, 0.005], phases: [0, 0, 0] });
 *   // 每机械圈 LCM(12, 8)/8 = 3 个齿槽周期，幅值 ~80 mN·m（额定 ~1 N·m 的 8%）
 */
export function coggingTorque(thetaMechRad: number, params: CoggingParams): CoggingResult {
  const poles = params.polePairs * 2;
  const lcm = (params.slots * poles) / gcd(params.slots, poles);
  // 每机械圈出现的齿槽峰值数
  const periodPerRev = lcm / poles;

  let torque = 0;
  for (let n = 0; n < params.amplitudes.length; n += 1) {
    const order = (n + 1) * lcm;
    const amp = params.amplitudes[n] ?? 0;
    const phase = params.phases[n] ?? 0;
    torque += amp * Math.sin(order * thetaMechRad + phase);
  }
  return { torque, periodPerRev };
}

/**
 * BEMF 空间谐波幅值表（n: 谐波次数 → k_n / k_1 比值）。
 * 默认值来自《IEEE Trans. Energy Convers.》对典型 fractional-pitch 4-pole PMSM 的实测。
 */
export const defaultBemfHarmonics: ReadonlyArray<{ order: number; coef: number }> = [
  { order: 1, coef: 1.0 },     // 基波
  { order: 5, coef: 0.05 },    // 5 次（分布绕组主要谐波）
  { order: 7, coef: 0.03 },    // 7 次
  { order: 11, coef: 0.015 },  // 11 次（齿槽相关）
  { order: 13, coef: 0.010 },  // 13 次
];

/**
 * 算非正弦 BEMF 瞬时值（单相）。
 *
 * @param thetaElectricalRad 电角度 (rad)
 * @param flux 永磁磁链 ψ_f (Wb)
 * @param omegaElectricalRadS 电角频率 (rad/s)
 * @param harmonics 谐波幅值表，默认 defaultBemfHarmonics
 *
 * @returns 瞬时 BEMF (V)
 */
export function bemfWithHarmonics(
  thetaElectricalRad: number,
  flux: number,
  omegaElectricalRadS: number,
  harmonics: ReadonlyArray<{ order: number; coef: number }> = defaultBemfHarmonics,
): number {
  let sum = 0;
  for (const { order, coef } of harmonics) {
    sum += coef * Math.sin(order * thetaElectricalRad);
  }
  return flux * omegaElectricalRadS * sum;
}

/**
 * BEMF 谐波 THD 计算（不含基波的能量比基波）。
 * 用来量化"实测 BEMF 离纯正弦有多远"。
 */
export function bemfThd(harmonics: ReadonlyArray<{ order: number; coef: number }>): number {
  const fund = harmonics.find((h) => h.order === 1);
  if (!fund || Math.abs(fund.coef) < 1e-9) return 0;
  let sq = 0;
  for (const h of harmonics) {
    if (h.order === 1) continue;
    sq += h.coef * h.coef;
  }
  return Math.sqrt(sq) / Math.abs(fund.coef);
}

/**
 * 典型 IPM 压缩机齿槽参数样本。
 */
export const sampleCoggingParams = {
  /** 海立 1.5HP 12槽-8极，齿槽较强（额定 ~1.0 N·m 的 8%） */
  hitachi15HP: {
    slots: 12,
    polePairs: 4,
    amplitudes: [0.08, 0.02, 0.005],
    phases: [0, Math.PI / 6, Math.PI / 3],
  } satisfies CoggingParams,
  /** 高端 EV 主驱 48槽-8极 fractional-slot，齿槽设计 < 1% */
  evTraction: {
    slots: 48,
    polePairs: 4,
    amplitudes: [0.6, 0.15, 0.04],
    phases: [0, 0, 0],
  } satisfies CoggingParams,
};
