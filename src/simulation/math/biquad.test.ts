import { describe, expect, it } from 'vitest';
import { makeLowpass, makeNotch, makeHighpass } from './biquad';

/** 工具：用 N 个周期 +N 个点估算稳态正弦输入下输出的幅值（朴素 RMS×√2）。 */
function steadyStateMagnitude(filter: { step: (x: number) => number }, freq: number, fs: number, cycles = 8): number {
  const N = Math.max(64, Math.round(fs / Math.max(freq, 1) * cycles));
  let sumSq = 0;
  // 预热：跑 3 倍 N 让滤波器稳态收敛
  for (let i = 0; i < N * 3; i += 1) {
    filter.step(Math.sin((2 * Math.PI * freq * i) / fs));
  }
  for (let i = 0; i < N; i += 1) {
    const y = filter.step(Math.sin((2 * Math.PI * freq * (i + N * 3)) / fs));
    sumSq += y * y;
  }
  return Math.sqrt((2 * sumSq) / N); // 正弦 RMS×√2 = 幅值
}

describe('makeLowpass', () => {
  const fs = 10000;
  const fc = 500;

  it('零输入 → 零输出', () => {
    const f = makeLowpass(fc, fs);
    expect(f.step(0)).toBe(0);
  });

  it('DC 输入应近似透传（增益 ≈ 1）', () => {
    const f = makeLowpass(fc, fs);
    for (let i = 0; i < 1000; i += 1) f.step(1);
    const y = f.step(1);
    expect(y).toBeCloseTo(1, 2);
  });

  it('低频（< fc/10）增益 ≈ 1', () => {
    const f = makeLowpass(fc, fs);
    const mag = steadyStateMagnitude(f, fc / 10, fs);
    expect(mag).toBeGreaterThan(0.98);
    expect(mag).toBeLessThan(1.02);
  });

  it('截止频率 fc 处增益 ≈ -3 dB（0.707）', () => {
    const f = makeLowpass(fc, fs);
    const mag = steadyStateMagnitude(f, fc, fs);
    expect(mag).toBeGreaterThan(0.6);
    expect(mag).toBeLessThan(0.8);
  });

  it('高频（10·fc）应被显著衰减', () => {
    const f = makeLowpass(fc, fs);
    const mag = steadyStateMagnitude(f, fc * 10, fs);
    expect(mag).toBeLessThan(0.02);
  });

  it('reset() 后状态清空：输入跳变响应可重复', () => {
    const f = makeLowpass(fc, fs);
    const y1 = [];
    for (let i = 0; i < 50; i += 1) y1.push(f.step(1));
    f.reset();
    const y2 = [];
    for (let i = 0; i < 50; i += 1) y2.push(f.step(1));
    for (let i = 0; i < 50; i += 1) expect(y2[i]).toBeCloseTo(y1[i], 10);
  });
});

describe('makeNotch', () => {
  const fs = 16000;
  const fc = 4000; // PWM 谐波抑制场景

  it('陷波中心频率应被深度衰减', () => {
    const f = makeNotch(fc, fs, 10);
    const mag = steadyStateMagnitude(f, fc, fs);
    expect(mag).toBeLessThan(0.1);
  });

  it('远离中心的低频几乎不衰减', () => {
    const f = makeNotch(fc, fs, 10);
    const mag = steadyStateMagnitude(f, 200, fs);
    expect(mag).toBeGreaterThan(0.95);
  });

  it('Q 越大陷波越窄：Q=20 应比 Q=2 在 0.5·fc 处更宽容（衰减更小）', () => {
    const fLow = makeNotch(fc, fs, 2);
    const fHigh = makeNotch(fc, fs, 20);
    const m_low = steadyStateMagnitude(fLow, fc * 0.5, fs);
    const m_high = steadyStateMagnitude(fHigh, fc * 0.5, fs);
    expect(m_high).toBeGreaterThan(m_low); // 高 Q 在远离 fc 的频点几乎透传
  });
});

describe('makeHighpass', () => {
  const fs = 10000;
  const fc = 500;

  it('DC 输入应被滤除（DC 增益 → 0）', () => {
    const f = makeHighpass(fc, fs);
    for (let i = 0; i < 2000; i += 1) f.step(1); // 等稳态
    const y = f.step(1);
    expect(Math.abs(y)).toBeLessThan(0.05);
  });

  it('远超 fc 的频率（4·fc，仍远离 Nyquist）几乎透传', () => {
    const f = makeHighpass(fc, fs);
    // fc=500, 4·fc=2000, fs/2=5000 → 还在 Nyquist 40% 范围内
    const mag = steadyStateMagnitude(f, fc * 4, fs);
    expect(mag).toBeGreaterThan(0.95);
  });

  it('Nyquist 边缘（fc ≈ fs/2）应被防御性裁剪，不会抛出/NaN', () => {
    const f = makeLowpass(fs * 0.49, fs);
    const y = f.step(1);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe('biquad 数值稳定性', () => {
  it('长时间常量输入不发散（DF-II-T 不应积分漂移）', () => {
    const f = makeLowpass(100, 10000);
    let y = 0;
    for (let i = 0; i < 100000; i += 1) y = f.step(0.5);
    expect(Math.abs(y - 0.5)).toBeLessThan(0.01);
    expect(Number.isFinite(y)).toBe(true);
  });
});
