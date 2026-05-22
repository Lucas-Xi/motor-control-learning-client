import { describe, expect, it } from 'vitest';
import {
  deadtimeMeanError,
  defaultPwmTransientParams,
  generatePwmWaveform,
  meanPhaseVoltage,
  pwmSpectrum,
} from './pwmTransient';

describe('generatePwmWaveform - 平均电压回到理想值（零死区）', () => {
  it('死区=0 时平均 va ≈ (duty-0.5)×Vdc（容许 1.5V 量化误差）', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.6, dutyB: 0.5, dutyC: 0.4 },
      iAbc: { ia: 5, ib: -2, ic: -3 },
      cycles: 4,
      params: { ...defaultPwmTransientParams, deadTimeSec: 0, qrrCoulomb: 0, samplesPerCycle: 400 },
    });
    const ideal = (0.6 - 0.5) * defaultPwmTransientParams.vdc;
    // 离散采样下边界对齐有 ~1/N × Vdc 的量化误差（400 sample × 310V ≈ 0.8V）；
    // 教学场景下可忽略，但在断言里给 1.5V 余量。
    expect(Math.abs(meanPhaseVoltage(pts, 'va') - ideal)).toBeLessThan(1.5);
  });
});

describe('generatePwmWaveform - 死区让平均偏离理想', () => {
  it('死区 2us + ia>0 时 va 平均比理想偏低', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.6, dutyB: 0.5, dutyC: 0.4 },
      iAbc: { ia: 5, ib: -2, ic: -3 },
      cycles: 4,
      params: { ...defaultPwmTransientParams, deadTimeSec: 2e-6, qrrCoulomb: 0 },
    });
    const err = deadtimeMeanError(pts, { dutyA: 0.6, dutyB: 0.5, dutyC: 0.4 }, defaultPwmTransientParams.vdc);
    // ia>0 时死区让 va 平均更负（电流方向决定死区电压）
    expect(err.aErr).toBeLessThan(0);
  });

  it('ia<0 时 va 平均比理想偏高（方向反过来）', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.4, dutyB: 0.5, dutyC: 0.6 },
      iAbc: { ia: -5, ib: 0, ic: 5 },
      cycles: 4,
      params: { ...defaultPwmTransientParams, deadTimeSec: 2e-6, qrrCoulomb: 0 },
    });
    const err = deadtimeMeanError(pts, { dutyA: 0.4, dutyB: 0.5, dutyC: 0.6 }, defaultPwmTransientParams.vdc);
    expect(err.aErr).toBeGreaterThan(0);
  });
});

describe('generatePwmWaveform - 输出长度', () => {
  it('cycles × samplesPerCycle 个点', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.5, dutyB: 0.5, dutyC: 0.5 },
      iAbc: { ia: 0, ib: 0, ic: 0 },
      cycles: 3,
      params: { ...defaultPwmTransientParams, samplesPerCycle: 100 },
    });
    expect(pts.length).toBe(300);
  });
});

describe('generatePwmWaveform - 电压只在 ±Vdc/2 之间', () => {
  it('波形点的相电压幅值不超过 Vdc/2（含反向恢复尖刺允许小幅超出）', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.7, dutyB: 0.5, dutyC: 0.3 },
      iAbc: { ia: 6, ib: -3, ic: -3 },
      cycles: 1,
      params: { ...defaultPwmTransientParams, qrrCoulomb: 0 }, // 关掉尖刺看主体
    });
    const vmax = defaultPwmTransientParams.vdc / 2;
    for (const p of pts) {
      expect(Math.abs(p.va)).toBeLessThanOrEqual(vmax + 1e-6);
      expect(Math.abs(p.vb)).toBeLessThanOrEqual(vmax + 1e-6);
      expect(Math.abs(p.vc)).toBeLessThanOrEqual(vmax + 1e-6);
    }
  });
});

describe('pwmSpectrum - 载波频率峰值', () => {
  it('PWM 频谱在 fsw 处有显著峰值', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.6, dutyB: 0.5, dutyC: 0.4 },
      iAbc: { ia: 5, ib: -2, ic: -3 },
      cycles: 8,
      params: { ...defaultPwmTransientParams, samplesPerCycle: 256 },
    });
    const spec = pwmSpectrum(pts, 'va', 128);
    // 找最大幅值（不含 DC）的 bin
    let maxBin = 1;
    for (let k = 2; k < spec.mag.length; k += 1) {
      if (spec.mag[k] > spec.mag[maxBin]) maxBin = k;
    }
    // 该 bin 频率应接近 fsw
    expect(Math.abs(spec.freq[maxBin] - defaultPwmTransientParams.fsw))
      .toBeLessThan(defaultPwmTransientParams.fsw * 0.3);
  });
});

describe('generatePwmWaveform - 门极信号一致性', () => {
  it('gateA=1 期间 va = +Vdc/2', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.5, dutyB: 0.5, dutyC: 0.5 },
      iAbc: { ia: 0, ib: 0, ic: 0 },          // 零电流避开死区方向歧义
      cycles: 1,
      params: { ...defaultPwmTransientParams, qrrCoulomb: 0 },
    });
    const high = pts.filter((p) => p.gateA === 1);
    expect(high.length).toBeGreaterThan(10);
    for (const p of high) {
      expect(p.va).toBeCloseTo(defaultPwmTransientParams.vdc / 2, 1);
    }
  });
});

describe('generatePwmWaveform - duty=0/1 边界', () => {
  it('duty=0 → 上管几乎全关', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.01, dutyB: 0.5, dutyC: 0.5 },
      iAbc: { ia: 0, ib: 0, ic: 0 },
      cycles: 1,
      params: { ...defaultPwmTransientParams, qrrCoulomb: 0, deadTimeSec: 0 },
    });
    const meanA = meanPhaseVoltage(pts, 'va');
    // 接近 -Vdc/2
    expect(meanA).toBeLessThan(-0.4 * defaultPwmTransientParams.vdc);
  });

  it('duty=1 → 上管几乎全开', () => {
    const pts = generatePwmWaveform({
      duty: { dutyA: 0.99, dutyB: 0.5, dutyC: 0.5 },
      iAbc: { ia: 0, ib: 0, ic: 0 },
      cycles: 1,
      params: { ...defaultPwmTransientParams, qrrCoulomb: 0, deadTimeSec: 0 },
    });
    const meanA = meanPhaseVoltage(pts, 'va');
    expect(meanA).toBeGreaterThan(0.4 * defaultPwmTransientParams.vdc);
  });
});
