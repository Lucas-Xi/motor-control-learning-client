import { describe, expect, it } from 'vitest';
import {
  tuneCurrentLoop,
  currentLoopStepResponse,
  simulateCurrentLoopStep,
  validateTuning,
} from './currentLoopTuning';

describe('currentLoopTuning', () => {
  const motor = {
    rs: 0.05,      // 50 mΩ
    ldMh: 0.3,     // 0.3 mH
    lqMh: 0.8,     // 0.8 mH（IPM 凸极）
    fs: 10000,     // 10 kHz PWM
  };

  describe('tuneCurrentLoop', () => {
    it('returns positive Kp/Ki values for typical IPM motor', () => {
      const result = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      expect(result.kpD).toBeGreaterThan(0);
      expect(result.kiD).toBeGreaterThan(0);
      expect(result.kpQ).toBeGreaterThan(0);
      expect(result.kiQ).toBeGreaterThan(0);
    });

    it('q 轴 Kp > d 轴 Kp (凸极电机 Lq > Ld)', () => {
      const result = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      expect(result.kpQ).toBeGreaterThan(result.kpD);
    });

    it('Ki 在 d/q 轴上相同（都依赖 Rs）', () => {
      const result = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      expect(result.kiD).toBeCloseTo(result.kiQ, 6);
    });

    it('带宽因子越小（带宽越大），Kp/Ki 越大', () => {
      const low = tuneCurrentLoop({ ...motor, bandwidthFactor: 20 });
      const high = tuneCurrentLoop({ ...motor, bandwidthFactor: 10 });
      expect(high.kpD).toBeGreaterThan(low.kpD);
      expect(high.kiD).toBeGreaterThan(low.kiD);
      expect(high.bandwidthDHz).toBeGreaterThan(low.bandwidthDHz);
    });

    it('返回合理的相位裕度（> 0°）', () => {
      const result = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      expect(result.phaseMarginDeg).toBeGreaterThan(0);
      expect(result.phaseMarginDeg).toBeLessThanOrEqual(90);
    });

    it('SPM 电机（Ld=Lq）d/q 轴 Kp 相同', () => {
      const spm = tuneCurrentLoop({ rs: 0.1, ldMh: 0.5, lqMh: 0.5, fs: 10000, bandwidthFactor: 15 });
      expect(spm.kpD).toBeCloseTo(spm.kpQ, 6);
    });
  });

  describe('currentLoopStepResponse', () => {
    it('高带宽→上升/稳定时间更短', () => {
      const fast = currentLoopStepResponse(2 * Math.PI * 2000); // 2 kHz 带宽
      const slow = currentLoopStepResponse(2 * Math.PI * 500);  // 500 Hz
      expect(fast.riseTimeUs).toBeLessThan(slow.riseTimeUs);
      expect(fast.settleTimeUs).toBeLessThan(slow.settleTimeUs);
    });

    it('返回正的时域指标', () => {
      const r = currentLoopStepResponse(2 * Math.PI * 1000);
      expect(r.riseTimeUs).toBeGreaterThan(0);
      expect(r.settleTimeUs).toBeGreaterThan(0);
      expect(r.bandwidthHz).toBeCloseTo(1000, 0);
    });
  });

  describe('validateTuning', () => {
    it('合理的参数返回 valid=true', () => {
      // 高 Rs + 高 L + 低 fs → 低带宽 → 低延迟损失 → 高 PM
      const lowFsMotor = { rs: 0.5, ldMh: 5.0, lqMh: 5.0, fs: 5000 };
      const result = tuneCurrentLoop({ ...lowFsMotor, bandwidthFactor: 20 });
      const v = validateTuning(result, lowFsMotor.fs);
      // Debug
      if (!v.valid) {
        console.log('PM:', result.phaseMarginDeg, 'BW:', result.bandwidthDHz, 'warnings:', v.warnings);
      }
      expect(v.valid).toBe(true);
    });

    it('过高带宽返回警告', () => {
      const badResult = {
        kpD: 10, kiD: 100, kpQ: 15, kiQ: 100,
        bandwidthDHz: 5000, bandwidthQHz: 5000,
        phaseMarginDeg: 45, method: 'test',
        methodCode: 'magnitudeOptimum' as const, targetBandwidthHz: 5000,
      };
      const v = validateTuning(badResult, 10000);
      expect(v.valid).toBe(false);
      expect(v.warnings.length).toBeGreaterThan(0);
      expect(v.warningCodes.length).toBe(v.warnings.length);
      expect(v.warningCodes[0].code).toBe('bwDTooHigh');
    });
  });

  describe('simulateCurrentLoopStep', () => {
    // 模最优整定 + 充足电压余量的基准场景
    const base = () => {
      const tuned = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      return {
        rs: motor.rs,
        lMh: motor.ldMh,
        fs: motor.fs,
        kp: tuned.kpD,
        ki: tuned.kiD,
        targetA: 1,
        vLimit: 100,
        durationUs: 5000,
      };
    };

    it('收敛到目标电流（±2%）且数值全有限', () => {
      const r = simulateCurrentLoopStep(base());
      const last = r.samples[r.samples.length - 1];
      expect(Math.abs(last.current - 1)).toBeLessThan(0.02);
      for (const s of r.samples) {
        expect(Number.isFinite(s.current)).toBe(true);
        expect(Number.isFinite(s.voltage)).toBe(true);
      }
    });

    it('模最优整定的超调接近理论 4.3%（一拍延时下 < 20%）', () => {
      const r = simulateCurrentLoopStep(base());
      expect(r.overshootPct).toBeLessThan(20);
    });

    it('上升时间与一阶解析近似同数量级', () => {
      const tuned = tuneCurrentLoop({ ...motor, bandwidthFactor: 15 });
      const analytic = currentLoopStepResponse(2 * Math.PI * tuned.bandwidthDHz);
      const r = simulateCurrentLoopStep(base());
      expect(r.riseTimeUs).not.toBeNull();
      // 一拍延时让实际略慢；容差 3 倍
      expect(r.riseTimeUs!).toBeGreaterThan(analytic.riseTimeUs * 0.3);
      expect(r.riseTimeUs!).toBeLessThan(analytic.riseTimeUs * 3);
    });

    it('电压限幅过低时 saturated=true 且响应变慢', () => {
      const free = simulateCurrentLoopStep(base());
      const limited = simulateCurrentLoopStep({ ...base(), vLimit: 0.12 });
      expect(limited.saturated).toBe(true);
      expect(free.saturated).toBe(false);
      expect(limited.riseTimeUs!).toBeGreaterThan(free.riseTimeUs!);
    });

    it('Kp 过大（带宽逼近 fs）出现振荡：超调显著增大', () => {
      const good = simulateCurrentLoopStep(base());
      const aggressive = simulateCurrentLoopStep({ ...base(), kp: base().kp * 20 });
      expect(aggressive.overshootPct).toBeGreaterThan(good.overshootPct + 10);
    });
  });
});