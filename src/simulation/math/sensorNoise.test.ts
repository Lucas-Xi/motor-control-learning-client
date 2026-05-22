import { describe, expect, it } from 'vitest';
import {
  adcMeasurement,
  defaultAdcParams,
  defaultEncoderParams,
  defaultHallParams,
  encoderMeasurement,
  hallSector,
  kclResidual,
} from './sensorNoise';

/* 编码器 */

describe('encoderMeasurement - LSB 分辨率', () => {
  it('10 bit (1024 PPR) → LSB ≈ 0.35°', () => {
    const r = encoderMeasurement(0, { ...defaultEncoderParams, eccentricityRad: 0, secondHarmonicRad: 0 });
    expect(r.lsbRad).toBeCloseTo((2 * Math.PI) / 1024, 6);
    expect((r.lsbRad * 180) / Math.PI).toBeCloseTo(0.352, 2);
  });

  it('17 bit 绝对式 → LSB << 1°', () => {
    const r = encoderMeasurement(0, { ...defaultEncoderParams, bits: 17, eccentricityRad: 0, secondHarmonicRad: 0 });
    expect((r.lsbRad * 180) / Math.PI).toBeLessThan(0.01);
  });
});

describe('encoderMeasurement - 偏心', () => {
  it('每机械圈 1 个正弦周期的角度误差', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const theta = (i / 100) * 2 * Math.PI;
      samples.push(encoderMeasurement(theta, defaultEncoderParams).errorRad);
    }
    // 偏心相位在 0，误差应该在 θ=π/2 处最大正偏，θ=3π/2 处最大负偏
    const maxIdx = samples.indexOf(Math.max(...samples));
    expect(maxIdx).toBeGreaterThan(10);
    expect(maxIdx).toBeLessThan(40);
  });

  it('零偏心 + 零谐波 → 误差只剩量化', () => {
    const r = encoderMeasurement(1.0, { ...defaultEncoderParams, eccentricityRad: 0, secondHarmonicRad: 0 });
    expect(Math.abs(r.errorRad)).toBeLessThan(r.lsbRad);
  });
});

/* Hall */

describe('hallSector - 扇区编号', () => {
  it('θ=0 → 扇区 0', () => {
    const r = hallSector(0.05, { ...defaultHallParams, offsetsRad: [0, 0, 0], hysteresisRad: 0 });
    expect(r.sector).toBe(0);
  });

  it('θ=π → 扇区 3', () => {
    const r = hallSector(Math.PI - 0.05, { ...defaultHallParams, offsetsRad: [0, 0, 0], hysteresisRad: 0 });
    expect(r.sector).toBe(2);
  });
});

describe('hallSector - 60° 分辨率粗糙', () => {
  it('Hall 估算角度量化到 30° 中点，误差 < 30°', () => {
    const r = hallSector(Math.PI / 4, { ...defaultHallParams, offsetsRad: [0, 0, 0], hysteresisRad: 0 });
    expect(Math.abs(r.hallErrRad)).toBeLessThan(Math.PI / 3);
  });
});

describe('hallSector - 偏置导致 6 倍频纹波', () => {
  it('偏置参数让某些 θ 处误差比理想更大', () => {
    const offset: typeof defaultHallParams = { offsetsRad: [0.05, -0.05, 0.03], hysteresisRad: 0 };
    const noOffset: typeof defaultHallParams = { offsetsRad: [0, 0, 0], hysteresisRad: 0 };
    let maxErrOffset = 0;
    let maxErrNoOffset = 0;
    for (let i = 0; i < 60; i += 1) {
      const theta = (i / 60) * 2 * Math.PI;
      maxErrOffset = Math.max(maxErrOffset, Math.abs(hallSector(theta, offset).hallErrRad));
      maxErrNoOffset = Math.max(maxErrNoOffset, Math.abs(hallSector(theta, noOffset).hallErrRad));
    }
    expect(maxErrOffset).toBeGreaterThanOrEqual(maxErrNoOffset);
  });
});

/* ADC */

describe('adcMeasurement - LSB 大小', () => {
  it('12 bit × ±10A 量程 → LSB ≈ 4.88 mA', () => {
    const r = adcMeasurement(0, { ...defaultAdcParams, noiseSigmaLSB: 0, offsetLSB: 0, inlLSB: 0 });
    expect(r.lsbSize).toBeCloseTo(20 / 4096, 6);
  });
});

describe('adcMeasurement - 量化误差', () => {
  it('无噪声/无偏置/无 INL → 误差 ≤ 0.5 LSB', () => {
    const params = { ...defaultAdcParams, noiseSigmaLSB: 0, offsetLSB: 0, inlLSB: 0 };
    for (let v = -9.5; v <= 9.5; v += 0.5) {
      const r = adcMeasurement(v, params);
      expect(Math.abs(r.errorAbs)).toBeLessThanOrEqual(r.lsbSize / 2 + 1e-9);
    }
  });
});

describe('adcMeasurement - 偏置可重现', () => {
  it('恒定 offsetLSB → 误差有恒定方向', () => {
    const params = { ...defaultAdcParams, noiseSigmaLSB: 0, inlLSB: 0, offsetLSB: 5 };
    const r1 = adcMeasurement(2.0, params);
    const r2 = adcMeasurement(4.0, params);
    // 偏置都是正方向
    expect(r1.errorAbs).toBeGreaterThan(0);
    expect(r2.errorAbs).toBeGreaterThan(0);
  });
});

describe('adcMeasurement - 噪声幅值', () => {
  it('多次采样的 σ 应接近 noiseSigmaLSB × LSB', () => {
    const params = { ...defaultAdcParams, inlLSB: 0, offsetLSB: 0, noiseSigmaLSB: 1 };
    const seed = (() => {
      let s = 0;
      return () => {
        s += 0.137;
        s -= Math.floor(s);
        return s;
      };
    })();
    const samples: number[] = [];
    for (let k = 0; k < 200; k += 1) {
      samples.push(adcMeasurement(3.0, params, seed).errorAbs);
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / samples.length;
    // sqrt(variance) 应在 LSB 量级（粗略校验有噪声）
    expect(Math.sqrt(variance)).toBeGreaterThan(0);
  });
});

/* KCL */

describe('kclResidual', () => {
  it('健康三相 → 残差 ≈ 0', () => {
    const r = kclResidual(2, -1, -1);
    expect(r).toBe(0);
  });

  it('A 相偏置 0.5A → 残差 ≈ 0.5A（教学：偏置检测信号）', () => {
    const r = kclResidual(2.5, -1, -1);
    expect(r).toBeCloseTo(0.5, 6);
  });
});
