import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：Park 变换（04 号模块）。
 *
 * 测试向量由 src/simulation/math/transforms.ts 的参考实现冻结生成：
 *   d = iAlpha·cos θ + iBeta·sin θ；q = −iAlpha·sin θ + iBeta·cos θ
 */
export const parkChallenge: CodeChallenge = {
  id: 'park-transform',
  moduleId: 'park-transform',
  functionName: 'parkTransform',
  difficulty: 1,
  title: e('编程挑战：实现 Park 变换', 'Code Lab: implement the Park transform'),
  statement: e(
    '把静止的 αβ 坐标旋转到随转子同步旋转的 dq 坐标：θ 为电角度（rad），d 轴对准转子磁链，q 轴超前 90°。' +
      '返回 [d, q]。当电流矢量与转子同速旋转时，iD/iQ 近似直流——这正是 FOC 能用普通 PI 控交流的原因。公式见上方讲义。',
    'Rotate the stationary αβ frame into the dq frame spinning with the rotor: θ is the electrical angle in radians, the d axis aligns with the rotor flux and q leads by 90°. ' +
      'Return [d, q]. When the current vector spins in sync with the rotor, iD/iQ look like DC — exactly why FOC can regulate AC with plain PI loops. See the lesson above for the formulas.',
  ),
  starter: `// TODO: 返回 [d, q]
// 提示：d = iAlpha*cos(theta) + iBeta*sin(theta)；q = -iAlpha*sin(theta) + iBeta*cos(theta)
function parkTransform(iAlpha, iBeta, thetaRad) {
  const d = 0;
  const q = 0;
  return [d, q];
}
return parkTransform;`,
  cases: [
    { label: 'θ=0°（dq 与 αβ 重合）', args: [3, 1.5, 0], expected: [3, 1.5] },
    { label: 'θ=90°（d 对准 β）', args: [2, -1, 1.5707963267948966], expected: [-1, -2] },
    { label: 'θ=30° 一般角', args: [4, -3, 0.5235987755982988], expected: [1.9641016151, -4.5980762114] },
    { label: 'θ=-45° 负角', args: [1.2, 2.5, -0.7853981633974483], expected: [-0.9192388155, 2.6162950904] },
    { label: '零输入自检', args: [0, 0, 1.1], expected: [0, 0] },
    { label: '峰值电流 iα=8.5, iβ=-6.2', args: [8.5, -6.2, 2.1], expected: [-9.6430899623, -4.207233768] },
  ],
  hints: [
    e(
      '本质是两条投影：d = iAlpha·cosθ + iBeta·sinθ，q = −iAlpha·sinθ + iBeta·cosθ——Math.cos/Math.sin 直接可用。',
      'At heart it is two projections: d = iAlpha·cosθ + iBeta·sinθ and q = −iAlpha·sinθ + iBeta·cosθ — plain Math.cos/Math.sin will do.',
    ),
    e(
      'θ=0 时 [d, q] 必须原样等于 [iAlpha, iBeta]；θ=90° 时 d 落到 β、q 落到 α。先在这两组用例上核对符号，再写通式。',
      'At θ=0 [d, q] must equal [iAlpha, iBeta] verbatim; at θ=90° d lands on β and q lands on α. Nail the signs on those two cases first, then generalize.',
    ),
    e(
      'sin 与 cos 各算一次存局部量，正反 Park 共用；STM32 上对应一次 sinf/cosf（或 arm_sin_cos_f32），在电流环 ISR 里内联完成。',
      'Compute sin and cos once into locals and share them between forward and inverse Park; on STM32 that is a single sinf/cosf pair (or arm_sin_cos_f32), inlined inside the current-loop ISR.',
    ),
  ],
  cReference: `/* STM32 C 参考：Park 变换（电流环 ISR 内联；θ 为电角度，rad） */
typedef struct { float d, q; } dq_t;

static inline dq_t park_transform(float alpha, float beta, float theta)
{
    float s = sinf(theta);           /* 与反 Park 共用同一组 s/c， */
    float c = cosf(theta);           /* 或一次 arm_sin_cos_f32 同出 */
    dq_t out;
    out.d =  alpha * c + beta * s;
    out.q = -alpha * s + beta * c;
    return out;
}

/* Q15 定点版：sin/cos 查表预生成，输入为标幺电流，结果移位回 Q15 */
static inline void park_q15(q15_t alpha, q15_t beta,
                            q15_t sin_t, q15_t cos_t, q15_t *d, q15_t *q)
{
    *d = (q15_t)(((q31_t)alpha * cos_t + (q31_t)beta * sin_t) >> 15);
    *q = (q15_t)((-(q31_t)alpha * sin_t + (q31_t)beta * cos_t) >> 15);
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与参考实现一致）。 */
export const parkSolution: string = `function parkTransform(iAlpha, iBeta, thetaRad) {
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const d = iAlpha * c + iBeta * s;
  const q = -iAlpha * s + iBeta * c;
  return [d, q];
}
return parkTransform;`;
