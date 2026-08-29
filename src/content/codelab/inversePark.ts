import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：反 Park 变换（06 号模块 · FOC 全流程）。
 *
 * 测试向量由 src/simulation/math/transforms.ts 的参考实现冻结生成：
 *   vAlpha = vd·cos θ − vq·sin θ；vBeta = vd·sin θ + vq·cos θ
 */
export const inverseParkChallenge: CodeChallenge = {
  id: 'inverse-park-transform',
  moduleId: 'foc-flow',
  functionName: 'inverseParkTransform',
  difficulty: 2,
  title: e('编程挑战：实现反 Park 变换', 'Code Lab: implement the inverse Park transform'),
  statement: e(
    '电流环 PI 输出的 Vd/Vq 站在转子坐标上，而 SVPWM 只认静止的 αβ 平面。' +
      '把 (vd, vq) 旋转回静止坐标，返回 [vAlpha, vBeta]。这是 FOC 流水线从"控制"跨回"功率"的最后一座桥——符号方向一旦写反，电机只会抖振发热。公式见上方讲义。',
    'The current-loop PIs output Vd/Vq in the rotor frame, but SVPWM only speaks the stationary αβ plane. ' +
      'Rotate (vd, vq) back into the stationary frame and return [vAlpha, vBeta]. This is the last bridge from "control" back to "power" in the FOC pipeline — flip a sign and the motor just jitters and heats. See the lesson above for the formulas.',
  ),
  starter: `// TODO: 返回 [vAlpha, vBeta]
// 提示：vAlpha = vd*cos(theta) - vq*sin(theta)；vBeta = vd*sin(theta) + vq*cos(theta)
function inverseParkTransform(vd, vq, thetaRad) {
  const vAlpha = 0;
  const vBeta = 0;
  return [vAlpha, vBeta];
}
return inverseParkTransform;`,
  starterEn: `// TODO: return [vAlpha, vBeta]
// Hint: vAlpha = vd*cos(theta) - vq*sin(theta); vBeta = vd*sin(theta) + vq*cos(theta)
function inverseParkTransform(vd, vq, thetaRad) {
  const vAlpha = 0;
  const vBeta = 0;
  return [vAlpha, vBeta];
}
return inverseParkTransform;`,
  cases: [
    { label: 'θ=0°（输出直通）', args: [2.5, 1.5, 0], expected: [2.5, 1.5] },
    { label: 'θ=90°（抓符号错误）', args: [3, 0.5, 1.5707963267948966], expected: [-0.5, 3] },
    { label: 'θ=60° 一般角', args: [1.8, -2.4, 1.0471975511965976], expected: [2.9784609691, 0.3588457268] },
    { label: 'θ=-30° 负角', args: [-2, -1.5, -0.5235987755982988], expected: [-2.4820508076, -0.2990381057] },
    { label: '纯 Vq 注入（vd=0）', args: [0, 4, 0.8], expected: [-2.8694243636, 2.7868268374] },
    { label: 'θ>2π（按周期等效）', args: [10, -7.5, 7.5], expected: [10.5013530042, 6.780234884] },
  ],
  hints: [
    e(
      '把 Park 的旋转矩阵转置即得逆变换：vα = vd·cosθ − vq·sinθ，vβ = vd·sinθ + vq·cosθ——等价于把 −θ 代回 Park。',
      'Transpose the Park rotation matrix and you have the inverse: vα = vd·cosθ − vq·sinθ and vβ = vd·sinθ + vq·cosθ — equivalently, feed −θ back into Park.',
    ),
    e(
      '交叉自检：任意 (vd, vq) 先反 Park 再 Park 必须原样回来；θ=0 时输出应与输入完全直通。用例 2 最能暴露 −sin 项的符号错误。',
      'Cross-check: inverse Park followed by Park must return the original (vd, vq), and at θ=0 the output passes straight through. Case 2 exposes a wrong sign on the −sin term fastest.',
    ),
    e(
      '工程上反 Park 输出直接进 SVPWM，幅值越界即过调制饱和；STM32 定点实现与正 Park 共用同一组 sin/cos 表值，ISR 内一次完成。',
      'In production the inverse-Park output feeds SVPWM directly, so amplitude overshoot means overmodulation saturation; on STM32 fixed-point builds it shares the same sin/cos table entries as the forward Park, all inside one ISR pass.',
    ),
  ],
  cReference: `/* STM32 C 参考：反 Park 变换（SVPWM 前最后一级，电流环 ISR 内联） */
typedef struct { float alpha, beta; } ab_t;

static inline ab_t inv_park_transform(float vd, float vq, float theta)
{
    float s = sinf(theta);           /* 实际代码中 s/c 只算一次， */
    float c = cosf(theta);           /* 与正 Park 共存于环路上下文 */
    ab_t out;
    out.alpha = vd * c - vq * s;
    out.beta  = vd * s + vq * c;
    return out;
}

/* Q15 定点版：PI 输出限幅到 Q15 后一次乘加移位，直接喂 SVPWM 扇区判断 */
static inline void inv_park_q15(q15_t vd, q15_t vq,
                                q15_t sin_t, q15_t cos_t, q15_t *alpha, q15_t *beta)
{
    *alpha = (q15_t)(((q31_t)vd * cos_t - (q31_t)vq * sin_t) >> 15);
    *beta  = (q15_t)(((q31_t)vd * sin_t + (q31_t)vq * cos_t) >> 15);
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与参考实现一致）。 */
export const inverseParkSolution: string = `function inverseParkTransform(vd, vq, thetaRad) {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const vAlpha = vd * c - vq * s;
  const vBeta = vd * s + vq * c;
  return [vAlpha, vBeta];
}
return inverseParkTransform;`;
