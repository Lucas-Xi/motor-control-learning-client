import { describe, expect, it } from 'vitest';
import { compensateDeadTime } from './deadtime';

describe('compensateDeadTime', () => {
  const baseInput = {
    t_dead_us: 2,
    t_sw_us: 62.5, // 16 kHz
    Vdc: 310,
    i_hys: 0,
    prevSign: { a: 0, b: 0, c: 0 },
  };

  it('零电流（无滞环）应返回零补偿', () => {
    const r = compensateDeadTime({ ia: 0, ib: 0, ic: 0, ...baseInput });
    expect(r.ddA).toBeCloseTo(0, 12);
    expect(r.ddB).toBeCloseTo(0, 12);
    expect(r.ddC).toBeCloseTo(0, 12);
  });

  it('正电流应给出负的占空比修正（反向补偿）', () => {
    const r = compensateDeadTime({ ia: 5, ib: 5, ic: 5, ...baseInput });
    // Δd = t_dead / T_sw = 2/62.5 = 0.032，补偿是 -Δd × sign(i)
    expect(r.ddA).toBeCloseTo(-0.032, 6);
    expect(r.ddB).toBeCloseTo(-0.032, 6);
    expect(r.ddC).toBeCloseTo(-0.032, 6);
    expect(r.signA).toBe(1);
  });

  it('负电流应给出正的占空比修正', () => {
    const r = compensateDeadTime({ ia: -3, ib: -3, ic: -3, ...baseInput });
    expect(r.ddA).toBeCloseTo(0.032, 6);
    expect(r.signA).toBe(-1);
    expect(r.signB).toBe(-1);
  });

  it('电压偏差量纲检验：ΔV = t_dead·f_sw·Udc·sign(i)', () => {
    const r = compensateDeadTime({ ia: 10, ib: -10, ic: 0, ...baseInput });
    // ΔV = 2e-6 × 16000 × 310 = 9.92 V
    expect(r.dvA).toBeCloseTo(9.92, 3);
    expect(r.dvB).toBeCloseTo(-9.92, 3);
    expect(r.dvC).toBeCloseTo(0, 6);
  });

  it('过零附近无滞环（i_hys=0）时符号会"硬切"', () => {
    const a = compensateDeadTime({ ia: 0.001, ib: 0, ic: 0, ...baseInput });
    const b = compensateDeadTime({ ia: -0.001, ib: 0, ic: 0, ...baseInput });
    expect(a.signA).toBe(1);
    expect(b.signA).toBe(-1);
    // 硬切：极小电流变化导致补偿量符号翻转
    expect(Math.sign(a.ddA)).not.toBe(Math.sign(b.ddA));
  });

  it('启用滞环 i_hys=1 A：小电流 |i|<1 时保持上一拍 sign，避免补偿抖动', () => {
    const r1 = compensateDeadTime({
      ia: 0.3, ib: 0, ic: 0, ...baseInput,
      i_hys: 1,
      prevSign: { a: 1, b: 0, c: 0 },
    });
    expect(r1.signA).toBe(1); // 维持记忆值
    // 当 prevSign=0 且在无人区时输出 0（避免开机冷启动跳变）
    const r2 = compensateDeadTime({
      ia: 0.3, ib: 0, ic: 0, ...baseInput,
      i_hys: 1,
      prevSign: { a: 0, b: 0, c: 0 },
    });
    expect(r2.signA).toBe(0);
    expect(r2.ddA).toBeCloseTo(0, 12);
  });

  it('滞环上边界：|i|=i_hys 应给出真实 sign，不再保持记忆', () => {
    const r = compensateDeadTime({
      ia: 1, ib: -1, ic: 0, ...baseInput,
      i_hys: 1,
      prevSign: { a: -1, b: 1, c: 0 },
    });
    expect(r.signA).toBe(1);  // i >= +hys
    expect(r.signB).toBe(-1); // i <= -hys
  });

  it('补偿后占空比误差应被显著减小（与原始误差反号、同模）', () => {
    // 假设原始 PWM 误差 Δd = sign(i)·td/Ts；补偿量应与其等大反号
    const i = 7;
    const r = compensateDeadTime({ ia: i, ib: -i, ic: 0, ...baseInput });
    const originalErrorA = Math.sign(i) * (baseInput.t_dead_us / baseInput.t_sw_us);
    expect(r.ddA).toBeCloseTo(-originalErrorA, 9);
  });
});
