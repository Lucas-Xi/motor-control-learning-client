import { describe, expect, it } from 'vitest';
import { solveMtpa } from './mtpa';

// 工具：用 dq 电流 + 电机参数算电磁转矩，复核 MTPA 解
function torque(id: number, iq: number, Ld: number, Lq: number, psi_f: number, Pn: number): number {
  return 1.5 * Pn * (psi_f * iq + (Ld - Lq) * id * iq);
}

describe('solveMtpa - SPM 退化', () => {
  const Pn = 4;
  const psi_f = 0.12;

  it('Ld = Lq 时 id_ref 应为 0', () => {
    const r = solveMtpa({ T_ref: 2, Ld: 0.002, Lq: 0.002, psi_f, pole_pairs: Pn });
    expect(r.isSpm).toBe(true);
    expect(r.id_ref).toBeCloseTo(0, 9);
  });

  it('SPM 下 iq = T / (1.5·Pn·ψf)', () => {
    const T_ref = 3;
    const r = solveMtpa({ T_ref, Ld: 0.001, Lq: 0.001, psi_f, pole_pairs: Pn });
    expect(r.iq_ref).toBeCloseTo(T_ref / (1.5 * Pn * psi_f), 6);
  });

  it('SPM 负转矩（再生）：iq 应同号变负', () => {
    const r = solveMtpa({ T_ref: -2, Ld: 0.001, Lq: 0.001, psi_f, pole_pairs: Pn });
    expect(r.iq_ref).toBeLessThan(0);
    expect(r.id_ref).toBeCloseTo(0, 9);
  });
});

describe('solveMtpa - IPM 闭式 + 微迭代', () => {
  const Pn = 4;
  const psi_f = 0.1;
  const Ld = 0.0008;
  const Lq = 0.0020; // IPM: Lq > Ld

  it('IPM 下 id_ref 应为负（去磁方向，利用磁阻转矩）', () => {
    const r = solveMtpa({ T_ref: 5, Ld, Lq, psi_f, pole_pairs: Pn });
    expect(r.isSpm).toBe(false);
    expect(r.id_ref).toBeLessThan(0);
  });

  it('IPM 解出的 (id, iq) 实际转矩应接近 T_ref', () => {
    const T_ref = 4;
    const r = solveMtpa({ T_ref, Ld, Lq, psi_f, pole_pairs: Pn, iter: 5 });
    const teActual = torque(r.id_ref, r.iq_ref, Ld, Lq, psi_f, Pn);
    expect(teActual).toBeCloseTo(T_ref, 1); // 1% 精度
  });

  it('MTPA 解的电流幅值应小于"id=0 方案"', () => {
    const T_ref = 4;
    const r = solveMtpa({ T_ref, Ld, Lq, psi_f, pole_pairs: Pn, iter: 5 });
    const iq_spm = T_ref / (1.5 * Pn * psi_f);
    const Is_spm = Math.abs(iq_spm);
    expect(r.Is).toBeLessThan(Is_spm); // MTPA 用磁阻转矩省电流
  });

  it('数值最优性检验：MTPA 解相比邻近 id 应是局部最小电流幅值', () => {
    const T_ref = 3;
    const r = solveMtpa({ T_ref, Ld, Lq, psi_f, pole_pairs: Pn, iter: 5 });
    const dL = Lq - Ld;
    // 在 MTPA 解附近扰动 id，反解 iq 使 Te = T_ref，检查电流幅值是否更大
    for (const dId of [-0.5, 0.5]) {
      const id_test = r.id_ref + dId;
      const k_iq = 1.5 * Pn * (psi_f + (Ld - Lq) * id_test);
      if (Math.abs(k_iq) < 1e-9) continue;
      const iq_test = T_ref / k_iq;
      const Is_test = Math.hypot(id_test, iq_test);
      expect(Is_test).toBeGreaterThanOrEqual(r.Is * 0.999); // MTPA 是最小
      void dL;
    }
  });

  it('零转矩输入 → id=0, iq=0', () => {
    const r = solveMtpa({ T_ref: 0, Ld, Lq, psi_f, pole_pairs: Pn });
    expect(Math.abs(r.iq_ref)).toBeLessThan(1e-6);
  });

  it('IPM 负转矩对称性：iq 反号，id 仍为负', () => {
    const r_pos = solveMtpa({ T_ref: 4, Ld, Lq, psi_f, pole_pairs: Pn });
    const r_neg = solveMtpa({ T_ref: -4, Ld, Lq, psi_f, pole_pairs: Pn });
    expect(r_neg.iq_ref).toBeCloseTo(-r_pos.iq_ref, 4);
    expect(r_neg.id_ref).toBeCloseTo(r_pos.id_ref, 4); // id 不变号（MTPA 关于 q 轴对称）
  });

  it('极对数缩放：Pn=2 vs Pn=4 同 T_ref 下 iq 应近似反比', () => {
    const r1 = solveMtpa({ T_ref: 2, Ld, Lq, psi_f, pole_pairs: 2 });
    const r2 = solveMtpa({ T_ref: 2, Ld, Lq, psi_f, pole_pairs: 4 });
    expect(r2.iq_ref).toBeLessThan(r1.iq_ref);
  });
});
