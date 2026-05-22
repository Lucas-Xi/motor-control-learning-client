/**
 * PMSM 电感饱和模型（cross-saturation）。
 *
 * **为什么需要**：常量 Ld/Lq 是教学简化。真实 IPM 电机的电感随电流变化：
 *   - 高 iq 让定子铁芯进入饱和区，Lq 下降 20-40%（"q-axis saturation"）
 *   - 高 id 让磁路饱和，Ld 下降 10-20%（"d-axis saturation"）
 *   - 交叉饱和：iq 也会让 Ld 下降一点（"cross-coupling"），反之亦然
 *   结果：凸极比 ξ = Lq/Ld 在重载下从空载值 1.8 退化到 1.3 甚至更低，
 *         MTPA 轨迹偏离纯空载理论，弱磁 Id_min 计算系统性偏差。
 *
 * **公式形式**：用 Vorobiev (2010) 提出的可分离多项式拟合：
 *   Ld(id, iq) = Ld0 · (1 + a_d · id + b_d · |iq|) · ramp_d(id)
 *   Lq(id, iq) = Lq0 · (1 + a_q · iq + b_q · |id|) · ramp_q(iq)
 *   其中 a_d, b_d, a_q, b_q 都是负数（饱和方向），从 datasheet 或 FEA 拟合得到。
 *   ramp(*) 是 sigmoid 形状，超过额定电流 1.5 倍后急剧下降（防止外推到非物理区域）。
 *
 * **参考**：
 *   - Vorobiev L, "Modeling of saturated PMSM with cross-coupling effects",
 *     IEEE IEMDC 2010
 *   - 阮毅《电力拖动自动控制系统》§5.4 永磁同步电机非线性建模
 *   - Bose《Modern Power Electronics and AC Drives》§7.3 IPM saturation
 *
 * **STM32 移植**：实际控制器一般用 2D LUT（id × iq → Ld, Lq），双线性插值，~16 cycles。
 *   本仿真用闭式公式方便参数化；移植时把 saturatedInductances() 替换为 LUT 查表即可。
 */

export interface SaturationParams {
  /** 空载 d 轴电感（H） */
  ld0: number;
  /** 空载 q 轴电感（H） */
  lq0: number;
  /** 额定电流（A，用于归一化拟合系数） */
  iRated: number;
  /**
   * d 轴饱和系数 (a_d, b_d)。
   *   a_d: id 对 Ld 的影响（负数，典型 -0.05..-0.20）
   *   b_d: iq 对 Ld 的影响（交叉饱和，典型 -0.02..-0.08）
   * 单位按 i/iRated 归一化后的系数。
   */
  ad: number;
  bd: number;
  /** q 轴饱和系数 (a_q, b_q)，含义同上。 */
  aq: number;
  bq: number;
  /**
   * 饱和起始电流比（i/iRated）。低于此值近似无饱和；高于此值进入饱和区。
   * 典型 0.6-0.8。
   */
  knee: number;
}

export interface SaturatedInductances {
  ld: number;
  lq: number;
  /** 凸极比 ξ = Lq/Ld */
  saliency: number;
  /** 饱和裕度 0..1（0=完全饱和，1=空载） */
  margin: number;
}

/** Sigmoid 软饱和门：x < knee 时 ≈ 1；x > knee 时迅速下降到 0.6 附近 */
function softSaturationGain(xNorm: number, knee: number): number {
  if (xNorm <= knee) return 1;
  const over = (xNorm - knee) / Math.max(0.1, 1 - knee);
  // ramp 在 over=0 时为 1，over=1 时为 0.55，over=2 时为 0.32
  return 1 / (1 + 0.6 * over * over);
}

/**
 * 给定瞬时电流 (id, iq) 算出当前的 Ld、Lq。
 *
 * @example
 *   const sat = saturatedInductances(2, 8, { ld0: 1.2e-3, lq0: 1.5e-3, iRated: 10, ad: -0.12, bd: -0.05, aq: -0.18, bq: -0.06, knee: 0.7 });
 *   // sat.ld ≈ 1.05e-3, sat.lq ≈ 1.15e-3, sat.saliency ≈ 1.10
 *   // 注意：空载 Lq/Ld = 1.25；重载后退化到 1.10 ——这就是为什么 MTPA 实测偏离理论
 */
export function saturatedInductances(id: number, iq: number, params: SaturationParams): SaturatedInductances {
  const idNorm = Math.abs(id) / Math.max(0.01, params.iRated);
  const iqNorm = Math.abs(iq) / Math.max(0.01, params.iRated);

  // 主饱和：自轴方向；交叉饱和：他轴的小幅影响
  const ldRaw = params.ld0 * (1 + params.ad * idNorm + params.bd * iqNorm);
  const lqRaw = params.lq0 * (1 + params.aq * iqNorm + params.bq * idNorm);

  // 软饱和门：防止系数把 L 推到负值或非物理区
  const ldGain = softSaturationGain(Math.hypot(idNorm, iqNorm), params.knee);
  const lqGain = softSaturationGain(iqNorm, params.knee); // q 轴更敏感

  // L 不能小于空载的 30%（物理下限：铁芯完全饱和后近似只剩漏感）
  const ld = Math.max(params.ld0 * 0.3, ldRaw * ldGain);
  const lq = Math.max(params.lq0 * 0.3, lqRaw * lqGain);

  const saliency = lq / Math.max(1e-9, ld);
  // margin = 1 表示完全空载，0 表示双轴都跑到额定 1.5 倍
  const margin = Math.max(0, 1 - Math.hypot(idNorm, iqNorm) / 1.5);

  return { ld, lq, saliency, margin };
}

/**
 * 给一组典型 IPM 压缩机电机的拟合系数（海立 7.5HP, 4 极对）。
 * 学员可以直接拿来用，或在 UI 上拖动改系数看 MTPA 轨迹偏移。
 */
export const sampleSaturationParams = {
  /** 海立 1.5HP 空调压缩机 IPM 风格 */
  hitachi15HP: {
    ld0: 1.2e-3,
    lq0: 2.1e-3,
    iRated: 12,
    ad: -0.10,
    bd: -0.04,
    aq: -0.22,
    bq: -0.07,
    knee: 0.65,
  } satisfies SaturationParams,
  /** SPM 表贴式（凸极比 ≈ 1，几乎不饱和） */
  spmSurface: {
    ld0: 0.8e-3,
    lq0: 0.85e-3,
    iRated: 10,
    ad: -0.06,
    bd: -0.02,
    aq: -0.06,
    bq: -0.02,
    knee: 0.8,
  } satisfies SaturationParams,
  /** EV 主驱 IPM（高速大电流场景） */
  evTraction: {
    ld0: 0.3e-3,
    lq0: 0.55e-3,
    iRated: 220,
    ad: -0.15,
    bd: -0.06,
    aq: -0.28,
    bq: -0.10,
    knee: 0.55,
  } satisfies SaturationParams,
};
