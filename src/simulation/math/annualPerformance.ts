/**
 * 全年能效 APF（Annual Performance Factor）评估器。
 *
 * APF = 全年累计制冷量 + 全年累计制热量  /  全年累计耗电
 * 中国 GB 21455 中房间空调能效等级（变频）：一级 ≥ 5.0、二级 ≥ 4.5、三级 ≥ 4.0。
 *
 * 教学目的：让学员看清"标定单工况 COP 高 ≠ APF 高"。
 *   - 部分负荷小时数远多于额定满载小时数；
 *   - 变频空调在部分负荷下降低转速、提高 COP，是 APF 占便宜的根本原因；
 *   - 不同气候带（北京/上海/广州/哈尔滨）制冷季 vs 制热季权重差异极大，
 *     同一台机器在不同城市 APF 可以差出 1 个等级。
 *
 * 简化建模思路：
 *   1) 把全年小时数离散到 8 个"温度 bin"——制冷季按室外温度，制热季按室外温度；
 *   2) 制冷工况：T_c = T_outdoor + 12（冷凝器逼近度），T_e = 7°C（蒸发器固定）；
 *   3) 制热工况（热泵反向运行）：T_c = 45°C（送风冷凝），T_e = T_outdoor - 8（除霜余量）；
 *   4) 部分负荷下变频降速 rpm = ratedRpm × max(0.3, partLoadFactor)；
 *      partLoadFactor 在最热/最冷点为 1.0，趋向中间室外温度时降到 0.3 左右；
 *   5) 调用 simulateCycle 拿到每个 bin 的 COP_bin 和 Q_bin；
 *   6) APF = Σ(Q × hours) / Σ(Q × hours / COP)。
 *
 * **注意**：bin 数据是"分布合理的教学版"，并非 GB 21455 / AHRI 210/240 标准 bin；
 * 真实工程认证请使用相应国标小时数和工况点。
 */

import type { Refrigerant } from './refrigerantProps';
import { simulateCycle } from './vaporCycle';

export type ClimateZone = 'beijing' | 'shanghai' | 'guangzhou' | 'harbin';

export interface Bin {
  /** 室外干球温度 (°C) */
  T: number;
  /** 该温度 bin 的全年小时数 */
  hours: number;
}

export interface Climate {
  cooling: Bin[];
  heating: Bin[];
  /** 制冷设计室外温度 (°C)，定义"100% 满载点" */
  designTempCool: number;
  /** 制热设计室外温度 (°C)，定义"100% 满载点"（越冷越满载） */
  designTempHeat: number;
  /** 城市中文名 */
  label: string;
}

/**
 * 4 个代表城市气候带。
 * 总小时数与中国典型气候资料量级一致：
 *   北京  制冷 ~750h / 制热 ~2100h（温带半干旱）
 *   上海  制冷 ~1500h / 制热 ~1100h（亚热带湿润）
 *   广州  制冷 ~3500h / 制热 ~50h（南亚热带，几乎不用制热）
 *   哈尔滨 制冷 ~300h / 制热 ~3500h（温带大陆性，制热为主）
 */
