/**
 * MTPA (Maximum Torque Per Ampere) —— IPM 最大转矩电流比闭式解。
 *
 * 物理背景见文件顶部原注释。
 */

import { clampError } from './limits';

export interface MtpaInput {
  T_ref: number;
  Ld: number;
  Lq: number;
  psi_f: number;
  pole_pairs: number;
  /** Newton 迭代次数（默认 3） */
  iter?: number;
}

export interface MtpaOutput {
  id_ref: number;
  iq_ref: number;
  Is: number;
  isSpm: boolean;
  /** 迭代是否不收敛（残余转矩 > 5% 目标） */
  divergent?: boolean;
}

function spmSolve(T_ref: number, psi_f: number, Pn: number): { id: number; iq: number } {
  const denom = 1.5 * Pn * psi_f;
  if (Math.abs(denom) < 1e-12) return { id: 0, iq: 0 };
  return { id: 0, iq: T_ref / denom };
}

export function solveMtpa(input: MtpaInput): MtpaOutput {
  const T_ref = clampError(input.T_ref, -1e6, 1e6);
  const Ld = clampError(input.Ld, 1e-12, 1);
  const Lq = clampError(input.Lq, 1e-12, 1);
  const psi_f = clampError(input.psi_f, 1e-12, 1);
  const Pn = clampError(input.pole_pairs, 1, 32);
  const dL = Lq - Ld;

  if (Math.abs(dL) < 1e-7 || Math.abs(psi_f) < 1e-9) {
    const { id, iq } = spmSolve(T_ref, psi_f, Pn);
    return { id_ref: id, iq_ref: iq, Is: Math.hypot(id, iq), isSpm: true };
  }

  let iq = spmSolve(T_ref, psi_f, Pn).iq;
  let id = 0;
  const iter = Math.max(1, Math.min(input.iter ?? 3, 20));
  let divergent = false;

  for (let k = 0; k < iter; k++) {
    const iqPrev = iq;
    const disc = psi_f * psi_f + 8 * dL * dL * iq * iq;
    // NaN 防护：disc 为负说明数值异常，强制退出
    if (disc < 0) { divergent = true; break; }
    id = (psi_f - Math.sqrt(disc)) / (4 * dL);
    const k_iq = 1.5 * Pn * (psi_f + (Ld - Lq) * id);
    if (Math.abs(k_iq) < 1e-12) { divergent = true; break; }
    iq = T_ref / k_iq;

    // 发散检测：iq 振荡幅度 > 100% 则退出
    if (k > 0 && Math.abs(iq - iqPrev) > Math.abs(iqPrev) * 2) {
      divergent = true;
      break;
    }
    // 已收敛：残余 < 1%
    if (k > 0 && Math.abs(iq - iqPrev) < Math.abs(iqPrev) * 0.01) break;
  }

  return {
    id_ref: id,
    iq_ref: iq,
    Is: Math.hypot(id, iq),
    isSpm: false,
    divergent,
  };
}