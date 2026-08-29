import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：电流总谐波畸变率 THD（15 号模块 · APF 前级）。
 *
 * 口径与 src/simulation/math/apf.ts 的 metrics.thd 一致（谐波有效值 /
 * 基波有效值 × 100）；apf.ts 从时域积分反解，本题直接给定谐波幅值，
 * 故按其定义的频域形式冻结：
 *   pct = sqrt(h3² + h5² + h7²) / h1 × 100；
 *   h1 = 0（无基波，分母无意义）时返回 0，防除零。
 * 测试向量按上式冻结生成（10 位小数，运行期零依赖）。
 */
export const thdChallenge: CodeChallenge = {
  id: 'current-thd',
  moduleId: 'apf-frontend',
  functionName: 'thd',
  difficulty: 2,
  title: e('编程挑战：计算电流总谐波畸变率', 'Code Lab: compute the current total harmonic distortion'),
  statement: e(
    'PFC 前级好不好，看输入电流的谐波含量：频谱分析（Goertzel/FFT）给出基波幅值 h1 与主要低次谐波 h3、h5、h7，' +
      'THD 定义为谐波合成的有效值与基波之比的百分数。实现 thd(h1, h3, h5, h7) 返回 [pct]：' +
      'pct = sqrt(h3² + h5² + h7²) / h1 × 100（与上方仿真里 metrics.thd 同口径）。' +
      '若 h1 = 0（没有基波——待机或采样异常），分母失去意义，直接返回 [0]（防除零，题面规定）。',
    'How good is the PFC front end? Look at the harmonic content of the input current: spectral analysis (Goertzel/FFT) yields the fundamental amplitude h1 plus the dominant low-order harmonics h3, h5, h7, and THD is the ratio of the combined harmonic RMS to the fundamental, in percent. ' +
      'Implement thd(h1, h3, h5, h7) returning [pct]: pct = sqrt(h3² + h5² + h7²) / h1 × 100 (same definition as metrics.thd in the simulation above). ' +
      'If h1 = 0 (no fundamental — standby or a sampling fault) the denominator is meaningless: return [0] in that case (divide-by-zero guard, as specified).',
  ),
  starter: `// TODO: 返回 [pct]（电流总谐波畸变率，%）
// 提示：谐波合成 = Math.sqrt(h3*h3 + h5*h5 + h7*h7)；再除以 h1 乘 100；h1 = 0 时返回 [0]
function thd(h1, h3, h5, h7) {
  const pct = 0;
  return [pct];
}
return thd;`,
  cases: [
    { label: 'h1=10, 谐波全 0（纯基波）', args: [10, 0, 0, 0], expected: [0] },
    { label: 'h1=10, h3=3, h5=1, h7=0.5（3 次主导）', args: [10, 3, 1, 0.5], expected: [32.0156211872] },
    { label: 'h1=12, h3=1.2, h5=0.8, h7=0.3（PFC 整定后）', args: [12, 1.2, 0.8, 0.3], expected: [12.2757665522] },
    { label: 'h1=0, 谐波非 0（无基波，防除零）', args: [0, 3, 2, 1], expected: [0] },
    { label: 'h1=1000, h3=150, h5=60, h7=30（大幅值工况）', args: [1000, 150, 60, 30], expected: [16.4316767252] },
    { label: 'h1=5, h5=2（纯 5 次谐波 40%）', args: [5, 0, 2, 0], expected: [40.0000000000] },
  ],
  hints: [
    e(
      '先判 h1 === 0 再做除法——否则 0 作分母会得 Infinity/NaN，判题判 nonfinite。',
      'Test h1 === 0 before dividing — otherwise zero in the denominator yields Infinity/NaN and the judge flags nonfinite.',
    ),
    e(
      '谐波按 RSS（平方和开根）合成：Math.sqrt(h3*h3 + h5*h5 + h7*h7)。写成 Math.hypot(h3, h5, h7) 也可以，两者等价。',
      'Combine the harmonics in RSS (root-sum-square): Math.sqrt(h3*h3 + h5*h5 + h7*h7). Math.hypot(h3, h5, h7) is equivalent and also allowed.',
    ),
    e(
      '工程门限：GB/T 与能源之星通常要求 THD < 5%（额定工况）。STM32 上 Goertzel 每次谐波一个二阶递推，N 点后取模，再在这里合并成 THD 上报。',
      'Engineering gate: regulations typically demand THD < 5% at rated load. On STM32 each Goertzel harmonic is a second-order recursion over N samples; take magnitudes afterwards and merge them here into the reported THD.',
    ),
  ],
  cReference: `/* STM32 C 参考：Goertzel/FFT 后的谐波合并式 THD（输入为各次幅值） */
typedef struct { float h1, h3, h5, h7; } harm_t;   /* Goertzel 模值，单位 A */

static inline float thd_pct(const harm_t *h)
{
    if (h->h1 <= 0.0f) {
        return 0.0f;                /* 无基波（待机/采样异常）：按规约报 0 */
    }
    /* RSS 合成：先累加平方和，再一次性开方，减少 sqrt 次数 */
    float s = h->h3 * h->h3;
    s += h->h5 * h->h5;
    s += h->h7 * h->h7;
    return sqrtf(s) / h->h1 * 100.0f;
}`,
};

/** 官方答案（供 codelab/solutions.ts 登记；风格与 apf.ts 的 THD 口径一致）。 */
export const thdSolution: string = `function thd(h1, h3, h5, h7) {
  if (h1 === 0) return [0];
  const harm = Math.sqrt(h3 * h3 + h5 * h5 + h7 * h7);
  const pct = harm / h1 * 100;
  return [pct];
}
return thd;`;
