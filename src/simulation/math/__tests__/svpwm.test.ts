import { describe, expect, it } from 'vitest';
import { calculateSvpwm, determineSvpwmSector } from '../svpwm';

describe('SVPWM sector detection', () => {
  it('+α 轴方向 → 扇区 1', () => {
    expect(determineSvpwmSector(1, 0)).toBe(1);
  });

  it('+β 轴方向 → 扇区 2', () => {
    expect(determineSvpwmSector(0, 1)).toBe(2);
  });

  it('扇区编号必须 ∈ [1, 6]', () => {
    for (const deg of [0, 30, 60, 90, 150, 200, 250, 300, 359]) {
      const rad = (deg * Math.PI) / 180;
      const s = determineSvpwmSector(Math.cos(rad), Math.sin(rad));
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(6);
    }
  });
});

describe('SVPWM time allocation', () => {
  // Domain audit bug: 原实现 T1/T2 多除了 sin(60°)，让线性区上限被错误压到 m≈0.866。
  // 这两个用例锁死正确公式：m=1（线性区上限）+ 扇区中点 θ=30° 时 T1+T2 应等于 ts。
  it('线性区上限 m=1，扇区中点 θ=30°，T1+T2 应=ts（不能 <ts/√3 之类的非物理值）', () => {
    const uDc = 100;
    const m = 0.998;  // 近似 1，避开内部 clamp 到 0.999
    const angleSectorMid = Math.PI / 6;   // 30°
    // 在扇区 1 内的中点：Uref 与 +α 轴夹角 30°
    const magnitude = (m * uDc) / Math.sqrt(3);
    const uAlpha = magnitude * Math.cos(angleSectorMid);
    const uBeta = magnitude * Math.sin(angleSectorMid);
    const r = calculateSvpwm({ uAlpha, uBeta, uDc, carrierPeriod: 1 });
    // T1+T2 应接近 ts=1（线性区上限），允许 5% 误差
    expect(r.t1 + r.t2).toBeGreaterThan(0.95);
    expect(r.t1 + r.t2).toBeLessThanOrEqual(1.001);
    // T0 应该接近 0
    expect(r.t0).toBeLessThan(0.05);
  });

  it('m≈0 时 T0 应=ts（全零矢量）', () => {
    const r = calculateSvpwm({ uAlpha: 0, uBeta: 0, uDc: 100, carrierPeriod: 1 });
    expect(r.t1).toBeCloseTo(0, 6);
    expect(r.t2).toBeCloseTo(0, 6);
    expect(r.t0).toBeCloseTo(1, 6);
  });

  it('占空比必须 ∈ [0,1]', () => {
    // 跨各种角度 & 调制度
    for (const deg of [10, 50, 90, 130, 200, 280]) {
      for (const m of [0.1, 0.4, 0.8, 0.99]) {
        const rad = (deg * Math.PI) / 180;
        const mag = (m * 100) / Math.sqrt(3);
        const r = calculateSvpwm({
          uAlpha: mag * Math.cos(rad),
          uBeta: mag * Math.sin(rad),
          uDc: 100,
        });
        for (const d of [r.dutyA, r.dutyB, r.dutyC]) {
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('对称扇区 1 vs 扇区 4：α 反号 β 同号 → dutyA 和 dutyC 角色互换', () => {
    // 扇区 1：θ=30°
    const a1 = Math.cos(Math.PI / 6);
    const b1 = Math.sin(Math.PI / 6);
    const r1 = calculateSvpwm({ uAlpha: a1 * 20, uBeta: b1 * 20, uDc: 100 });
    // 扇区 4：θ=210°（与扇区 1 中点关于原点对称）
    const a4 = Math.cos(Math.PI + Math.PI / 6);
    const b4 = Math.sin(Math.PI + Math.PI / 6);
    const r4 = calculateSvpwm({ uAlpha: a4 * 20, uBeta: b4 * 20, uDc: 100 });
    expect(r1.sector).toBe(1);
    expect(r4.sector).toBe(4);
    // 扇区 1 dutyA 大、扇区 4 dutyA 小（对偶关系）
    expect(r1.dutyA).toBeGreaterThan(r4.dutyA);
    expect(r4.dutyC).toBeGreaterThan(r1.dutyC);
  });
});
