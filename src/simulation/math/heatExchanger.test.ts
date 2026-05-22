import { describe, expect, it } from 'vitest';
import {
  heatExchangerExchange,
  inverseSaturationTemp,
  sampleHeatExchangers,
} from './heatExchanger';

describe('heatExchangerExchange - 冷凝器基本工况', () => {
  it('家用 1.5HP 冷凝器 Tc=45 室外 35 → 实际换热 ~3.7-4.5 kW', () => {
    const r = heatExchangerExchange({
      TrefC: 45,
      TairInC: 35,
      params: sampleHeatExchangers.homeCond15HP,
    });
    expect(r.qActualKW).toBeGreaterThan(3.5);
    expect(r.qActualKW).toBeLessThan(5.0);
    expect(r.epsilon).toBeGreaterThan(0.75);
    expect(r.epsilon).toBeLessThan(0.95);
    // 空气出口温度高于进口（被加热）
    expect(r.TairOutC).toBeGreaterThan(35);
  });
});

describe('heatExchangerExchange - 蒸发器基本工况', () => {
  it('家用 1.5HP 蒸发器 Te=7 室内 27 → 实际换热 ~2.5-3.5 kW', () => {
    const r = heatExchangerExchange({
      TrefC: 7,
      TairInC: 27,
      params: sampleHeatExchangers.homeEvap15HP,
    });
    expect(r.qActualKW).toBeGreaterThan(2.5);
    expect(r.qActualKW).toBeLessThan(4.5);
    // 空气出口温度低于进口（被冷却）
    expect(r.TairOutC).toBeLessThan(27);
  });
});

describe('heatExchangerExchange - 温差为零', () => {
  it('Tref = Tair 时换热量为 0', () => {
    const r = heatExchangerExchange({
      TrefC: 30,
      TairInC: 30,
      params: sampleHeatExchangers.homeCond15HP,
    });
    expect(r.qActualKW).toBe(0);
    expect(r.epsilon).toBe(0);
  });
});

describe('heatExchangerExchange - 温差反向（物理无效）', () => {
  it('蒸发器 Tref > Tair 时返回 0（不可能从冷热源吸热）', () => {
    const r = heatExchangerExchange({
      TrefC: 35,
      TairInC: 25,
      params: sampleHeatExchangers.homeEvap15HP,
    });
    expect(r.qActualKW).toBe(0);
  });
});

describe('heatExchangerExchange - 增大风量提升换热', () => {
  it('风量从 0.3 加大到 0.8 m³/s → q 增大、ε 下降（C_air 增大让 NTU 下降）', () => {
    const low = heatExchangerExchange({
      TrefC: 45, TairInC: 35,
      params: { kind: 'condenser', uaKWperK: 1.0, airFlowM3perS: 0.3 },
    });
    const high = heatExchangerExchange({
      TrefC: 45, TairInC: 35,
      params: { kind: 'condenser', uaKWperK: 1.0, airFlowM3perS: 0.8 },
    });
    expect(high.qActualKW).toBeGreaterThan(low.qActualKW);
    expect(high.epsilon).toBeLessThan(low.epsilon); // NTU 下降，ε 也下降
  });
});

describe('heatExchangerExchange - 增大 UA 提升换热与 ε', () => {
  it('UA 从 0.5 提到 2.0 kW/K → q 和 ε 都涨', () => {
    const small = heatExchangerExchange({
      TrefC: 45, TairInC: 35,
      params: { kind: 'condenser', uaKWperK: 0.5, airFlowM3perS: 0.4 },
    });
    const large = heatExchangerExchange({
      TrefC: 45, TairInC: 35,
      params: { kind: 'condenser', uaKWperK: 2.0, airFlowM3perS: 0.4 },
    });
    expect(large.qActualKW).toBeGreaterThan(small.qActualKW);
    expect(large.epsilon).toBeGreaterThan(small.epsilon);
  });
});

describe('inverseSaturationTemp - 反求 Tc', () => {
  it('需要散 3 kW，UA=1.0，0.4 m³/s 风量，室外 35°C → Tc 在合理区间', () => {
    const r = inverseSaturationTemp(3.0, 35, sampleHeatExchangers.homeCond15HP);
    expect(r.feasible).toBe(true);
    // 冷凝温度 Tc 应 > 35 但 < 70
    expect(r.TrefC).toBeGreaterThan(35);
    expect(r.TrefC).toBeLessThan(70);
    // 反求出来的 Tc 重新代入应该接近原 q
    expect(r.qActualKW).toBeCloseTo(3.0, 1);
  });
});

describe('inverseSaturationTemp - 不可行', () => {
  it('要求散 50 kW（远超家用冷凝器能力）→ feasible=false', () => {
    const r = inverseSaturationTemp(50, 35, sampleHeatExchangers.homeCond15HP);
    expect(r.feasible).toBe(false);
  });
});

describe('heatExchangerExchange - 商用与家用对比', () => {
  it('商用 5HP 冷凝器同温差下换热量 > 家用 1.5HP', () => {
    const home = heatExchangerExchange({
      TrefC: 50, TairInC: 35,
      params: sampleHeatExchangers.homeCond15HP,
    });
    const commercial = heatExchangerExchange({
      TrefC: 50, TairInC: 35,
      params: sampleHeatExchangers.commercialCond5HP,
    });
    expect(commercial.qActualKW).toBeGreaterThan(home.qActualKW * 2);
  });
});

describe('heatExchangerExchange - NTU 公式正确性', () => {
  it('NTU = UA / C_min，C_min 在制冷剂侧无穷大时 = C_air', () => {
    const r = heatExchangerExchange({
      TrefC: 45, TairInC: 35,
      params: { kind: 'condenser', uaKWperK: 1.0, airFlowM3perS: 0.4 },
    });
    // C_air = 0.4 × 1.2 × 1.005 = 0.4824
    expect(r.cAirKWperK).toBeCloseTo(0.4824, 3);
    // NTU = 1.0 / 0.4824 ≈ 2.073
    expect(r.ntu).toBeCloseTo(2.073, 2);
    // ε = 1 − exp(−2.073) ≈ 0.874
    expect(r.epsilon).toBeCloseTo(0.874, 2);
  });
});
