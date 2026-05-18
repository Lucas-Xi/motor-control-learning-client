import { describe, expect, it } from 'vitest';
import {
  calculateSeasonalPerformance,
  simulateDefrost,
  simulatePartLoad,
  simulateQuadrantTransient,
  quadrantAngle,
  type SeasonalInput,
  type DefrostInput,
  type PartLoadInput,
} from '../seasonalPerformance';

const seasonalBase: SeasonalInput = {
  refrigerant: 'R32',
  isentropicEff: 0.7,
  displacementCc: 12,
  clearanceRatio: 0.05,
  ratedRpm: 4500,
  minRpm: 1200,
  partLoadBoost: 0.18,
};

describe('calculateSeasonalPerformance', () => {
  it('SEER / SCOP / APF 三个指标都 > 0 且为有限值', () => {
    const r = calculateSeasonalPerformance(seasonalBase);
    expect(r.seer).toBeGreaterThan(0);
    expect(r.scop).toBeGreaterThan(0);
    expect(r.apf).toBeGreaterThan(0);
    expect(Number.isFinite(r.seer)).toBe(true);
    expect(Number.isFinite(r.scop)).toBe(true);
    expect(Number.isFinite(r.apf)).toBe(true);
  });

  it('APF 应介于 SCOP 和 SEER 之间（按制冷/制热加权）', () => {
    const r = calculateSeasonalPerformance(seasonalBase);
    const lo = Math.min(r.seer, r.scop);
    const hi = Math.max(r.seer, r.scop);
    expect(r.apf).toBeGreaterThanOrEqual(lo - 0.5);
    expect(r.apf).toBeLessThanOrEqual(hi + 0.5);
  });

  it('partLoadBoost 提高 → APF 提高', () => {
    const low = calculateSeasonalPerformance({ ...seasonalBase, partLoadBoost: 0.05 });
    const high = calculateSeasonalPerformance({ ...seasonalBase, partLoadBoost: 0.22 });
    expect(high.apf).toBeGreaterThan(low.apf);
  });

  it('bin 列表覆盖制冷季 + 制热季两段（>=12 个）', () => {
    const r = calculateSeasonalPerformance(seasonalBase);
    expect(r.bins.length).toBeGreaterThanOrEqual(12);
    expect(r.bins.some((b) => b.mode === 'cool')).toBe(true);
    expect(r.bins.some((b) => b.mode === 'heat')).toBe(true);
  });

  it('rating 必为 4 种之一', () => {
    const r = calculateSeasonalPerformance(seasonalBase);
    expect(['一级', '二级', '三级', '低于三级']).toContain(r.rating);
  });
});

const defrostBase: DefrostInput = {
  outdoorC: -5,
  rh: 0.7,
  frostRateMmPerHour: 4.0,
  trigger: 'temp-diff',
  tempDiffThresholdK: 3,
  timeThresholdMin: 30,
  mode: 'reverse-cycle',
  totalMin: 90,
  dtSec: 5,
  steadyCop: 3.2,
};

describe('simulateDefrost', () => {
  it('结霜累积后会触发化霜', () => {
    const r = simulateDefrost(defrostBase);
    expect(r.defrostCount).toBeGreaterThan(0);
    expect(r.firstDefrostMin).not.toBeNull();
    expect(r.firstDefrostMin).toBeGreaterThan(0);
  });

  it('化霜模式电加热的等效 COP 低于反向循环', () => {
    const electric = simulateDefrost({ ...defrostBase, mode: 'electric-heat' });
    const reverse = simulateDefrost({ ...defrostBase, mode: 'reverse-cycle' });
    expect(reverse.effectiveCop).toBeGreaterThan(electric.effectiveCop);
  });

  it('湿度越高 → 化霜更频繁', () => {
    const dry = simulateDefrost({ ...defrostBase, rh: 0.2, totalMin: 120 });
    const wet = simulateDefrost({ ...defrostBase, rh: 0.95, totalMin: 120 });
    expect(wet.defrostCount).toBeGreaterThanOrEqual(dry.defrostCount);
  });

  it('time 触发阈值放宽 → 化霜次数减少', () => {
    const fast = simulateDefrost({ ...defrostBase, trigger: 'time', timeThresholdMin: 15 });
    const slow = simulateDefrost({ ...defrostBase, trigger: 'time', timeThresholdMin: 60 });
    expect(fast.defrostCount).toBeGreaterThan(slow.defrostCount);
  });

  it('化霜阶段 cop 跌到 0.6 (反向循环) 或 0 (电加热)', () => {
    const r = simulateDefrost(defrostBase);
    const defrostSamples = r.samples.filter((s) => s.state === 'defrost');
    expect(defrostSamples.length).toBeGreaterThan(0);
    for (const s of defrostSamples) {
      expect(s.cop).toBeLessThanOrEqual(0.65);
    }
  });
});

