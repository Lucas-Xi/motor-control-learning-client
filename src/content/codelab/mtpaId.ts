import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：MTPA 的 d 轴电流指令（11 号模块 field-weakening，配套 MtpaTrajectoryCard）。
 *
 * 公式取自 src/simulation/math/mtpa.ts 的 solveMtpa 迭代内闭式映射
 * （给定 iq 的 MTPA 关系，凸极项 (Lq-Ld) 与磁链项 ψf）：
 *   ΔL = Lq - Ld（H），id* = (ψf - √(ψf² + 8·ΔL²·iq²)) / (4·ΔL)
 * 接口从对象参数 (T_ref, Ld, Lq, psi_f, pole_pairs) 平铺换算为
 * (iqReq, psiF, ldMh, lqMh)，期望值由该闭式冻结（10 位小数）。
 */
export const mtpaIdChallenge: CodeChallenge = {
  id: 'mtpa-id',
  moduleId: 'field-weakening',
  functionName: 'mtpaId',
  difficulty: 2,
  title: e('编程挑战：MTPA 的 d 轴电流指令', 'Code Lab: MTPA d-axis current command'),
  statement: e(
    'IPM 电机的凸极转矩让"同样的 iq 配一点负 id"更省电流。给定 q 轴电流需求与电机参数，' +
      '实现 mtpaId(iqReq, psiF, ldMh, lqMh)，返回 [idRef]（单位 A）。' +
      '先算 ΔL = (Lq − Ld)——电感参数是 mH，记得换算成 H：id* = (ψf − √(ψf² + 8·ΔL²·iq²)) / (4·ΔL)。' +
      'ΔL = 0（SPM）或 iq = 0 时直接返回 0——先判再除，否则除零。负号是对的：MTPA 的 id 永远 ≤ 0。',
    'Saliency lets an IPM draw less total current for the same torque: pair the q-axis demand with a slightly negative id. ' +
      'Given the iq demand and motor parameters, implement mtpaId(iqReq, psiF, ldMh, lqMh) returning [idRef] in amps. ' +
      'Start with ΔL = (Lq − Ld) — the inductance args are in mH, convert to henries first: id* = (ψf − √(ψf² + 8·ΔL²·iq²)) / (4·ΔL). ' +
      'When ΔL = 0 (SPM) or iq = 0, just return 0 — check before dividing or you will divide by zero. The negative sign is correct: MTPA id is always ≤ 0.',
  ),
  starter: `// TODO: 返回 [idRef]（MTPA 的 d 轴电流指令，A）
// dL = (lqMh - ldMh) / 1000 先换成 H；idRef = (psiF - Math.sqrt(psiF*psiF + 8*dL*dL*iq*iq)) / (4*dL)
// dL 为 0（SPM）或 iqReq 为 0 时 idRef = 0
function mtpaId(iqReq, psiF, ldMh, lqMh) {
  const idRef = 0;
  return [idRef];
}
return mtpaId;`,
  starterEn: `// TODO: return [idRef] (MTPA d-axis current command, A)
// dL = (lqMh - ldMh) / 1000 converts mH to H first; idRef = (psiF - Math.sqrt(psiF*psiF + 8*dL*dL*iq*iq)) / (4*dL)
// When dL is 0 (SPM) or iqReq is 0, idRef = 0
function mtpaId(iqReq, psiF, ldMh, lqMh) {
  const idRef = 0;
  return [idRef];
}
return mtpaId;`,
  cases: [
    {
      label: 'iq=0 A, ψf=0.012 Wb, Ld=2.5, Lq=3.5 mH（零转矩 → id*=0）',
      args: [0, 0.012, 2.5, 3.5],
      expected: [0],
    },
    {
      label: 'iq=80 A, ψf=0.012, Ld=Lq=2.5 mH（SPM → id*=0）',
      args: [80, 0.012, 2.5, 2.5],
      expected: [0],
    },
    {
      label: 'iq=50 A, ψf=0.012, Ld=2.5, Lq=3.5 mH（典型凸极）',
      args: [50, 0.012, 2.5, 3.5],
      expected: [-32.4823899984],
    },
    {
      label: 'iq=150 A, ψf=0.012, Ld=2.5, Lq=3.5 mH（大电流）',
      args: [150, 0.012, 2.5, 3.5],
      expected: [-103.108435103],
    },
    {
      label: 'iq=50 A, ψf=0.008, Ld=1.2, Lq=3.0 mH（强凸极）',
      args: [50, 0.008, 1.2, 3.0],
      expected: [-34.2616830661],
    },
    {
      label: 'iq=100 A, ψf=0.07, Ld=2.0, Lq=2.6 mH（大功率弱凸极）',
      args: [100, 0.07, 2.0, 2.6],
      expected: [-47.3231656279],
    },
  ],
  hints: [
    e(
      '先做 ΔL = (lqMh − ldMh)/1000——mH 换成 H，否则根号里的量纲差三个数量级，结果全错。',
      'Compute ΔL = (lqMh − ldMh)/1000 first — convert mH to H, or the units inside the square root are off by three orders of magnitude.',
    ),
    e(
      'SPM 的 ΔL = 0，公式分母为零——先判 |ΔL| < 1e-7（或 iqReq 为 0）返回 0，两个测试用例正等着它。',
      'An SPM has ΔL = 0 and the formula divides by zero — return 0 early when |ΔL| < 1e-7 (or iqReq is 0); two test cases expect exactly that.',
    ),
    e(
      '大 iq 时 id* 渐近 −iq/√2（磁阻转矩主导）。STM32 上预计算 1/(4ΔL) 常数、开方用 VSQRT 或查表，ISR 内不做除法。',
      'As iq grows, id* approaches −iq/√2 (reluctance torque takes over). On STM32 precompute the 1/(4ΔL) constant and use VSQRT or a table sqrt — never divide inside the ISR.',
    ),
  ],
  cReference: `/* STM32 C 参考：MTPA 闭式解 —— 初始化预计算倒数，ISR 内零除法 */
typedef struct { float psi_f; float dL; float inv_4dL; } mtpa_t;

void mtpa_init(mtpa_t *m, float psi_f, float ld_h, float lq_h)  /* 单位 Wb / H */
{
    m->psi_f   = psi_f;
    m->dL      = lq_h - ld_h;
    m->inv_4dL = (fabsf(m->dL) < 1e-7f) ? 0.0f : 1.0f / (4.0f * m->dL);
}

static inline float mtpa_id(const mtpa_t *m, float iq)           /* 电流环 ISR */
{
    if (m->inv_4dL == 0.0f || iq == 0.0f) return 0.0f;  /* SPM / 零转矩 */
    float disc = m->psi_f * m->psi_f + 8.0f * m->dL * m->dL * iq * iq;
    return (m->psi_f - sqrtf(disc)) * m->inv_4dL;  /* VSQRT 单周期；q15 可查表 */
}`,
};

export const mtpaIdSolution: string = `function mtpaId(iqReq, psiF, ldMh, lqMh) {
  const dL = (lqMh - ldMh) / 1000;
  if (Math.abs(dL) < 1e-7 || iqReq === 0) return [0];
  const id = (psiF - Math.sqrt(psiF * psiF + 8 * dL * dL * iqReq * iqReq)) / (4 * dL);
  return [id];
}
return mtpaId;`;
