/**
 * 季节性能与化霜模型（产线变频器工程师视角）。
 *
 * 本模块在 vaporCycle / refrigerantProps 的稳态压缩循环之上叠加了 4 层"产线工程师才会关心"的模型：
 *
 *   1. SEER / SCOP   ：按 EU 标准 EN 14825 与中国 GB 21455 的"温度 bin × 小时数"框架，
 *                      把每个室外干球温度 bin 的稳态 COP 加权汇总，得到一台铭牌上能写的季节能效。
 *
 *   2. 化霜时序       ：北方冬天 -5°C 70%RH 工况下蒸发器结霜，霜层增厚导致换热恶化、压差升高；
 *                      触发化霜后短暂反向循环（吸室内热融霜）让 COP 跌到 ~0.6，结束后立即恢复。
 *
 *   3. 部分负载效率   ：以负载率 PLR 为 X 轴，对比定频空调（启停滞环、低 PLR COP 暴跌）
 *                      与变频空调（调速比线性追踪、低 PLR COP 反而最高）两条曲线。
 *
 *   4. 四象限状态机   ：制冷 / 制热 / 化霜 / 除湿 4 种工作模式的切换条件与瞬态；
 *                      四通阀切换的 0.5 s 内排气压力骤变与 EEV 重新对齐过程。
 *
 * 这些模型都是教学级的近似——本模块明确不替代 GB 21455 检测、AHRI 210/240 实测，
 * 用途是让初/中级工程师对"为什么变频铭牌 SEER 6+ 而稳态 COP 才 3"建立直觉。
 *
 * 所有函数都是纯函数，不依赖 Zustand / React，方便在 Node 单测与 STM32 仿真桥接器复用。
 */

import { simulateCycle } from './vaporCycle';
import type { Refrigerant } from './refrigerantProps';

// ───────────────────────────────────────────────────────────────
// 1) SEER / SCOP —— 季节能效
// ───────────────────────────────────────────────────────────────

/**
 * EN 14825 + GB 21455 风格的简化室外温度 bin（11 段：-10..45°C，每 5K 一格）。
 *
 * 实际标准把制冷和制热分两套 bin（制冷集中在 16-35°C，制热集中在 -10..12°C），
 * 但产线工程师常用的"一张图看 SEER 怎么来"通常把两者画在同一 X 轴上。
 *
 * cooling/heating hours：示意值，量级与 EN 14825 平均气候带 (Average climate) 一致。
 */
const TEMP_BINS_C = [-10, -7, -5, -3, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45] as const;
export type SeasonMode = 'cool' | 'heat';

/** 各温度 bin 的运行小时（采用 EN 14825 平均气候等效分布） */
const HOURS_COOL: Record<number, number> = {
  20: 200, 25: 320, 30: 480, 35: 350, 40: 130, 45: 40,
};
const HOURS_HEAT: Record<number, number> = {
  [-10]: 90, [-7]: 200, [-5]: 320, [-3]: 420, 0: 500, 5: 350, 10: 160, 15: 60,
};

export interface SeasonalBin {
  /** 室外干球温度 °C */
  T: number;
  /** 模式：制冷 / 制热 */
  mode: SeasonMode;
  /** 全年运行小时 h/year */
  hours: number;
  /** 该 bin 稳态 COP（含部分负荷修正） */
  cop: number;
  /** 该 bin 单台机制冷/热量 kW */
  capacityKw: number;
  /** 该 bin 全年贡献能量 kWh */
  energyKwh: number;
  /** 该 bin 全年耗电 kWh */
  consumptionKwh: number;
}

export interface SeasonalInput {
  refrigerant: Refrigerant;
  isentropicEff: number;
  displacementCc: number;
  clearanceRatio: number;
  ratedRpm: number;
  /** 包络下限 rpm，定频/变频的差异主要由这个值决定 */
  minRpm: number;
  /** part-load efficiency boost：部分负荷下 COP 相对于满载的提升系数 0..0.25 */
  partLoadBoost: number;
}

