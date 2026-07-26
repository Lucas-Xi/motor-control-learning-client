import { describe, expect, it } from 'vitest';
import {
  createAdaptiveLut, adaptiveLutStep, resetAdaptiveLut, diagnoseAdaptiveLut,
} from './coggingAdaptive';
import { buildFfcLut } from './coggingCompensation';
import { sampleCoggingParams } from './cogging';

const POLE_PAIRS = 4;
const FLUX = 0.045;
const KT = 1.5 * POLE_PAIRS * FLUX;

describe('coggingAdaptive', () => {
  const params = sampleCoggingParams.hitachi15HP;
  const baseLut = buildFfcLut(64, params, KT);

  describe('createAdaptiveLut', () => {
    it('拷贝初始 LUT，不修改原表', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      expect(state.lut.size).toBe(64);
      expect(state.lut.values[0]).toBe(baseLut.values[0]);
      // 修改副本不应影响原表
      state.lut.values[0] = 999;
      expect(baseLut.values[0]).not.toBe(999);
    });
  });

  describe('adaptiveLutStep', () => {
    it('高转速波动时跳过学习', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      const before = state.lut.values[0];
      adaptiveLutStep(state, 0.1, 0.05, 0.1, 0.001);
      expect(state.lut.values[0]).toBe(before);
      expect(state.isLearning).toBe(false);
    });

    it('稳态时更新 LUT', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      const before = state.lut.values[0];
      adaptiveLutStep(state, 0.0, 0.01, 0.01, 0.001);
      expect(state.isLearning).toBe(true);
      // 值应该改变（往负方向调整）
      expect(state.lut.values[0]).not.toBe(before);
    });

    it('多次学习后覆盖更多 bin', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      for (let step = 0; step < 100; step++) {
        const theta = (step / 100) * 2 * Math.PI;
        adaptiveLutStep(state, theta, 0.005, 0.02, 0.001);
      }
      const diag = diagnoseAdaptiveLut(state, baseLut);
      expect(diag.binsTrained).toBeGreaterThan(30);
    });
  });

  describe('diagnoseAdaptiveLut', () => {
    it('零观测时返回 0 训练', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      const diag = diagnoseAdaptiveLut(state, baseLut);
      expect(diag.binsTrained).toBe(0);
      expect(diag.coveragePct).toBe(0);
    });

    it('全角度扫描后覆盖 100%', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      for (let k = 0; k < 200; k++) {
        const theta = (k / 200) * 2 * Math.PI;
        adaptiveLutStep(state, theta, 0.001, 0.02, 0.001);
      }
      const diag = diagnoseAdaptiveLut(state, baseLut);
      expect(diag.coveragePct).toBeGreaterThanOrEqual(99);
    });
  });

  describe('resetAdaptiveLut', () => {
    it('重置后 LUT 恢复初始值', () => {
      const state = createAdaptiveLut(baseLut, { torqueConstant: KT });
      adaptiveLutStep(state, 0.0, 0.01, 0.01, 0.001);
      resetAdaptiveLut(state, baseLut);
      expect(state.lut.values[0]).toBe(baseLut.values[0]);
      expect(state.cumulativeResidual).toBeCloseTo(0);
    });
  });
});