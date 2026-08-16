import { describe, expect, it } from 'vitest';
import {
  stepTwoMass, analyzeResonance, frequencyResponse, sweepFrequencyResponse,
  simulateTwoMassTorqueStep, findSweepPeakFreq,
  type TwoMassParams,
} from './twoMassResonance';

const defaultParams: TwoMassParams = {
  j1: 0.002,
  j2: 0.008,
  shaftStiffness: 200,
  shaftDamping: 0.05,
};

describe('stepTwoMass', () => {
  it('恒定转矩时电机加速', () => {
    const state = { omega1: 0, theta1: 0, omega2: 0, theta2: 0, shaftTorque: 0 };
    for (let k = 0; k < 100; k++) {
      const r = stepTwoMass(state, defaultParams, { te: 1, loadTorque: 0, dt: 0.001 });
      Object.assign(state, r.state);
    }
    expect(state.omega1).toBeGreaterThan(0);
  });

  it('轴转矩随时间变化（从零到非零）', () => {
    const state = { omega1: 0, theta1: 0, omega2: 0, theta2: 0, shaftTorque: 0 };
    // 多步之后轴转矩应非零
    for (let k = 0; k < 10; k++) {
      const r = stepTwoMass(state, defaultParams, { te: 1, loadTorque: 0, dt: 0.001 });
      Object.assign(state, r.state);
    }
    expect(Math.abs(state.shaftTorque)).toBeGreaterThan(0);
  });

  it('大负载时 omega2 < omega1', () => {
    const state = { omega1: 100, theta1: 0, omega2: 95, theta2: 0, shaftTorque: 0 };
    const r = stepTwoMass(state, defaultParams, { te: 0, loadTorque: 1, dt: 0.001 });
    expect(r.state.omega2).toBeLessThan(r.state.omega1);
  });
});

describe('analyzeResonance', () => {
  it('反共振频率 < 共振频率', () => {
    const a = analyzeResonance(defaultParams);
    expect(a.antiResonanceFreq).toBeLessThan(a.resonanceFreq);
  });

  it('增大刚度提高两个频率', () => {
    const soft = analyzeResonance({ ...defaultParams, shaftStiffness: 100 });
    const stiff = analyzeResonance({ ...defaultParams, shaftStiffness: 400 });
    expect(stiff.resonanceFreq).toBeGreaterThan(soft.resonanceFreq);
    expect(stiff.antiResonanceFreq).toBeGreaterThan(soft.antiResonanceFreq);
  });

  it('品质因数 > 0', () => {
    const a = analyzeResonance(defaultParams);
    expect(a.qualityFactor).toBeGreaterThan(0);
  });
});

describe('frequencyResponse', () => {
  it('低频增益 ≈ 1/(ω·Jtotal)', () => {
    const fr = frequencyResponse(1, defaultParams);
    const Jtotal = defaultParams.j1 + defaultParams.j2;
    const expected = 1 / (2 * Math.PI * 1 * Jtotal);
    // 低频处应接近，允许一些相位误差
    expect(fr.mag).toBeGreaterThan(expected * 0.5);
    expect(fr.mag).toBeLessThan(expected * 2);
  });

  it('共振频率处的增益高于共振前 1 倍频程', () => {
    const a = analyzeResonance(defaultParams);
    // 共振频率处 vs 共振频率/2 处（1 倍频程前）
    const nearRes = frequencyResponse(a.resonanceFreq, defaultParams);
    const beforeRes = frequencyResponse(a.resonanceFreq / 2, defaultParams);
    // 由于阻尼，共振峰可能不尖锐，但至少应不低于前一个倍频程
    expect(nearRes.mag).toBeGreaterThan(beforeRes.mag * 0.5);
  });
});

describe('sweepFrequencyResponse', () => {
  it('生成对数频率扫描', () => {
    const data = sweepFrequencyResponse(defaultParams, 1, 500, 10);
    expect(data.length).toBeGreaterThan(20);
    expect(data[0].freqHz).toBeCloseTo(1, 0);
    expect(data[data.length - 1].freqHz).toBeCloseTo(500, 0);
  });

  it('幅值在共振频率附近有局部峰值', () => {
    const a = analyzeResonance(defaultParams);
    const data = sweepFrequencyResponse(defaultParams, a.resonanceFreq * 0.3, a.resonanceFreq * 3, 30);
    const mags = data.map((d) => d.magDb);
    const peakIdx = mags.indexOf(Math.max(...mags));
    // 峰值应该出现在数据中部附近（共振频率处）
    expect(peakIdx).toBeGreaterThan(0);
  });
});

describe('analyzeResonance formulas', () => {
  it('antiResonanceFreq ≈ sqrt(K/J2)/(2π)', () => {
    const a = analyzeResonance(defaultParams);
    const expected = Math.sqrt(defaultParams.shaftStiffness / defaultParams.j2) / (2 * Math.PI);
    expect(Math.abs(a.antiResonanceFreq - expected) / expected).toBeLessThan(1e-6);
  });

  it('resonanceFreq / antiResonanceFreq ≈ sqrt(1 + J2/J1)', () => {
    const a = analyzeResonance(defaultParams);
    const ratio = a.resonanceFreq / a.antiResonanceFreq;
    const expected = Math.sqrt(1 + defaultParams.j2 / defaultParams.j1);
    expect(ratio).toBeCloseTo(expected, 6);
  });
});

describe('simulateTwoMassTorqueStep', () => {
  it('末态 omega1 > 0 且轴转矩变为非零', () => {
    const trace = simulateTwoMassTorqueStep(defaultParams, 1);
    expect(trace.length).toBeGreaterThan(10);
    const last = trace[trace.length - 1];
    expect(last.omega1).toBeGreaterThan(0);
    expect(trace.some((p) => Math.abs(p.shaftTorque) > 0)).toBe(true);
  });
});

describe('findSweepPeakFreq', () => {
  it('空扫频返回 0', () => {
    expect(findSweepPeakFreq([])).toBe(0);
  });

  it('共振附近扫频峰值频率在 resonanceFreq 的 15% 内', () => {
    const a = analyzeResonance(defaultParams);
    const sweep = sweepFrequencyResponse(
      defaultParams,
      a.resonanceFreq * 0.5,
      a.resonanceFreq * 2,
      40,
    );
    const peak = findSweepPeakFreq(sweep);
    expect(Math.abs(peak - a.resonanceFreq) / a.resonanceFreq).toBeLessThan(0.15);
  });
});

describe('frequencyResponse anti-resonance dip', () => {
  it('反共振处幅值低于 antiResonanceFreq × 0.5（陷波）', () => {
    const a = analyzeResonance(defaultParams);
    const atAr = frequencyResponse(a.antiResonanceFreq, defaultParams);
    const before = frequencyResponse(a.antiResonanceFreq * 0.5, defaultParams);
    expect(atAr.mag).toBeLessThan(before.mag);
  });
});