const plBase: PartLoadInput = {
  refrigerant: 'R32',
  isentropicEff: 0.7,
  displacementCc: 12,
  clearanceRatio: 0.05,
  ratedRpm: 4500,
  minRpm: 1200,
  cyclingPenaltyPlr: 0.45,
  variableSpeedRatio: 3.0,
};

describe('simulatePartLoad', () => {
  it('变频整体 COP > 定频整体 COP', () => {
    const r = simulatePartLoad(plBase);
    expect(r.avgCopInverter).toBeGreaterThan(r.avgCopFixed);
    expect(r.improvementPercent).toBeGreaterThan(0);
  });

  it('低 PLR 下定频 COP 显著低于变频', () => {
    const r = simulatePartLoad(plBase);
    const lowPLR = r.samples.find((s) => Math.abs(s.plr - 0.2) < 1e-3);
    expect(lowPLR).toBeDefined();
    if (lowPLR) {
      expect(lowPLR.copInverter).toBeGreaterThan(lowPLR.copFixed);
    }
  });

  it('变频转速跟随 PLR 变化', () => {
    const r = simulatePartLoad(plBase);
    const lo = r.samples[0];
    const hi = r.samples[r.samples.length - 1];
    expect(hi.rpmInverter).toBeGreaterThan(lo.rpmInverter);
  });

  it('定频转速锁定在 ratedRpm', () => {
    const r = simulatePartLoad(plBase);
    for (const s of r.samples) {
      expect(s.rpmFixed).toBe(plBase.ratedRpm);
    }
  });

  it('cyclingPenalty 增大 → 定频 COP 进一步下滑', () => {
    const mild = simulatePartLoad({ ...plBase, cyclingPenaltyPlr: 0.2 });
    const severe = simulatePartLoad({ ...plBase, cyclingPenaltyPlr: 0.7 });
    expect(mild.avgCopFixed).toBeGreaterThan(severe.avgCopFixed);
  });
});

describe('simulateQuadrantTransient', () => {
  it('包含四个阶段：steady-old / valve-switch / eev-realign / steady-new', () => {
    const samples = simulateQuadrantTransient({
      from: 'cooling', to: 'heating',
      PdOld: 2.8, PsOld: 0.9,
      eevOld: 0.55,
      PdNew: 2.6, PsNew: 0.45,
      eevNew: 0.7,
    });
    const stages = new Set(samples.map((s) => s.stage));
    expect(stages.has('steady-old')).toBe(true);
    expect(stages.has('valve-switch')).toBe(true);
    expect(stages.has('eev-realign')).toBe(true);
    expect(stages.has('steady-new')).toBe(true);
  });

  it('最后样本应回到 PdNew / PsNew', () => {
    const samples = simulateQuadrantTransient({
      from: 'cooling', to: 'heating',
      PdOld: 2.8, PsOld: 0.9,
      eevOld: 0.55,
      PdNew: 2.6, PsNew: 0.45,
      eevNew: 0.7,
    });
    const last = samples[samples.length - 1];
    expect(Math.abs(last.Pd - 2.6)).toBeLessThan(0.05);
    expect(Math.abs(last.Ps - 0.45)).toBeLessThan(0.05);
    expect(Math.abs(last.eev - 0.7)).toBeLessThan(0.05);
  });

  it('阀切换瞬间存在过冲（Pd 短暂超过两端稳态最大值）', () => {
    const samples = simulateQuadrantTransient({
      from: 'heating', to: 'cooling',
      PdOld: 2.4, PsOld: 0.45,
      eevOld: 0.7,
      PdNew: 3.0, PsNew: 0.9,
      eevNew: 0.5,
    });
    const maxPd = Math.max(...samples.map((s) => s.Pd));
    expect(maxPd).toBeGreaterThan(3.0);
  });
});

describe('quadrantAngle', () => {
  it('四个模式映射到四个不同象限角度', () => {
    const angles = new Set(
      (['cooling', 'heating', 'defrost', 'dehumid'] as const).map((m) => quadrantAngle(m)),
    );
    expect(angles.size).toBe(4);
  });
});
