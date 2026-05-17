/**
 * MTPA (Maximum Torque Per Ampere) —— IPM 最大转矩电流比闭式解。
 *
 * 物理背景：
 *   PMSM 电磁转矩（标准 dq 模型，电流约定 id 与转子磁链同向为正）：
 *
 *     Te = 1.5 · Pn · [ψf · iq + (Ld - Lq) · id · iq]                              [N·m]
 *
 *   其中第一项为永磁转矩，第二项为磁阻转矩（IPM 才有，因 Ld < Lq → Ld-Lq < 0）。
 *   令 Is = sqrt(id² + iq²)、id = -Is·sin(γ)、iq = Is·cos(γ)（γ 为电流矢量超前 q 轴角度，IPM 中 γ>0）：
 *
 *     Te(γ) = 1.5 · Pn · Is · [ψf·cos(γ) + (Lq - Ld) · Is · sin(γ) · cos(γ)]
 *           = 1.5 · Pn · Is · [ψf·cos(γ) + 0.5·(Lq - Ld)·Is·sin(2γ)]
 *
 *   ∂Te/∂γ = 0 解出最优 γ：
 *
 *     ψf·sin(γ) = (Lq - Ld)·Is·cos(2γ)        (用 sin(2γ) 求导 → 2cos(2γ))
 *
 *   引入辅助变量 u = sin(γ)，结合 cos(2γ) = 1 - 2u² 整理为关于 u 的二次方程，最终闭式解为：
 *
 *     id* = [ψf - sqrt(ψf² + 8·(Lq-Ld)²·iq²)] / [4·(Lq-Ld)]                       (IPM, Lq > Ld)
 *
 *   给定 T_ref 时反求 iq 用迭代或近似（本实现用 Newton 1-2 步收敛）。
 *
 * SPM 退化：
 *   当 Ld ≈ Lq（表贴式），磁阻转矩 → 0，最优解直接为：
 *
 *     id* = 0
 *     iq* = T_ref / (1.5 · Pn · ψf)
 *
 *   本函数用 |Lq - Ld| < ε 判定，自动走 SPM 分支，避免除零。
 *
 * 参考：
 *   - 阮毅《电力拖动自动控制系统》第 7 章 7.4 节"MTPA 控制策略"
 *   - Bose, "Modern Power Electronics and AC Drives" §8.3.3
 *   - TI Application Report SPRABZ0 "Sensored Field Oriented Control of 3-Phase
 *     Permanent Magnet Synchronous Motors"
 *
 * 单位：
 *   - T_ref: N·m（电磁转矩）
 *   - Ld, Lq: H（dq 同步电感，IPM 下 Lq > Ld）
 *   - psi_f: Wb（永磁磁链）
 *   - pole_pairs: 极对数（无量纲）
 *
 * STM32 移植要点：
 *   - q31 实现：sqrt() 用 CMSIS arm_sqrt_q31 或硬件 VFP；闭式解避免迭代，单次中断可完成。
 *   - ISR 周期：MTPA 一般跑在**速度环节拍**（1-2 kHz），不必塞进电流环（10-20 kHz），结果作为
 *     id_ref / iq_ref 喂给电流环。
 *   - 查表 vs 迭代：闭式解只含 1 次 sqrt + 4 次乘加，比 LUT 还便宜；不需要查表。
 *   - 数值健壮：保证 Lq ≥ Ld（IPM 物理约束），psi_f > 0；负值要在调参阶段截掉。
 */

export interface MtpaInput {
  /** 目标电磁转矩 N·m，可为负（再生制动） */
  T_ref: number;
  /** d 轴电感 H */
  Ld: number;
  /** q 轴电感 H，IPM 时 Lq > Ld */
  Lq: number;
  /** 永磁磁链 Wb */
  psi_f: number;
  /** 极对数 */
  pole_pairs: number;
  /** Newton 迭代次数（默认 3，对 1% 精度足够） */
  iter?: number;
}

export interface MtpaOutput {
  /** d 轴电流参考 A，IPM 下应为负 */
  id_ref: number;
  /** q 轴电流参考 A，与 T_ref 同号 */
  iq_ref: number;
  /** 电流幅值 Is = sqrt(id² + iq²) A */
  Is: number;
  /** 是否走 SPM 退化分支 */
  isSpm: boolean;
}

/** SPM 解析解：id=0, iq=T/(1.5·Pn·ψf) */
function spmSolve(T_ref: number, psi_f: number, Pn: number): { id: number; iq: number } {
  const denom = 1.5 * Pn * psi_f;
  if (Math.abs(denom) < 1e-12) {
    return { id: 0, iq: 0 };
  }
  return { id: 0, iq: T_ref / denom };
}

/**
 * MTPA 闭式 + 微迭代实现。
 *
 * 流程：
 *   1) 若 |Lq - Ld| < ε → SPM 分支直接返回。
 *   2) 假设 iq 初值 = SPM 解（id=0），由 iq 闭式算出 id*。
 *   3) 用 Te = 1.5·Pn·[ψf·iq + (Ld-Lq)·id·iq] 反推 iq 修正：iq_new = T_ref / [1.5·Pn·(ψf + (Ld-Lq)·id)]。
 *   4) Newton 1-3 次迭代收敛（IPM 磁阻贡献通常 < 30%，初值已很接近）。
 */
export function solveMtpa(input: MtpaInput): MtpaOutput {
  const { T_ref, Ld, Lq, psi_f, pole_pairs: Pn } = input;
  const dL = Lq - Ld; // IPM > 0

  // SPM 退化：磁阻可忽略
  if (Math.abs(dL) < 1e-7 || Math.abs(psi_f) < 1e-9) {
    const { id, iq } = spmSolve(T_ref, psi_f, Pn);
    return { id_ref: id, iq_ref: iq, Is: Math.hypot(id, iq), isSpm: true };
  }

  // 初值：SPM 解
  let iq = spmSolve(T_ref, psi_f, Pn).iq;
  let id = 0;
  const iter = Math.max(1, input.iter ?? 3);

  for (let k = 0; k < iter; k += 1) {
    // 闭式：id* = [ψf - sqrt(ψf² + 8·dL²·iq²)] / [4·dL]    (推导见文件头)
    const disc = psi_f * psi_f + 8 * dL * dL * iq * iq;
    id = (psi_f - Math.sqrt(disc)) / (4 * dL);
    // dL > 0 时 sqrt(disc) > psi_f → id < 0（去磁方向），符合 IPM 物理
    // 反推 iq：让 Te = T_ref
    const k_iq = 1.5 * Pn * (psi_f + (Ld - Lq) * id); // (Ld - Lq) = -dL
    if (Math.abs(k_iq) < 1e-12) break;
    iq = T_ref / k_iq;
  }

  return {
    id_ref: id,
    iq_ref: iq,
    Is: Math.hypot(id, iq),
    isSpm: false,
  };
}
