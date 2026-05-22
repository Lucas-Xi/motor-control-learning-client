import { describe, expect, it } from 'vitest';
import { saturatedInductances, sampleSaturationParams } from './saturation';

describe('saturatedInductances - 空载行为', () => {
  it('id=iq=0 时返回空载值', () => {
    const r = saturatedInductances(0, 0, sampleSaturationParams.hitachi15HP);
    expect(r.ld).toBeCloseTo(sampleSaturationParams.hitachi15HP.ld0, 6);
    expect(r.lq).toBeCloseTo(sampleSaturationParams.hitachi15HP.lq0, 6);
    expect(r.saliency).toBeCloseTo(2.1 / 1.2, 3);
    expect(r.margin).toBe(1);
  });
});

describe('saturatedInductances - q 轴饱和', () => {
  it('iq 增大 → Lq 下降', () => {
    const noLoad = saturatedInductances(0, 0, sampleSaturationParams.hitachi15HP);
    const halfLoad = saturatedInductances(0, 6, sampleSaturationParams.hitachi15HP);
    const fullLoad = saturatedInductances(0, 12, sampleSaturationParams.hitachi15HP);
    expect(halfLoad.lq).toBeLessThan(noLoad.lq);
    expect(fullLoad.lq).toBeLessThan(halfLoad.lq);
    // 额定 iq 应让 Lq 至少下降 15%
    expect(fullLoad.lq).toBeLessThan(noLoad.lq * 0.85);
  });
});

describe('saturatedInductances - 凸极比退化', () => {
  it('重载下凸极比从空载 1.75 退化（教学关键现象）', () => {
    const noLoad = saturatedInductances(0, 0, sampleSaturationParams.hitachi15HP);
    const heavy = saturatedInductances(-3, 11, sampleSaturationParams.hitachi15HP);
    expect(noLoad.saliency).toBeGreaterThan(1.7);
    // 重载至少 8% 退化（家用 IPM 典型 10-15%，EV 主驱可达 25%+）
    expect(heavy.saliency).toBeLessThan(noLoad.saliency * 0.92);
  });
});

describe('saturatedInductances - 交叉饱和', () => {
  it('iq 也会让 Ld 略下降（cross-coupling）', () => {
    const onlyId = saturatedInductances(5, 0, sampleSaturationParams.hitachi15HP);
    const idPlusIq = saturatedInductances(5, 8, sampleSaturationParams.hitachi15HP);
    expect(idPlusIq.ld).toBeLessThan(onlyId.ld);
  });
});

describe('saturatedInductances - 物理下限', () => {
  it('极端电流不会让 L 跌破空载的 30%', () => {
    const extreme = saturatedInductances(20, 30, sampleSaturationParams.hitachi15HP);
    expect(extreme.ld).toBeGreaterThanOrEqual(sampleSaturationParams.hitachi15HP.ld0 * 0.3);
    expect(extreme.lq).toBeGreaterThanOrEqual(sampleSaturationParams.hitachi15HP.lq0 * 0.3);
  });
});

describe('saturatedInductances - SPM 表贴式', () => {
  it('SPM 凸极比始终接近 1', () => {
    const heavy = saturatedInductances(0, 10, sampleSaturationParams.spmSurface);
    expect(heavy.saliency).toBeGreaterThan(0.95);
    expect(heavy.saliency).toBeLessThan(1.05);
  });
});

describe('saturatedInductances - margin 单调性', () => {
  it('双轴电流增大 → margin 单调下降', () => {
    const m0 = saturatedInductances(0, 0, sampleSaturationParams.hitachi15HP).margin;
    const m1 = saturatedInductances(2, 6, sampleSaturationParams.hitachi15HP).margin;
    const m2 = saturatedInductances(5, 12, sampleSaturationParams.hitachi15HP).margin;
    expect(m0).toBeGreaterThan(m1);
    expect(m1).toBeGreaterThan(m2);
  });
});
