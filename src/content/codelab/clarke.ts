import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab #01：Clarke 变换（03 号模块）。
 *
 * 测试向量由 src/simulation/math/transforms.ts 的参考实现冻结生成：
 *   alpha = ia; beta = (ia + 2·ib)/√3; zero = (ia+ib+ic)/3
 */
export const clarkeChallenge: CodeChallenge = {
  id: 'clarke-transform',
  moduleId: 'clarke-transform',
  functionName: 'clarkeTransform',
  difficulty: 1,
  title: e('编程挑战：实现 Clarke 变换', 'Code Lab: implement the Clarke transform'),
  statement: e(
    '把三相静止坐标 (ia, ib, ic) 投影到 αβ0：α 轴与 A 相重合，β 轴超前 90°。' +
      '返回 [alpha, beta, zero]。三相对称时 zero 应为 0——用它自检。公式见上方讲义。',
    'Project the three-phase quantities (ia, ib, ic) onto the αβ0 frame: the α axis aligns with phase A, β leads by 90°. ' +
      'Return [alpha, beta, zero]. For a balanced set zero must be 0 — use that as a self-check. See the lesson above for the formulas.',
  ),
  starter: `// TODO: 返回 [alpha, beta, zero]
// 提示：alpha = ia；beta = (ia + 2*ib) / Math.sqrt(3)；zero = (ia+ib+ic)/3
function clarkeTransform(ia, ib, ic) {
  const alpha = 0;
  const beta = 0;
  const zero = 0;
  return [alpha, beta, zero];
}
return clarkeTransform;`,
  cases: [
    { label: 'Ia=1, Ib=0, Ic=-1（不平衡）', args: [1, 0, -1], expected: [1, 0.5773502692, 0] },
    { label: 'Ia=0.5, Ib=0.3, Ic=0.2（零序 0.33）', args: [0.5, 0.3, 0.2], expected: [0.5, 0.6350852961, 0.3333333333] },
    { label: 'Ia=2, Ib=1, Ic=0.5（含直流偏置）', args: [2, 1, 0.5], expected: [2, 2.3094010768, 1.1666666667] },
    { label: 'Ia=-0.7, Ib=0.1, Ic=0.6', args: [-0.7, 0.1, 0.6], expected: [-0.7, -0.2886751346, 0] },
    { label: 'Ia=3, Ib=-1.5, Ic=-1.5（对称正序）', args: [3, -1.5, -1.5], expected: [3, 0, 0] },
  ],
  hints: [
    e('α 分量不需要三角函数——A 相绕组本来就摆在 α 轴上。', 'The α component needs no trig — phase A already sits on the α axis.'),
    e('β 用 (ia + 2·ib)/√3 展开，避免依赖 ic（ic = −ia − ib，对称时）。', 'Expand β as (ia + 2·ib)/√3 so it does not depend on ic (ic = −ia − ib when balanced).'),
    e('STM32 定点化时先算 1/√3 的 Q15 常数再乘，别在 ISR 里做除法。', 'For STM32 fixed-point, precompute the Q15 constant of 1/√3 and multiply — never divide inside the ISR.'),
  ],
  cReference: `/* STM32 C 参考：等幅值 Clarke（per-unit 或 Q15 均适用） */
typedef struct { float alpha, beta, zero; } abz_t;

static inline abz_t clarke_transform(float ia, float ib, float ic)
{
    abz_t out;
    out.alpha = ia;
    out.beta  = (ia + 2.0f * ib) * 0.5773502692f; /* 1/sqrt(3) */
    out.zero  = (ia + ib + ic) * 0.3333333333f;   /* 对称时应≈0，可作采样自检 */
    return out;
}`,
};

/** 官方答案（朴素风格，注册进 solutions.ts）。 */
export const clarkeSolution: string = `function clarkeTransform(ia, ib, ic) {
  const alpha = ia;
  const beta = (ia + 2 * ib) / Math.sqrt(3);
  const zero = (ia + ib + ic) / 3;
  return [alpha, beta, zero];
}
return clarkeTransform;`;