export interface SeasonalResult {
  bins: SeasonalBin[];
  /** SEER（制冷季）= ΣQ_c·h / ΣE_c */
  seer: number;
  /** SCOP（制热季）= ΣQ_h·h / ΣE_h */
  scop: number;
  /** GB 21455 综合 APF（季节能效）= (ΣQ_c·h + ΣQ_h·h) / (ΣE_c + ΣE_h) */
  apf: number;
  /** 标定 COP（制冷 35°C 满载） */
  designCop: number;
  /** 标准能效等级（GB 21455 变频机：一级 ≥ 5.0 / 二级 ≥ 4.5 / 三级 ≥ 4.0） */
  rating: '一级' | '二级' | '三级' | '低于三级';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 计算季节能效（SEER / SCOP / APF）。
 *
 * 关键近似：
 *   - 制冷季：T_c = T_outdoor + 12K，T_e = 7°C 保持恒定；
 *     PLR = (T_outdoor - 18) / (35 - 18)，越靠近设计点越满载；
 *   - 制热季：T_c = 45°C，T_e = T_outdoor - 8K；
 *     PLR = (18 - T_outdoor) / (18 - (-10))，越冷越满载；
 *   - 转速 rpm = ratedRpm × max(minRpm/ratedRpm, PLR)；
 *   - 部分负荷下 COP 加成：1 + partLoadBoost × (1 - PLR)；
 *   - 制热季 < -7°C 的 bin 额外乘以 0.85 化霜损失。
 */
export function calculateSeasonalPerformance(p: SeasonalInput): SeasonalResult {
  const bins: SeasonalBin[] = [];

  let qcHours = 0, eCool = 0;
  let qhHours = 0, eHeat = 0;

  // —— 制冷季 —— //
  for (const bin of Object.keys(HOURS_COOL).map(Number)) {
    const hours = HOURS_COOL[bin];
    const plr = clamp((bin - 18) / (35 - 18), 0.3, 1.05);
    const rpm = clamp(p.ratedRpm * plr, p.minRpm, p.ratedRpm * 1.1);

    const cycle = simulateCycle({
      refrigerant: p.refrigerant,
      Te: 7,
      Tc: bin + 12,
      superheatK: 5,
      subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });

    const copEff = cycle.cop * (1 + p.partLoadBoost * (1 - plr));
    const Q = cycle.Qc;
    const E = Q / Math.max(1e-3, copEff);

    qcHours += Q * hours;
    eCool += E * hours;
    bins.push({
      T: bin, mode: 'cool', hours, cop: copEff,
      capacityKw: Q, energyKwh: Q * hours, consumptionKwh: E * hours,
    });
  }

  // —— 制热季 —— //
  for (const bin of Object.keys(HOURS_HEAT).map(Number)) {
    const hours = HOURS_HEAT[bin];
    const plr = clamp((18 - bin) / (18 - (-10)), 0.3, 1.05);
    const rpm = clamp(p.ratedRpm * plr, p.minRpm, p.ratedRpm * 1.1);

    const cycle = simulateCycle({
      refrigerant: p.refrigerant,
      Te: bin - 8,
      Tc: 45,
      superheatK: 5,
      subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });

    // 制热量 Q_heat = W_comp + Q_c
    const Q = cycle.Wcomp + cycle.Qc;
    const copHeat = cycle.Wcomp > 1e-6 ? Q / cycle.Wcomp : 0;
    const defrostLoss = bin < -7 ? 0.85 : bin < -3 ? 0.93 : 1.0;
    const copEff = copHeat * defrostLoss * (1 + p.partLoadBoost * (1 - plr));
    const E = Q / Math.max(1e-3, copEff);

    qhHours += Q * hours;
    eHeat += E * hours;
    bins.push({
      T: bin, mode: 'heat', hours, cop: copEff,
      capacityKw: Q, energyKwh: Q * hours, consumptionKwh: E * hours,
    });
  }

  bins.sort((a, b) => a.T - b.T);

  const seer = eCool > 1e-3 ? qcHours / eCool : 0;
  const scop = eHeat > 1e-3 ? qhHours / eHeat : 0;
  const apf = (eCool + eHeat) > 1e-3 ? (qcHours + qhHours) / (eCool + eHeat) : 0;

  // 设计点 COP（35°C 制冷满载）
  const designCycle = simulateCycle({
    refrigerant: p.refrigerant,
    Te: 7, Tc: 47,
    superheatK: 5, subcoolK: 3,
    displacementCc: p.displacementCc,
    clearanceRatio: p.clearanceRatio,
    rpm: p.ratedRpm,
    isentropicEff: p.isentropicEff,
    eevOpening: 0.55,
  });

  let rating: SeasonalResult['rating'];
  if (apf >= 5.0) rating = '一级';
  else if (apf >= 4.5) rating = '二级';
  else if (apf >= 4.0) rating = '三级';
  else rating = '低于三级';

  return { bins, seer, scop, apf, designCop: designCycle.cop, rating };
}

/** 暴露给 UI 的温度 bin 列表（用于轴刻度），不含 capacity/cop 信息 */
export function listSeasonalTempBins(): readonly number[] {
  return TEMP_BINS_C;
}

// ───────────────────────────────────────────────────────────────
// 2) 化霜时序 + 霜层模型
// ───────────────────────────────────────────────────────────────

export type DefrostMode = 'reverse-cycle' | 'electric-heat';
export type DefrostTrigger = 'temp-diff' | 'time';

export interface DefrostInput {
  /** 室外干球 °C（典型化霜区：-7..5） */
  outdoorC: number;
  /** 相对湿度 0..1 */
  rh: number;
  /** 霜层增厚速率 mm/h（外界 -5°C 70%RH 典型 0.6 mm/h） */
  frostRateMmPerHour: number;
  /** 触发策略：温差阈 (蒸发器表面 vs 蒸发饱和温度 ΔT > 阈值) 或 时间阈 */
  trigger: DefrostTrigger;
  /** 温差阈值 K （当 trigger='temp-diff'） */
  tempDiffThresholdK: number;
  /** 时间阈值 min（当 trigger='time'） */
  timeThresholdMin: number;
  /** 化霜模式：反向循环 / 电加热 */
  mode: DefrostMode;
  /** 仿真总时长 min */
  totalMin: number;
  /** 步长 s */
  dtSec: number;
  /** 制热季稳态 COP（化霜结束后恢复到此值） */
  steadyCop: number;
}

export interface DefrostSample {
  /** 时刻 min */
  tMin: number;
  /** 霜层厚度 mm */
  frostMm: number;
  /** 蒸发器表面-饱和温度差 K （结霜恶化指标） */
  deltaT_K: number;
  /** 当前 COP */
  cop: number;
  /** 当前模式 */
  state: 'heat' | 'defrost';
  /** 化霜瞬时是否在反向工况 */
  reversing: boolean;
}

export interface DefrostResult {
  samples: DefrostSample[];
  /** 第一次触发化霜的时刻 min（null 表示整个仿真期未触发） */
  firstDefrostMin: number | null;
  /** 化霜次数 */
  defrostCount: number;
  /** 化霜期累计能量损失 kWh （以单台 3 kW 制热为基准） */
  defrostEnergyLossKwh: number;
  /** 该工况下"等效 COP" = 加权后包含化霜损失的整体 COP */
  effectiveCop: number;
}

/**
 * 蒸发器结霜 + 化霜启动时序仿真。
 *
 * 模型：
 *   - 霜层 frostMm(t) 按 frostRateMmPerHour × rhFactor × tempFactor 线性增长；
 *   - 霜层 ΔT = frostMm × 0.8  （0.8K/mm，霜层热阻折算）；
 *   - 触发条件：
 *       temp-diff：ΔT > tempDiffThresholdK
 *       time    ：累计制热时间 > timeThresholdMin
 *   - 化霜进行 4 min：
 *       reverse-cycle：四通阀反向，COP 暂时 0.6（吸室内热融霜）
 *       electric-heat：电加热 + 风机停转，COP 0.0（纯加热不产生制热量）
 *   - 化霜结束后霜层归零，重新进入累积。
 */
export function simulateDefrost(p: DefrostInput): DefrostResult {
  const samples: DefrostSample[] = [];
  const dtMin = p.dtSec / 60;
  const steps = Math.ceil(p.totalMin / dtMin);

  // 单台基准 3 kW 制热量、ratedW = 3000 / COP
  const Q_heat_kW = 3.0;

  // 湿度与温度修正：RH 高、温度低 → 霜层加速
  const rhFactor = 0.5 + Math.max(0, Math.min(1, p.rh)) * 1.0;        // 0..1.5
  const tempFactor = clamp((0 - p.outdoorC) / 10 + 0.5, 0.3, 1.5);    // 越冷越快

  const baseRateMmPerStep = (p.frostRateMmPerHour / 60) * dtMin * rhFactor * tempFactor;

  // 状态机
  let frost = 0;
  let state: 'heat' | 'defrost' = 'heat';
  let defrostElapsedMin = 0;
  let heatElapsedMin = 0;
  let defrostCount = 0;
  let firstDefrostMin: number | null = null;
  let energyLossKwh = 0;
  let totalEnergyInKwh = 0;
  let totalHeatOutKwh = 0;

  for (let i = 0; i <= steps; i += 1) {
    const tMin = i * dtMin;

    // —— 1) 先做状态机迁移（基于上一帧的累积量） —— //
    if (state === 'heat') {
      const deltaT = frost * 0.8;
      const shouldTrigger = p.trigger === 'temp-diff'
        ? deltaT > p.tempDiffThresholdK
        : heatElapsedMin >= p.timeThresholdMin;
      if (shouldTrigger) {
        state = 'defrost';
        defrostElapsedMin = 0;
        defrostCount += 1;
        if (firstDefrostMin === null) firstDefrostMin = tMin;
      }
    } else if (defrostElapsedMin >= 4) {
      state = 'heat';
      heatElapsedMin = 0;
      frost = 0;
      defrostElapsedMin = 0;
    }

    // —— 2) 推进物理状态 + 计算当前帧 COP —— //
    let cop = p.steadyCop;
    let reversing = false;

    if (state === 'heat') {
      frost += baseRateMmPerStep;
      cop = p.steadyCop * Math.max(0.4, 1 - frost * 0.05);
      heatElapsedMin += dtMin;
    } else {
      // 化霜中：4 min，期间 COP 跌到 0.6（反向循环）或 0.0（电加热）
      cop = p.mode === 'reverse-cycle' ? 0.6 : 0.0;
      reversing = p.mode === 'reverse-cycle';
      defrostElapsedMin += dtMin;
      frost = Math.max(0, frost - 0.6 * dtMin);
    }

    samples.push({
      tMin,
      frostMm: frost,
      deltaT_K: frost * 0.8,
      cop,
      state,
      reversing,
    });

    // —— 3) 能量统计 —— //
    if (state === 'heat') {
      totalHeatOutKwh += Q_heat_kW * (dtMin / 60);
      totalEnergyInKwh += (Q_heat_kW / Math.max(0.4, cop)) * (dtMin / 60);
    } else {
      const drawKw = p.mode === 'electric-heat' ? 3.0 : 1.5;
      totalEnergyInKwh += drawKw * (dtMin / 60);
      energyLossKwh += drawKw * (dtMin / 60);
      if (p.mode === 'reverse-cycle') {
        totalHeatOutKwh -= 1.0 * (dtMin / 60);
      }
    }
  }

  const effectiveCop = totalEnergyInKwh > 1e-6
    ? Math.max(0, totalHeatOutKwh) / totalEnergyInKwh
    : 0;

  return { samples, firstDefrostMin, defrostCount, defrostEnergyLossKwh: energyLossKwh, effectiveCop };
}

// ───────────────────────────────────────────────────────────────
// 3) 部分负载效率 —— 定频 vs 变频
// ───────────────────────────────────────────────────────────────

export interface PartLoadInput {
  refrigerant: Refrigerant;
  isentropicEff: number;
  displacementCc: number;
  clearanceRatio: number;
  /** 额定转速（满载）rpm */
  ratedRpm: number;
  /** 变频电机最小转速 rpm */
  minRpm: number;
  /** 启停滞环宽度（定频）—— PLR 低于此值时定频频繁启停 COP 折损 */
  cyclingPenaltyPlr: number;
  /** 调速比 = ratedRpm / minRpm，影响变频"贴着负载"的能力 */
  variableSpeedRatio: number;
}

export interface PartLoadSample {
  /** 负载率 PLR 0..1.2 */
  plr: number;
  /** 定频 COP */
  copFixed: number;
  /** 变频 COP */
  copInverter: number;
  /** 定频转速 rpm */
  rpmFixed: number;
  /** 变频转速 rpm */
  rpmInverter: number;
}

export interface PartLoadResult {
  samples: PartLoadSample[];
  /** 定频整年平均（按 PLR 均匀分布近似） */
  avgCopFixed: number;
  /** 变频整年平均 */
  avgCopInverter: number;
  /** 变频对定频的整年能效提升百分比 */
  improvementPercent: number;
}

/**
 * 部分负载效率扫描。
 *
 * 模型：
 *   - PLR 取 0.1..1.2 共 12 个点；
 *   - 定频空调：rpm 锁死在 ratedRpm，PLR<1 时通过启停占空比降功率；
 *     启停损失 ≈ max(0, (cyclingPenaltyPlr - PLR) / cyclingPenaltyPlr) × 0.4
 *     （PLR=0.1 → 损失 ~36%，PLR=0.5 → 损失 0%）
 *   - 变频空调：rpm = clamp(ratedRpm × PLR, minRpm, ratedRpm × 1.1)，
 *     部分负荷下压缩比降低、容积效率提升，COP 比满载更高（典型 +15%~+25%）。
 */
export function simulatePartLoad(p: PartLoadInput): PartLoadResult {
  const samples: PartLoadSample[] = [];
  const plrs: number[] = [];
  for (let plr = 0.1; plr <= 1.205; plr += 0.1) plrs.push(Number(plr.toFixed(2)));

  let sumFixed = 0, sumInv = 0;

  for (const plr of plrs) {
    // 共用工况：T_e = 7 / T_c = 35 + 12 = 47 （AHRI A 工况附近）
    const Tc = 47;
    const Te = 7;

    // —— 定频：rpm 锁定，启停占空比降低有效制冷量 + 启停损失 ——
    const rpmFixed = p.ratedRpm;
    const cycleFixed = simulateCycle({
      refrigerant: p.refrigerant,
      Te, Tc,
      superheatK: 5, subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm: rpmFixed,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });
    const cyclingLoss = Math.max(0, (p.cyclingPenaltyPlr - plr) / Math.max(0.05, p.cyclingPenaltyPlr)) * 0.4;
    const copFixed = cycleFixed.cop * Math.max(0.3, 1 - cyclingLoss);

    // —— 变频：rpm 跟随 PLR，调速比影响最小转速 ——
    const effMinRpm = p.ratedRpm / Math.max(1.5, p.variableSpeedRatio);
    const rpmInv = clamp(p.ratedRpm * plr, effMinRpm, p.ratedRpm * 1.1);
    const cycleInv = simulateCycle({
      refrigerant: p.refrigerant,
      Te, Tc,
      superheatK: 5, subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm: rpmInv,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });
    const plrEffective = rpmInv / p.ratedRpm;
    const copInv = cycleInv.cop * (1 + 0.22 * (1 - plrEffective));

    samples.push({ plr, copFixed, copInverter: copInv, rpmFixed, rpmInverter: rpmInv });
    sumFixed += copFixed;
    sumInv += copInv;
  }

  const avgFixed = sumFixed / samples.length;
  const avgInv = sumInv / samples.length;

  return {
    samples,
    avgCopFixed: avgFixed,
    avgCopInverter: avgInv,
    improvementPercent: avgFixed > 1e-3 ? ((avgInv - avgFixed) / avgFixed) * 100 : 0,
  };
}

// ───────────────────────────────────────────────────────────────
// 4) 四象限工况状态机
// ───────────────────────────────────────────────────────────────

export type QuadrantMode = 'cooling' | 'heating' | 'defrost' | 'dehumid';

export interface QuadrantTransition {
  /** 切换持续时间 s */
  durationSec: number;
  /** 四通阀是否切换（cooling↔heating / defrost 涉及） */
  fourWayValveSwitch: boolean;
  /** EEV 重新对齐目标开度变化 0..1 */
  eevTargetDelta: number;
  /** 风机方向变化（化霜可能反风） */
  fanReversed: boolean;
}

/** 模式切换规则表：from → to 的切换语义 */
export const QUADRANT_TRANSITIONS: Record<string, QuadrantTransition> = {
  'cooling->heating': { durationSec: 0.5, fourWayValveSwitch: true, eevTargetDelta: 0.2, fanReversed: false },
  'heating->cooling': { durationSec: 0.5, fourWayValveSwitch: true, eevTargetDelta: 0.2, fanReversed: false },
  'heating->defrost': { durationSec: 0.4, fourWayValveSwitch: true, eevTargetDelta: 0.35, fanReversed: true },
  'defrost->heating': { durationSec: 0.4, fourWayValveSwitch: true, eevTargetDelta: 0.35, fanReversed: false },
  'cooling->dehumid': { durationSec: 0.2, fourWayValveSwitch: false, eevTargetDelta: -0.15, fanReversed: false },
  'dehumid->cooling': { durationSec: 0.2, fourWayValveSwitch: false, eevTargetDelta: 0.15, fanReversed: false },
};

export interface QuadrantTransientSample {
  /** 时刻 s（0 = 切换前 0.2 s） */
  tSec: number;
  /** 排气压力 P_d MPa */
  Pd: number;
  /** 吸气压力 P_s MPa */
  Ps: number;
  /** EEV 当前开度 0..1 */
  eev: number;
  /** 阶段：steady-old / valve-switch / eev-realign / steady-new */
  stage: 'steady-old' | 'valve-switch' | 'eev-realign' | 'steady-new';
}

export interface QuadrantTransientInput {
  from: QuadrantMode;
  to: QuadrantMode;
  /** 切换前稳态 Pd MPa */
  PdOld: number;
  /** 切换前稳态 Ps MPa */
  PsOld: number;
  /** 切换前 EEV 开度 0..1 */
  eevOld: number;
  /** 切换后稳态 Pd MPa */
  PdNew: number;
  /** 切换后稳态 Ps MPa */
  PsNew: number;
  /** 切换后 EEV 开度 0..1 */
  eevNew: number;
}

/**
 * 模式切换瞬态仿真。
 *
 *   - 切换前 0.2 s 稳态
 *   - 切换瞬间四通阀反向 → Pd / Ps 在 ~0.3-0.5 s 内做"冲击式"反转
 *   - EEV 重新对齐 0.5-1.5 s（阀步进电机有最大步速）
 *   - 之后回到 steady-new
 *
 * 教学价值：解释空调"模式切换"时那 1-2 秒为什么会有"咔哒"声、为什么排气压力短暂超出包线。
 */
export function simulateQuadrantTransient(p: QuadrantTransientInput): QuadrantTransientSample[] {
  const samples: QuadrantTransientSample[] = [];
  const dtSec = 0.02;
  const totalSec = 2.5;

  const valveStart = 0.2;
  const trans = QUADRANT_TRANSITIONS[`${p.from}->${p.to}`];
  const valveDur = trans?.durationSec ?? 0.5;
  const valveEnd = valveStart + valveDur;
  const eevEnd = valveEnd + 1.0;  // EEV 1.0 s 重新对齐

  // 切换瞬态：Pd 在阀切换瞬间冲击式向 PdNew 跨越，且会过冲 30%
  const PdOvershoot = p.PdNew + (p.PdNew - p.PdOld) * 0.3;
  const PsOvershoot = p.PsNew - (p.PsNew - p.PsOld) * 0.3;

  for (let t = 0; t <= totalSec + 1e-9; t += dtSec) {
    let Pd = p.PdOld, Ps = p.PsOld, eev = p.eevOld;
    let stage: QuadrantTransientSample['stage'] = 'steady-old';

    if (t < valveStart) {
      // steady-old
    } else if (t < valveEnd) {
      // 四通阀切换瞬态：用 1-cos 平滑插值 + 过冲
      const u = (t - valveStart) / valveDur;
      const ease = (1 - Math.cos(u * Math.PI)) * 0.5;
      Pd = p.PdOld + (PdOvershoot - p.PdOld) * ease;
      Ps = p.PsOld + (PsOvershoot - p.PsOld) * ease;
      eev = p.eevOld;
      stage = 'valve-switch';
    } else if (t < eevEnd) {
      // EEV 对齐 + Pd/Ps 收敛
      const u = (t - valveEnd) / (eevEnd - valveEnd);
      const ease = 1 - Math.exp(-3 * u); // 一阶滞后
      Pd = PdOvershoot + (p.PdNew - PdOvershoot) * ease;
      Ps = PsOvershoot + (p.PsNew - PsOvershoot) * ease;
      eev = p.eevOld + (p.eevNew - p.eevOld) * ease;
      stage = 'eev-realign';
    } else {
      Pd = p.PdNew;
      Ps = p.PsNew;
      eev = p.eevNew;
      stage = 'steady-new';
    }

    samples.push({ tSec: Number(t.toFixed(3)), Pd, Ps, eev, stage });
  }

  return samples;
}

/** 给定一个模式，返回它在象限盘上的角度（0..2π，counterclockwise from 制冷） */
export function quadrantAngle(mode: QuadrantMode): number {
  switch (mode) {
    case 'cooling': return -Math.PI / 4;          // 右上
    case 'heating': return Math.PI / 4 * 3;       // 左上
    case 'defrost': return Math.PI / 4 * 5;       // 左下
    case 'dehumid': return -Math.PI / 4 * 3;      // 右下（同 -135°+360°）
  }
}
