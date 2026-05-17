import { describe, expect, it } from 'vitest';
import { inverterAverageModel } from '../inverterModel';

describe('Inverter average model — dead-time direction', () => {
  // Domain audit bug: 原实现 sign(duty - 0.5) 非物理。
  // 正确：死区压降方向由相电流极性决定：
  //   i>0（流出桥臂）→ 实际相电压下垂（占空比下降）
  //   i<0（流入桥臂）→ 实际相电压上抬（占空比上升）

  const base = { uDc: 300, dutyA: 0.6, dutyB: 0.5, dutyC: 0.4, deadTimeSec: 1e-6, pwmFrequency: 20000 };

  it('iSign=0 → 不带方向（退化为无死区效应）', () => {
    const r = inverterAverageModel({ ...base, iaSign: 0, ibSign: 0, icSign: 0 });
    // duty 没改：phaseA = (0.6-0.5)*300 = 30V
    expect(r.phaseA).toBeCloseTo(30, 6);
    expect(r.phaseB).toBeCloseTo(0, 6);
    expect(r.phaseC).toBeCloseTo(-30, 6);
  });

  it('iSign>0 → 相电压下垂（占空比降）', () => {
    // dutyA=0.6, deadLoss = 1e-6 * 20000 = 0.02
    // adjusted = 0.6 - 0.02 = 0.58
    // phaseA = (0.58 - 0.5) * 300 = 24V （比 30V 低）
    const r = inverterAverageModel({ ...base, iaSign: 1, ibSign: 1, icSign: 1 });
    expect(r.phaseA).toBeLessThan(30);
    expect(r.phaseA).toBeCloseTo(24, 6);
  });

  it('iSign<0 → 相电压上抬（占空比升）', () => {
    const r = inverterAverageModel({ ...base, iaSign: -1, ibSign: -1, icSign: -1 });
    expect(r.phaseA).toBeGreaterThan(30);
    expect(r.phaseA).toBeCloseTo(36, 6);
  });

  it('线电压公式正确', () => {
    const r = inverterAverageModel({ ...base, iaSign: 0, ibSign: 0, icSign: 0 });
    expect(r.lineAB).toBeCloseTo(r.phaseA - r.phaseB, 9);
    expect(r.lineBC).toBeCloseTo(r.phaseB - r.phaseC, 9);
    expect(r.lineCA).toBeCloseTo(r.phaseC - r.phaseA, 9);
  });

  it('死区时间越长，电压畸变越大（同相电流方向下）', () => {
    const small = inverterAverageModel({ ...base, deadTimeSec: 5e-7, iaSign: 1, ibSign: 1, icSign: 1 });
    const large = inverterAverageModel({ ...base, deadTimeSec: 2e-6, iaSign: 1, ibSign: 1, icSign: 1 });
    expect(large.deadTimeDistortion).toBeGreaterThan(small.deadTimeDistortion);
    // 大死区让 phaseA 下垂更多
    expect(large.phaseA).toBeLessThan(small.phaseA);
  });
});