export const CLIMATES: Record<ClimateZone, Climate> = {
  beijing: {
    label: '北京',
    designTempCool: 35,
    designTempHeat: -7,
    cooling: [
      { T: 24, hours: 110 },
      { T: 26, hours: 150 },
      { T: 28, hours: 160 },
      { T: 30, hours: 130 },
      { T: 32, hours: 100 },
      { T: 34, hours: 60 },
      { T: 36, hours: 30 },
      { T: 38, hours: 10 },
    ],
    heating: [
      { T: -10, hours: 90 },
      { T: -7, hours: 200 },
      { T: -5, hours: 320 },
      { T: -3, hours: 420 },
      { T: 0, hours: 500 },
      { T: 3, hours: 350 },
      { T: 5, hours: 160 },
      { T: 7, hours: 60 },
    ],
  },
  shanghai: {
    label: '上海',
    designTempCool: 36,
    designTempHeat: -3,
    cooling: [
      { T: 26, hours: 280 },
      { T: 28, hours: 320 },
      { T: 30, hours: 300 },
      { T: 32, hours: 250 },
      { T: 34, hours: 180 },
      { T: 36, hours: 110 },
      { T: 38, hours: 50 },
      { T: 40, hours: 10 },
    ],
    heating: [
      { T: -5, hours: 30 },
      { T: -3, hours: 90 },
      { T: 0, hours: 200 },
      { T: 3, hours: 280 },
      { T: 5, hours: 240 },
      { T: 7, hours: 160 },
      { T: 9, hours: 80 },
      { T: 11, hours: 20 },
    ],
  },
  guangzhou: {
    label: '广州',
    designTempCool: 35,
    designTempHeat: 5,
    cooling: [
      { T: 26, hours: 700 },
      { T: 28, hours: 850 },
      { T: 30, hours: 800 },
      { T: 32, hours: 600 },
      { T: 34, hours: 350 },
      { T: 36, hours: 150 },
      { T: 38, hours: 40 },
      { T: 40, hours: 10 },
    ],
    heating: [
      { T: 0, hours: 2 },
      { T: 3, hours: 5 },
      { T: 5, hours: 8 },
      { T: 7, hours: 12 },
      { T: 10, hours: 10 },
      { T: 12, hours: 7 },
      { T: 15, hours: 4 },
      { T: 18, hours: 2 },
    ],
  },
  harbin: {
    label: '哈尔滨',
    designTempCool: 32,
    designTempHeat: -25,
    cooling: [
      { T: 22, hours: 60 },
      { T: 24, hours: 80 },
      { T: 26, hours: 70 },
      { T: 28, hours: 50 },
      { T: 30, hours: 25 },
      { T: 32, hours: 10 },
      { T: 34, hours: 4 },
      { T: 36, hours: 1 },
    ],
    heating: [
      { T: -25, hours: 250 },
      { T: -20, hours: 480 },
      { T: -15, hours: 700 },
      { T: -10, hours: 800 },
      { T: -5, hours: 650 },
      { T: 0, hours: 380 },
      { T: 3, hours: 180 },
      { T: 5, hours: 60 },
    ],
  },
};

export interface ApfParams {
  refrigerant: Refrigerant;
  zone: ClimateZone;
  /** 部分负荷曲线修正系数 0.6-1.05；越大越拉长部分负荷段、模拟更优秀的变频控制 */
  partLoadCurveCoeff: number;
  isentropicEff: number;
  displacementCc: number;
  clearanceRatio: number;
  /** 标定额定转速 rpm，制冷工况下用此 rpm 作为 100% 负荷点 */
  ratedRpm: number;
}

export interface ApfResult {
  apf: number;
  annualCooling_kWh: number;
  annualHeating_kWh: number;
  annualEnergy_kWh: number;
  copByBin: Array<{ T: number; cop: number; mode: 'cool' | 'heat'; hours: number }>;
  rating: '一级' | '二级' | '三级' | '低于三级';
  /** 标定工况 COP（制冷 35°C 标定点），用于"标定 vs APF"对比洞察 */
  designCop: number;
}

