import { describe, expect, it } from 'vitest';
import { clarkeTransform, inverseClarkeTransform, parkTransform, inverseParkTransform } from '../transforms';

const TOL = 1e-9;

describe('Clarke transform', () => {
  it('零输入 → 零输出', () => {
    const r = clarkeTransform({ ia: 0, ib: 0, ic: 0 });
    expect(r.alpha).toBeCloseTo(0, 10);
    expect(r.beta).toBeCloseTo(0, 10);
  });

  it('单位平衡三相 → α=1, β=0（电角度 0°）', () => {
    // ia = cos(0), ib = cos(-120°), ic = cos(+120°)
    const ia = 1;
    const ib = Math.cos(-2 * Math.PI / 3);   // -0.5
    const ic = Math.cos(2 * Math.PI / 3);    // -0.5
    const r = clarkeTransform({ ia, ib, ic });
    expect(r.alpha).toBeCloseTo(1, 9);
    expect(r.beta).toBeCloseTo(0, 9);
    expect(r.zero).toBeCloseTo(0, 9);
  });

  it('inverse(Clarke(x)) = x （平衡三相往返）', () => {
    const original = { ia: 3.2, ib: -1.8, ic: -1.4 }; // 和为 0
    const ab = clarkeTransform(original);
    const back = inverseClarkeTransform(ab);
    expect(back.ia).toBeCloseTo(original.ia, 9);
    expect(back.ib).toBeCloseTo(original.ib, 9);
    expect(back.ic).toBeCloseTo(original.ic, 9);
  });

  it('Clarke 必须保持 α=ia（amplitude-invariant 约定的检验）', () => {
    const r = clarkeTransform({ ia: 7.5, ib: -3, ic: -4.5 });
    expect(r.alpha).toBeCloseTo(7.5, TOL);
  });
});

describe('Park transform', () => {
  it('θ=0 时 dq = αβ', () => {
    const r = parkTransform({ alpha: 2.5, beta: -1.2 }, 0);
    expect(r.d).toBeCloseTo(2.5, 9);
    expect(r.q).toBeCloseTo(-1.2, 9);
  });

  it('θ=π/2 时旋转 90°：d=β, q=-α', () => {
    const r = parkTransform({ alpha: 3, beta: 4 }, Math.PI / 2);
    expect(r.d).toBeCloseTo(4, 9);
    expect(r.q).toBeCloseTo(-3, 9);
  });

  it('inverse(Park(x, θ), θ) = x （任意角度往返）', () => {
    for (const theta of [0.1, 0.7, Math.PI, -1.5, 2.7]) {
      const original = { alpha: 5.5, beta: -2.3 };
      const dq = parkTransform(original, theta);
      const back = inverseParkTransform(dq, theta);
      expect(back.alpha).toBeCloseTo(original.alpha, 9);
      expect(back.beta).toBeCloseTo(original.beta, 9);
    }
  });
});
