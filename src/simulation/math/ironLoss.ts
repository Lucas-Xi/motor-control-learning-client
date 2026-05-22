/**
 * 铁损模型（Steinmetz hysteresis + classical eddy + excess loss）。
 *
 * **为什么需要**：把电机做高效率云图时，铁损是除铜损之外第二大损耗源。
 *   家用空调压缩机 4000 rpm 工况铁损可达 30-50 W（接近铜损量级）；
 *   EV 主驱在 12000 rpm 巡航工况铁损可超 800 W。
 *   忽略铁损 → 仿真效率系统性偏高 10-15 percentage points，
 *   学员看到的 "η ≈ 0.95" 是假的。
 *
 * **公式**：Bertotti (1988) 三项分解
 *   P_fe = P_h + P_e + P_a
 *     P_h = k_h · f · B^α            （磁滞损耗，α=1.6-2.0）
 *     P_e = k_e · (f · B)^2          （经典涡流损耗，按频率平方）
 *     P_a = k_a · (f · B)^1.5        （异常损耗，磁畴壁运动）
 *   单位：W/kg，需要乘以铁芯质量 m_core (kg) 得到总功率。
 *
 * **PMSM 应用**：B = max(B_pm + B_iq, B_min)，B_pm 是永磁体提供的恒定基底，
 *   B_iq 是 iq 引入的电枢反应分量。f = ω_e / (2π)，电频率。
 *
 * **参考**：
 *   - Bertotti G, "General properties of power losses in soft ferromagnetic materials",
 *     IEEE Trans. Magn. 24(1), 1988
 *   - Krings et al., "Soft magnetic material status and trends in EV traction motors",
 *     IEEE Trans. Ind. Electron. 64(3), 2017
 *
 * **STM32 移植**：实际只算一次，作为效率云图的查表生成；不需要在 ISR 里跑。
 *   如果要在线估算效率（罕见），可用 1D LUT (f → P_fe@额定 B) + 标度因子。
 */

export interface IronLossParams {
  /** 磁滞损耗系数 k_h (W/kg/Hz/T^α) — 硅钢片 35WW270 典型 0.02-0.04 */
  kh: number;
  /** 经典涡流损耗系数 k_e (W/kg/(Hz·T)^2) — 典型 1e-4 .. 5e-4 */
  ke: number;
  /** 异常损耗系数 k_a (W/kg/(Hz·T)^1.5) — 典型 5e-4 .. 2e-3 */
  ka: number;
  /** 磁滞损耗的指数 α — 典型 1.6 .. 2.0 */
  alpha: number;
  /** 铁芯质量 (kg) */
  coreMassKg: number;
  /** 永磁体提供的气隙磁通密度基底 (T) — 典型 0.6-0.8 */
  bPm: number;
  /** 电枢反应灵敏度 (T/A) — iq 每安培产生多少额外气隙 B */
  bPerIq: number;
}

export interface IronLossResult {
  /** 磁滞损耗 (W) */
  ph: number;
  /** 经典涡流损耗 (W) */
  pe: number;
  /** 异常损耗 (W) */
  pa: number;
  /** 总铁损 (W) */
  total: number;
  /** 等效气隙磁通密度 (T) */
  bAir: number;
  /** 电频率 (Hz) */
  fElec: number;
}

/**
 * 计算给定电频率 + 电枢电流下的铁损。
 *
 * @param omegaElectricalRadS 电角频率 (rad/s)，= ω_mech × polePairs
 * @param iq q 轴电流 (A)
 *
 * @example
 *   // 4 极对压缩机在 4000 rpm × Iq=6A
 *   const omega_e = (4000 / 60) * 2 * Math.PI * 4; // ≈ 1676 rad/s
 *   const loss = ironLoss(omega_e, 6, defaultIronLossParams);
 *   // loss.total ≈ 35 W（典型）
 */
export function ironLoss(omegaElectricalRadS: number, iq: number, params: IronLossParams): IronLossResult {
  const fElec = Math.abs(omegaElectricalRadS) / (2 * Math.PI);
  // 等效气隙磁通密度：PM 基底 + 电枢反应（仅 q 轴主导）
  const bAir = Math.max(0.1, params.bPm + params.bPerIq * Math.abs(iq));

  // 磁滞损耗：与 f 成线性，与 B 的 α 次方成正比
  const phPerKg = params.kh * fElec * Math.pow(bAir, params.alpha);
  // 经典涡流损耗：与 (f·B)^2 成正比
  const fb = fElec * bAir;
  const pePerKg = params.ke * fb * fb;
  // 异常损耗：与 (f·B)^1.5 成正比
  const paPerKg = params.ka * Math.pow(Math.max(0, fb), 1.5);

  const ph = phPerKg * params.coreMassKg;
  const pe = pePerKg * params.coreMassKg;
  const pa = paPerKg * params.coreMassKg;

  return { ph, pe, pa, total: ph + pe + pa, bAir, fElec };
}

/**
 * 默认参数：35WW270 硅钢片 + 1.5HP 压缩机定子（铁芯约 1.8 kg）。
 * 给典型空调变频压缩机做初值；用户可以在 UI 上拖滑块改 k_h / k_e / 铁芯质量。
 */
export const defaultIronLossParams: IronLossParams = {
  kh: 0.030,
  ke: 2.5e-4,
  ka: 1.2e-3,
  alpha: 1.8,
  coreMassKg: 1.8,
  bPm: 0.7,
  bPerIq: 0.012,
};

/**
 * 等效铁损电阻（教学常用近似法）。
 *   R_fe = (1.5 · |E_phase|^2) / P_fe
 *   把铁损建模成一个并联在 dq 等效电路上的虚拟电阻，便于和电机模型集成。
 *
 * 适用：在电流环外环把 R_fe 串到 motorModelHd 的等效电路里，让电流环 PI 自动补偿。
 */
export function ironLossEquivalentResistance(loss: IronLossResult, flux: number): number {
  if (loss.total < 1e-6) return Infinity;
  const omega = loss.fElec * 2 * Math.PI;
  const ePhase = flux * omega; // BEMF 幅值近似
  return (1.5 * ePhase * ePhase) / loss.total;
}
