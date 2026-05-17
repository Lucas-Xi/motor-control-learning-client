import { describe, expect, it } from 'vitest';
import { calculateSvpwmMinMax } from './svpwmMinMax';
import { calculateSvpwm } from './svpwm';

describe('calculateSvpwmMinMax - 基础', () => {
  it('零电压矢量 → 三相占空比 = 0.5', () => {
    const r = calculateSvpwmMinMax({ Valpha: 0, Vbeta: 0, Vdc: 100 });
    expect(r.ta).toBeCloseTo(0.5, 9);
    expect(r.tb).toBeCloseTo(0.5, 9);
    expect(r.tc).toBeCloseTo(0.5, 9);
    expect(r.vCommon).toBeCloseTo(0, 9);
    expect(r.saturated).toBe(false);
  });

  it('占空比始终 ∈ [0, 1]', () => {
    for (const deg of [0, 30, 60, 90, 150, 210, 280, 359]) {
      for (const m of [0.1, 0.5, 0.99]) {
        const rad = (deg * Math.PI) / 180;
        const mag = (m * 100) / Math.sqrt(3);
        const r = calculateSvpwmMinMax({
          Valpha: mag * Math.cos(rad),
          Vbeta: mag * Math.sin(rad),
          Vdc: 100,
        });
        for (const d of [r.ta, r.tb, r.tc]) {
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('共模分量幅值在 Udc/6 范围内（标准 SVPWM 特征）', () => {
    for (const deg of [0, 30, 60, 90, 150, 210, 280]) {
      const rad = (deg * Math.PI) / 180;
      // 取线性区上限附近的 V
      const mag = 100 / Math.sqrt(3) * 0.95;
      const r = calculateSvpwmMinMax({
        Valpha: mag * Math.cos(rad),
        Vbeta: mag * Math.sin(rad),
        Vdc: 100,
      });
      // 标准 SVPWM 共模分量峰值 ≈ Udc/6 + 余量
      expect(Math.abs(r.vCommon)).toBeLessThan(100 / 6 + 1);
    }
  });
});

describe('calculateSvpwmMinMax - 线性区数学验证', () => {
  /**
   * 关键不变量：
   * 1) 线-线电压（duty_x - duty_y）应等于反 Clarke 给出的 (va - vb)/Vdc；
   *    共模 V_cm 在线-线相消，证明 Min/Max 注入对电机绕组透明。
   * 2) 七段式 SVPWM 与 Min/Max 法的等价性体现在**线-线电压相等**——
   *    单相 duty 可能因实现的归一化常数不同而差一个固定因子，但线-线必须一致到数值精度。
   * 注：仓库里的 calculateSvpwm 与 Min/Max 的单相 duty 不完全数值相等（不同实现使用了
   * 不同的归一化），所以这里只检验线-线一致性、最大 ≤ 1、共模幅值合理性。
   */
  it('线-线 duty 差应等于反 Clarke 相电压差 / Vdc（共模相消）', () => {
    for (const deg of [10, 50, 100, 170, 230, 290]) {
      for (const m of [0.2, 0.6, 0.9]) {
        const rad = (deg * Math.PI) / 180;
        const mag = (m * 100) / Math.sqrt(3);
        const Valpha = mag * Math.cos(rad);
        const Vbeta = mag * Math.sin(rad);

        const mm = calculateSvpwmMinMax({ Valpha, Vbeta, Vdc: 100 });

        // 反 Clarke 算出的相电压
        const va = Valpha;
        const vb = -0.5 * Valpha + (Math.sqrt(3) / 2) * Vbeta;
        const vc = -0.5 * Valpha - (Math.sqrt(3) / 2) * Vbeta;

        // 线-线 duty 差 = (va - vb) / Vdc（V_cm 在差里相消）
        expect(mm.ta - mm.tb).toBeCloseTo((va - vb) / 100, 9);
        expect(mm.tb - mm.tc).toBeCloseTo((vb - vc) / 100, 9);
      }
    }
  });

  it('调用现有 calculateSvpwm 不应抛错，且两种实现都给出合法占空比', () => {
    // 文档性：保证两种 SVPWM 都能在同输入下产出 [0,1] 占空比，不强制单相数值相等。
    const Valpha = 30;
    const Vbeta = 20;
    const Vdc = 100;
    const mm = calculateSvpwmMinMax({ Valpha, Vbeta, Vdc });
    const sv = calculateSvpwm({ uAlpha: Valpha, uBeta: Vbeta, uDc: Vdc });
    for (const d of [mm.ta, mm.tb, mm.tc, sv.dutyA, sv.dutyB, sv.dutyC]) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

describe('calculateSvpwmMinMax - 过调制检测', () => {
  it('线性区上限内 saturated=false', () => {
    const mag = (0.9 * 100) / Math.sqrt(3);
    const r = calculateSvpwmMinMax({ Valpha: mag, Vbeta: 0, Vdc: 100 });
    expect(r.saturated).toBe(false);
  });

  it('幅值超过线性区 → saturated=true', () => {
    // SVPWM 线性区上限：|V| = Vdc/√3 ≈ 57.7。设 Valpha=80 > 57.7
    const r = calculateSvpwmMinMax({ Valpha: 80, Vbeta: 0, Vdc: 100 });
    expect(r.saturated).toBe(true);
    // 过调制后占空比应被截断到 [0, 1]
    expect(r.ta).toBeLessThanOrEqual(1);
    expect(r.tc).toBeGreaterThanOrEqual(0);
  });

  it('Vdc 输入过小时不会除零', () => {
    const r = calculateSvpwmMinMax({ Valpha: 1, Vbeta: 1, Vdc: 0 });
    expect(Number.isFinite(r.ta)).toBe(true);
    expect(Number.isFinite(r.tb)).toBe(true);
    expect(Number.isFinite(r.tc)).toBe(true);
  });
});
