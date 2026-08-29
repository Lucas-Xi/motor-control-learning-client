import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：一阶低通滤波单步（10 号模块 · 无感 FOC）。
 *
 * 公式与 src/simulation/math/smo.ts 的 BEMF 滤波一致：
 *   yNew = yPrev + α·(x − yPrev)，α = 2π·fc·dt/(1 + 2π·fc·dt) = dt/(dt + 1/(2π·fc))
 * 期望值由公式直接冻结（node 按 10 位小数生成）。
 */
export const lpfStepChallenge: CodeChallenge = {
  id: 'lpf-step',
  moduleId: 'sensorless-foc',
  functionName: 'lpfStep',
  difficulty: 1,
  title: e('编程挑战：实现一阶低通滤波单步', 'Code Lab: implement one step of a first-order low-pass filter'),
  statement: e(
    'SMO 里滑模开关量 z 要经过低通滤波才像反电动势；PLL、电流采样里也到处是这一步。' +
      '实现 lpfStep(x, yPrev, alpha) 返回 [yNew]：yNew = yPrev + alpha·(x − yPrev)，状态向新样本回填 alpha 比例的误差。' +
      'alpha 是离散平滑系数：alpha = dt/(dt + 1/(2π·fc))，fc 为 −3dB 截止频率。',
    'Inside the SMO the raw sliding-mode switching quantity z only looks like back-EMF after a low-pass filter, and the same one-liner appears in the PLL and current sampling. ' +
      'Implement lpfStep(x, yPrev, alpha) and return [yNew]: yNew = yPrev + alpha·(x − yPrev), the state back-fills an alpha-weighted fraction of the fresh-sample error. ' +
      'alpha is the discrete smoothing coefficient: alpha = dt/(dt + 1/(2π·fc)) with fc the −3 dB cutoff.',
  ),
  starter: `// TODO: 返回 [yNew]（滤波后的新状态）
// 提示：yNew = yPrev + alpha * (x - yPrev)；alpha=0 → 保持，alpha=1 → 直通
function lpfStep(x, yPrev, alpha) {
  const yNew = 0;
  return [yNew];
}
return lpfStep;`,
  starterEn: `// TODO: return [yNew] (the new filtered state)
// Hint: yNew = yPrev + alpha * (x - yPrev); alpha=0 -> hold, alpha=1 -> pass-through
function lpfStep(x, yPrev, alpha) {
  const yNew = 0;
  return [yNew];
}
return lpfStep;`,
  cases: [
    { label: 'x=3.2, y=1.0, α=0（完全保持）', args: [3.2, 1, 0], expected: [1.0000000000] },
    { label: 'x=-2.5, y=0.7, α=1（无滤波直通）', args: [-2.5, 0.7, 1], expected: [-2.5000000000] },
    { label: 'x=2.0, y=0.5, α=0.05（SMO 典型重滤波）', args: [2, 0.5, 0.05], expected: [0.5750000000] },
    { label: 'x=-1.2, y=0.4, α=0.3（中等平滑）', args: [-1.2, 0.4, 0.3], expected: [-0.0800000000] },
    { label: 'x=-4.5, y=-2.0, α=0.05（负值阶跃）', args: [-4.5, -2, 0.05], expected: [-2.1250000000] },
    { label: 'x=1.0, y=-0.25, α=0.5（半程收敛）', args: [1, -0.25, 0.5], expected: [0.3750000000] },
  ],
  hints: [
    e(
      '两个极端自检：α=0 时 yNew = yPrev（状态冻结），α=1 时 yNew = x（无滤波直通）——用例 1/2 就是这两关。',
      'Self-check with the two extremes: at α=0, yNew = yPrev (state frozen); at α=1, yNew = x (no filtering, straight through) — cases 1 and 2 test exactly that.',
    ),
    e(
      'α 的来历：α = dt/(dt + 1/(2π·fc))。fc 越低 α 越小，纹波滤得越干净但相位滞后越大——SMO 里就是"抖振 vs 跟踪慢"的折中。',
      'Where α comes from: α = dt/(dt + 1/(2π·fc)). Lower fc gives smaller α and cleaner ripple suppression but more phase lag — in an SMO that is the jitter-versus-lag trade-off.',
    ),
    e(
      'STM32 定点化：把 α 预折算成 Q15（α·32768），每步一次乘法加 15 位右移，ISR 里绝不做浮点除法。',
      'For STM32 fixed point, pre-convert α to Q15 (α·32768); each step is then one multiply plus a 15-bit shift — never a floating-point divide inside the ISR.',
    ),
  ],
  cReference: `/* STM32 C 参考：一阶 LPF 单步（Q15 定点：一次乘法 + 右移，观测器输出滤波用）
 * alpha 由 alpha = dt/(dt + 1/(2*pi*fc)) 折算成 alpha_q15 = (int16_t)(alpha*32768)。
 * alpha_q15=0 完全保持；接近 32768 时近似直通。
 */
static inline int16_t lpf_step_q15(int16_t x, int16_t y_prev, int16_t alpha_q15)
{
    int32_t err  = (int32_t)x - y_prev;               /* 新样本误差 x - y */
    int32_t corr = ((int32_t)alpha_q15 * err
                    + (1 << 14)) >> 15;                /* Q15 乘法后右移 15，+0.5LSB 舍入 */
    return (int16_t)(y_prev + corr);                   /* y += alpha*(x-y) 的定点等价 */
}

/* 浮点版（调试与上位机对拍用） */
static inline float lpf_step_f(float x, float y_prev, float alpha)
{
    return y_prev + alpha * (x - y_prev);
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与参考实现一致）。 */
export const lpfStepSolution: string = `function lpfStep(x, yPrev, alpha) {
  const yNew = yPrev + alpha * (x - yPrev);
  return [yNew];
}
return lpfStep;`;
