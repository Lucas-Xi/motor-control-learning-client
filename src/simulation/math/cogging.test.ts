import { describe, expect, it } from 'vitest';
import {
  bemfThd,
  bemfWithHarmonics,
  coggingTorque,
  defaultBemfHarmonics,
  sampleCoggingParams,
} from './cogging';

describe('coggingTorque - 周期数', () => {
  it('12 槽 8 极 (P=4) 每圈 3 个齿槽周期', () => {
    const r = coggingTorque(0, sampleCoggingParams.hitachi15HP);
    expect(r.periodPerRev).toBe(3);
  });

  it('48 槽 8 极 (P=4) 每圈 6 个齿槽周期', () => {
    const r = coggingTorque(0, sampleCoggingParams.evTraction);
    expect(r.periodPerRev).toBe(6);
  });
});

describe('coggingTorque - 周期性', () => {
  it('θ_mech 增加 2π 后转矩回到原值', () => {
    const r0 = coggingTorque(0.1, sampleCoggingParams.hitachi15HP);
    const r1 = coggingTorque(0.1 + 2 * Math.PI, sampleCoggingParams.hitachi15HP);
    expect(r1.torque).toBeCloseTo(r0.torque, 9);
  });
});

describe('coggingTorque - 幅值范围', () => {
  it('|T_cog| 不超过所有谐波幅值之和', () => {
    const maxExpected = sampleCoggingParams.hitachi15HP.amplitudes.reduce((a, b) => a + Math.abs(b), 0);
    for (let theta = 0; theta < 2 * Math.PI; theta += 0.05) {
      const r = coggingTorque(theta, sampleCoggingParams.hitachi15HP);
      expect(Math.abs(r.torque)).toBeLessThanOrEqual(maxExpected + 1e-9);
    }
  });
});

describe('coggingTorque - 零幅值', () => {
  it('所有幅值 0 → 转矩恒 0', () => {
    const params = { ...sampleCoggingParams.hitachi15HP, amplitudes: [0, 0, 0] };
    for (let theta = 0; theta < 2 * Math.PI; theta += 0.1) {
      expect(coggingTorque(theta, params).torque).toBe(0);
    }
  });
});

describe('bemfWithHarmonics - 基波', () => {
  it('仅 1 次谐波时退化为纯正弦', () => {
    const v = bemfWithHarmonics(Math.PI / 2, 0.045, 100, [{ order: 1, coef: 1 }]);
    expect(v).toBeCloseTo(0.045 * 100, 6);
  });
});

describe('bemfWithHarmonics - 谐波叠加', () => {
  it('叠 5 次后 BEMF 形状不再是纯正弦（peak 偏移）', () => {
    const fund = bemfWithHarmonics(Math.PI / 2, 0.045, 100, [{ order: 1, coef: 1 }]);
    const withH5 = bemfWithHarmonics(Math.PI / 2, 0.045, 100, defaultBemfHarmonics);
    expect(Math.abs(withH5 - fund)).toBeGreaterThan(0);
  });
});

describe('bemfThd - THD 公式', () => {
  it('纯正弦 THD = 0', () => {
    expect(bemfThd([{ order: 1, coef: 1 }])).toBe(0);
  });

  it('默认谐波表 THD < 10%（家用压缩机典型）', () => {
    const thd = bemfThd(defaultBemfHarmonics);
    expect(thd).toBeGreaterThan(0);
    expect(thd).toBeLessThan(0.10);
  });
});

describe('coggingTorque - 高槽数 EV 主驱', () => {
  it('48 槽 EV 主驱齿槽幅值 600 mN·m 级别', () => {
    let maxAbs = 0;
    for (let theta = 0; theta < 2 * Math.PI; theta += 0.05) {
      const r = coggingTorque(theta, sampleCoggingParams.evTraction);
      if (Math.abs(r.torque) > maxAbs) maxAbs = Math.abs(r.torque);
    }
    expect(maxAbs).toBeGreaterThan(0.5);
    expect(maxAbs).toBeLessThan(0.9);
  });
});
