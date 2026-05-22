/**
 * 温度对电机参数的影响：Rs(T) PTC + ψf(T) NTC + 退磁阈值守护。
 *
 * **为什么需要**：
 *   - 铜绕组电阻 Rs 随温升正比增大（PTC, α_Cu = 0.00393 / K）。
 *     冷机 25°C 与热机 120°C 之间 Rs 差异 = 1 + 0.00393 × 95 = +37%。
 *     不补偿 → 电流环增益失配；id=0 控制下 Iq 命令 vs 实际转矩偏差。
 *
 *   - NdFeB 永磁体磁链 ψf 随温升下降（NTC, β ≈ 0.0012 / K = -0.12%/K）。
 *     120°C 工况 ψf 下降 12%；高速反电动势对应下降，但**退磁临界点**（NdFeB N52 grade 约 80°C）
 *     之上磁链开始不可逆退磁，电机永久损坏。
 *
 *   - 一阶热模型：绕组温升 T_winding = T_ambient + R_thermal × P_loss × (1 − e^(-t/τ_thermal))
 *     压缩机典型 R_th ≈ 0.5 K/W、τ ≈ 600 s → 长时间满载会爬到 100°C+。
 *
 * **参考**：
 *   - IEC 60034-1 Rotating electrical machines, Part 1: Rating and performance
 *   - Hitachi NdFeB technical bulletin: temperature coefficients
 *   - 阮毅《电力拖动自动控制系统》§5.6 PMSM 温度效应
 *
 * **STM32 移植**：温度从 NTC 串口读到主控；用本模块计算补偿 Rs / ψf 灌进 FOC 算法。
 *   N52 grade 退磁告警 100°C 必须断电退磁前停机。
 */

export interface ThermalParams {
  /** 绕组铜温度系数 α_Cu (1/K)，纯铜 0.00393 */
  alphaCu: number;
  /** NdFeB 磁链温度系数 β (1/K)，N52 约 0.0012 (= -0.12%/K) */
  betaPm: number;
  /** 退磁临界温度 (°C)，N52=80, N42SH=150, N48UH=180 */
  TdemagC: number;
  /** 基准温度 (°C)，参数都对齐到这个温度 */
  T0C: number;
  /** 绕组热阻 R_th (K/W) */
  RthermalKW: number;
  /** 绕组热时间常数 τ (s) */
  tauThermalSec: number;
}

export const defaultThermalParams: ThermalParams = {
  alphaCu: 0.00393,
  betaPm: 0.0012,
  TdemagC: 100,    // N50 grade 安全余量
  T0C: 25,
  RthermalKW: 0.5,
  tauThermalSec: 600,
};

export interface CompensatedParams {
  /** 当前温度下的 Rs (Ω) */
  rs: number;
  /** 当前温度下的 ψf (Wb) */
  flux: number;
  /** Rs 增量百分比 vs 基准 (例如 +37 表示比基准热 +37%) */
  rsRisePct: number;
  /** ψf 减量百分比 vs 基准 (例如 -12 表示降低 12%) */
  fluxDropPct: number;
  /** 是否超过退磁阈值（true = 危险，主控应断电） */
  demagAlarm: boolean;
  /** 退磁裕度 (K)，正数表示安全；负数表示已超过阈值 */
  demagMarginK: number;
}

/**
 * 给定温度 + 基准参数算出当前补偿后的 Rs / ψf。
 *
 * @example
 *   const r = compensateForTemperature(120, { rs0: 0.55, flux0: 0.045 }, defaultThermalParams);
 *   // r.rs ≈ 0.55 × (1 + 0.00393 × 95) ≈ 0.755 Ω（+37%）
 *   // r.flux ≈ 0.045 × (1 - 0.0012 × 95) ≈ 0.0399 Wb（-11.4%）
 *   // r.demagAlarm = true（120 > 100°C 阈值）
 */
export function compensateForTemperature(
  TcurrentC: number,
  baseline: { rs0: number; flux0: number },
  params: ThermalParams = defaultThermalParams,
): CompensatedParams {
  const dT = TcurrentC - params.T0C;
  const rsFactor = 1 + params.alphaCu * dT;
  const fluxFactor = 1 - params.betaPm * dT;
  const rs = baseline.rs0 * Math.max(0.5, rsFactor);          // 防过冷溢出
  const flux = baseline.flux0 * Math.max(0.3, fluxFactor);    // 防退磁数值跌穿
  return {
    rs,
    flux,
    rsRisePct: (rsFactor - 1) * 100,
    fluxDropPct: (1 - fluxFactor) * 100,
    demagAlarm: TcurrentC > params.TdemagC,
    demagMarginK: params.TdemagC - TcurrentC,
  };
}

/**
 * 一阶热模型：给定瞬时损耗 + 环境温度，递推绕组温度。
 *
 * dT/dt = (P_loss × R_th − (T − T_amb)) / τ
 *
 * @param TcurrentC 当前绕组温度 (°C)
 * @param TambientC 环境温度 (°C)
 * @param PlossW 瞬时总损耗 (W，含铜损 + 铁损)
 * @param dtSec 步长 (s)
 *
 * @returns 下一步的绕组温度 (°C)
 */
export function stepThermal(
  TcurrentC: number,
  TambientC: number,
  PlossW: number,
  dtSec: number,
  params: ThermalParams = defaultThermalParams,
): number {
  const Tsteady = TambientC + PlossW * params.RthermalKW;
  // 一阶滞后：T_new = T_old + (T_steady − T_old) × dt/τ
  const alpha = Math.min(1, dtSec / Math.max(1e-3, params.tauThermalSec));
  return TcurrentC + (Tsteady - TcurrentC) * alpha;
}