/** 限幅 helper */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 计算指定气候带和参数下的 APF。
 *
 * 实现：
 *   - 制冷 bin：T_c = T_outdoor + 12，T_e = 7；
 *     partLoad = (T_outdoor - 18) / (designTempCool - 18)，再乘 partLoadCurveCoeff；
 *   - 制热 bin：T_c = 45，T_e = T_outdoor - 8；
 *     partLoad = (designTempHeat ↔ 18 之间的线性映射，越冷越满载）；
 *   - rpm = ratedRpm × max(0.3, partLoad)；
 *   - 制冷量 Q_cool = simulateCycle.Qc，制热量 Q_heat = m_dot × (h2-h3) = Wcomp + Qc；
 *   - APF = Σ(Q × h) / Σ(Q × h / COP)。
 */
export function calculateAPF(p: ApfParams): ApfResult {
  const climate = CLIMATES[p.zone];
  const copByBin: ApfResult['copByBin'] = [];

  let sumQH_cool = 0;
  let sumE_cool = 0;
  let sumQH_heat = 0;
  let sumE_heat = 0;

  // —— 制冷季 —— //
  for (const bin of climate.cooling) {
    // 部分负荷因子：以 18°C 为"无需制冷"基线，到 designTempCool 拉满
    const span = climate.designTempCool - 18;
    const rawPL = span > 1 ? (bin.T - 18) / span : 1;
    const partLoad = clamp(rawPL * p.partLoadCurveCoeff, 0.3, 1.05);
    const rpm = p.ratedRpm * partLoad;

    const Tc = bin.T + 12;     // 冷凝逼近度 ~12K
    const Te = 7;              // 蒸发器维持 7°C，控制蒸发压力恒定

    const cycle = simulateCycle({
      refrigerant: p.refrigerant,
      Te, Tc,
      superheatK: 5,
      subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });

    // 部分负荷下 COP 通常会比满载高（变频优势），这里用一个温和的 buff
    // η_partload ≈ 1 + 0.15 × (1 - partLoad)，0.3 负荷时 ≈ +10%
    const partLoadBoost = 1 + 0.15 * (1 - partLoad);
    const copEff = cycle.cop * partLoadBoost;

    const Q_kW = cycle.Qc;
    const energy_kWh = bin.hours * (Q_kW / Math.max(1e-3, copEff));
    const cool_kWh = bin.hours * Q_kW;

    sumQH_cool += cool_kWh;
    sumE_cool += energy_kWh;

    copByBin.push({ T: bin.T, cop: copEff, mode: 'cool', hours: bin.hours });
  }

  // —— 制热季（热泵反向运行）—— //
  for (const bin of climate.heating) {
    // 部分负荷因子：以 18°C 为"无需制热"基线，到 designTempHeat 拉满（越冷越满载）
    const span = 18 - climate.designTempHeat;
    const rawPL = span > 1 ? (18 - bin.T) / span : 1;
    const partLoad = clamp(rawPL * p.partLoadCurveCoeff, 0.3, 1.05);
    const rpm = p.ratedRpm * partLoad;

    const Tc = 45;                  // 室内冷凝器固定送风
    const Te = bin.T - 8;           // 室外蒸发器低于室外温度 8K

    const cycle = simulateCycle({
      refrigerant: p.refrigerant,
      Te, Tc,
      superheatK: 5,
      subcoolK: 3,
      displacementCc: p.displacementCc,
      clearanceRatio: p.clearanceRatio,
      rpm,
      isentropicEff: p.isentropicEff,
      eevOpening: 0.55,
    });

    // 制热量 Q_heat = m_dot × (h2-h3) = Wcomp + Qc
    const Q_heat_kW = cycle.Wcomp + cycle.Qc;
    const cop_heat = cycle.Wcomp > 1e-6 ? Q_heat_kW / cycle.Wcomp : 0;

    // 极低温（< -10°C）有除霜损失，COP 再打 0.85 折
    const defrostFactor = bin.T < -10 ? 0.85 : bin.T < -5 ? 0.92 : 1.0;
    const partLoadBoost = 1 + 0.12 * (1 - partLoad);
    const copEff = cop_heat * defrostFactor * partLoadBoost;

    const heat_kWh = bin.hours * Q_heat_kW;
    const energy_kWh = bin.hours * (Q_heat_kW / Math.max(1e-3, copEff));

    sumQH_heat += heat_kWh;
    sumE_heat += energy_kWh;

    copByBin.push({ T: bin.T, cop: copEff, mode: 'heat', hours: bin.hours });
  }

  const annualCooling_kWh = sumQH_cool;
  const annualHeating_kWh = sumQH_heat;
  const annualEnergy_kWh = sumE_cool + sumE_heat;
  const apf = annualEnergy_kWh > 1e-3
    ? (annualCooling_kWh + annualHeating_kWh) / annualEnergy_kWh
    : 0;

  // 标定工况：T_outdoor = designTempCool，制冷满载，作为"铭牌 COP"对比
  const designCycle = simulateCycle({
    refrigerant: p.refrigerant,
    Te: 7,
    Tc: climate.designTempCool + 12,
    superheatK: 5,
    subcoolK: 3,
    displacementCc: p.displacementCc,
    clearanceRatio: p.clearanceRatio,
    rpm: p.ratedRpm,
    isentropicEff: p.isentropicEff,
    eevOpening: 0.55,
  });
  const designCop = designCycle.cop;

  let rating: ApfResult['rating'];
  if (apf >= 5.0) rating = '一级';
  else if (apf >= 4.5) rating = '二级';
  else if (apf >= 4.0) rating = '三级';
  else rating = '低于三级';

  return {
    apf,
    annualCooling_kWh,
    annualHeating_kWh,
    annualEnergy_kWh,
    copByBin,
    rating,
    designCop,
  };
}
