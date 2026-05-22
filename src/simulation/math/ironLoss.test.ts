import { describe, expect, it } from 'vitest';
import { defaultIronLossParams, ironLoss, ironLossEquivalentResistance } from './ironLoss';

describe('ironLoss - 零频率', () => {
  it('omega=0 时损耗为 0', () => {
    const r = ironLoss(0, 6, defaultIronLossParams);
    expect(r.total).toBe(0);
    expect(r.fElec).toBe(0);
  });
});

describe('ironLoss - 频率单调性', () => {
  it('频率增大 → 总铁损单调增大', () => {
    const low = ironLoss(100, 6, defaultIronLossParams);
    const mid = ironLoss(500, 6, defaultIronLossParams);
    const high = ironLoss(1500, 6, defaultIronLossParams);
    expect(mid.total).toBeGreaterThan(low.total);
    expect(high.total).toBeGreaterThan(mid.total);
  });
});

describe('ironLoss - 高速时涡流损耗主导', () => {
  it('高速段 P_e > P_h（频率平方增长 vs 线性增长）', () => {
    const highSpeed = ironLoss(2500, 4, defaultIronLossParams);
    expect(highSpeed.pe).toBeGreaterThan(highSpeed.ph);
  });
});

describe('ironLoss - 量级合理性', () => {
  it('4000 rpm × 4 极对 × Iq=6A 的铁损在 15-80 W 量级', () => {
    // 4000 rpm × 2π/60 × 4 = 1676 rad/s
    const r = ironLoss(1676, 6, defaultIronLossParams);
    expect(r.total).toBeGreaterThan(15);
    expect(r.total).toBeLessThan(80);
  });
});

describe('ironLoss - 等效铁损电阻', () => {
  it('损耗大 → R_fe 小（教学：R_fe 并联到 dq 等效电路）', () => {
    const highLoss = ironLoss(2000, 8, defaultIronLossParams);
    const r1 = ironLossEquivalentResistance(highLoss, 0.045);
    expect(r1).toBeGreaterThan(0);
    expect(r1).toBeLessThan(10000);
  });

  it('损耗=0 时 R_fe=Infinity', () => {
    const zero = ironLoss(0, 0, defaultIronLossParams);
    expect(ironLossEquivalentResistance(zero, 0.045)).toBe(Infinity);
  });
});

describe('ironLoss - 反向频率对称', () => {
  it('负频率与正频率的铁损相同（损耗只与 |ω| 有关）', () => {
    const pos = ironLoss(1000, 5, defaultIronLossParams);
    const neg = ironLoss(-1000, 5, defaultIronLossParams);
    expect(neg.total).toBeCloseTo(pos.total, 6);
  });
});

describe('ironLoss - 电枢反应增强 B', () => {
  it('iq 增大 → B 增大 → 铁损增大', () => {
    const noLoad = ironLoss(1000, 0, defaultIronLossParams);
    const heavy = ironLoss(1000, 12, defaultIronLossParams);
    expect(heavy.bAir).toBeGreaterThan(noLoad.bAir);
    expect(heavy.total).toBeGreaterThan(noLoad.total);
  });
});
