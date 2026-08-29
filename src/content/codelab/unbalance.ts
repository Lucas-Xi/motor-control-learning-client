import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：三相不平衡度（12 号模块 · 故障诊断）。
 *
 * 题面公式（与 NEMA/UVEI 峰值法的简化教学版一致）：
 *   pct = (max − min) / |avg| × 100，avg = (ia+ib+ic)/3；
 *   |avg| < 1e-9（平均分量≈0，分母无意义）时规定返回 0，防除零。
 * 测试向量按上式冻结生成（10 位小数，运行期零依赖）。
 */
export const unbalanceChallenge: CodeChallenge = {
  id: 'current-unbalance',
  moduleId: 'faults-debugging',
  functionName: 'unbalance',
  difficulty: 2,
  title: e('编程挑战：计算三相电流不平衡度', 'Code Lab: compute the three-phase current unbalance'),
  statement: e(
    '三相电流采样后，诊断算法第一件事往往就是算不平衡度：取三相中的最大值与最小值之差，' +
      '除以三相平均值的绝对值并写成百分数。实现 unbalance(ia, ib, ic) 返回 [pct]：' +
      'pct = (max − min) / |avg| × 100，avg = (ia+ib+ic)/3。' +
      '若 |avg| < 1e-9（平均分量≈0，如对称正负电流），分母失去意义——此时直接返回 [0]（防除零，题面规定）。',
    'After sampling the three phase currents, the first thing a diagnostic usually computes is the unbalance: the spread between the largest and smallest phase, divided by the absolute average and expressed as a percentage. ' +
      'Implement unbalance(ia, ib, ic) returning [pct]: pct = (max − min) / |avg| × 100 with avg = (ia+ib+ic)/3. ' +
      'If |avg| < 1e-9 (near-zero average, e.g. symmetric positive/negative currents) the denominator is meaningless — return [0] in that case (divide-by-zero guard, as specified).',
  ),
  starter: `// TODO: 返回 [pct]（三相不平衡度，%）
// 提示：avg = (ia+ib+ic)/3；pct = (max-min)/|avg|*100；|avg| < 1e-9 时返回 [0]
function unbalance(ia, ib, ic) {
  const avg = (ia + ib + ic) / 3;
  const pct = 0;
  return [pct];
}
return unbalance;`,
  cases: [
    { label: 'Ia=10, Ib=10, Ic=10（完全平衡）', args: [10, 10, 10], expected: [0] },
    { label: 'Ia=10, Ib=5, Ic=10（单相跌落一半）', args: [10, 5, 10], expected: [60.0000000000] },
    { label: 'Ia=8, Ib=6, Ic=7（两相不平衡）', args: [8, 6, 7], expected: [28.5714285714] },
    { label: 'Ia=-5, Ib=-4, Ic=-6（负值电流，avg<0）', args: [-5, -4, -6], expected: [40.0000000000] },
    { label: 'Ia=3, Ib=-3, Ic=0（avg≈0，防除零）', args: [3, -3, 0], expected: [0] },
    { label: 'Ia=2, Ib=-1, Ic=-1（avg=0 但跨度 3，仍须返回 0）', args: [2, -1, -1], expected: [0] },
  ],
  hints: [
    e(
      '三个数取最大/最小：Math.max(ia, ib, ic) 与 Math.min(ia, ib, ic) 直接可用，别手写嵌套 if。',
      'For max/min of three values just use Math.max(ia, ib, ic) and Math.min(ia, ib, ic) — no nested ifs needed.',
    ),
    e(
      '分母用 |avg|（绝对值）：负的平均电流（反相序/发电工况）也该得到正的不平衡度。',
      'Divide by |avg| (absolute value): a negative average current (reversed sequence / generating mode) must still yield a positive unbalance.',
    ),
    e(
      '先把 |avg|<1e-9 的分支放在除法之前 return [0]——否则对称电流会除以 0 得 Infinity，判题直接判 nonfinite。STM32 上同理：先查阈值再做除法。',
      'Put the |avg|<1e-9 check and return [0] before any division — otherwise symmetric currents divide by zero and produce Infinity, which the judge rejects as nonfinite. Same discipline on STM32: test the threshold before dividing.',
    ),
  ],
  cReference: `/* STM32 C 参考：采样后逐相比较求不平衡度（ADC 三通道同步采样） */
typedef struct { float a, b, c; } i3ph_t;

static inline float unbalance_pct(const i3ph_t *i)
{
    float avg = (i->a + i->b + i->c) / 3.0f;
    if (fabsf(avg) < 1e-9f) {
        return 0.0f;                 /* 平均分量≈0：分母无意义，按规约报 0 */
    }
    /* 逐相比较求 max/min：比排序更省，也避免临时数组 */
    float mx = i->a, mn = i->a;
    if (i->b > mx) mx = i->b;
    if (i->b < mn) mn = i->b;
    if (i->c > mx) mx = i->c;
    if (i->c < mn) mn = i->c;
    return (mx - mn) / fabsf(avg) * 100.0f;
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与题面公式一致）。 */
export const unbalanceSolution: string = `function unbalance(ia, ib, ic) {
  const avg = (ia + ib + ic) / 3;
  if (Math.abs(avg) < 1e-9) return [0];
  const hi = Math.max(ia, ib, ic);
  const lo = Math.min(ia, ib, ic);
  const pct = (hi - lo) / Math.abs(avg) * 100;
  return [pct];
}
return unbalance;`;
