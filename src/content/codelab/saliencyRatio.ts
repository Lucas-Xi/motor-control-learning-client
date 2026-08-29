import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：凸极比计算（14 号模块 hfi-sensorless）。
 *
 * 凸极比 ρ = Lq/Ld 是 HFI（高频注入）可检测性的核心指标：
 * IPM（内置式）Lq > Ld → ρ > 1 有凸极信号可解调；SPM（表贴式）
 * Ld = Lq → ρ = 1 无凸极性，HFI 失效。期望值由 ratio = Lq/Ld 冻结
 * 生成（10 位小数）。
 */
export const saliencyRatioChallenge: CodeChallenge = {
  id: 'saliency-ratio',
  moduleId: 'hfi-sensorless',
  functionName: 'saliencyRatio',
  difficulty: 1,
  title: e('编程挑战：计算凸极比', 'Code Lab: compute the saliency ratio'),
  statement: e(
    'HFI（高频注入无感）不靠反电动势，靠的是转子的凸极性：d 轴磁路磁阻大（Ld 小）、' +
      'q 轴磁路磁阻小（Lq 大），注入高频后两个方向的电感响应不同，才能解调出转子位置。' +
      '量化指标就是凸极比 ρ = Lq/Ld。实现 saliencyRatio(ldMh, lqMh)，返回 [ratio]：' +
      'IPM 的 ρ > 1（典型 1.2~2.5，越大 HFI 信噪比越好）；SPM 的 Ld = Lq，ρ = 1，HFI 直接失效——' +
      '这正是上电自检要拦住的机型。电感单位 mH，但比值无量纲，不用换算。',
    'HFI (high-frequency injection sensorless) does not ride the back-EMF; it rides rotor saliency: the d-axis magnetic path is reluctance-heavy (small Ld) while the q-axis path is not (large Lq), so an injected high frequency responds differently along the two axes and the rotor position can be demodulated. ' +
      'The figure of merit is the saliency ratio ρ = Lq/Ld. Implement saliencyRatio(ldMh, lqMh) returning [ratio]: ' +
      'an IPM has ρ > 1 (typically 1.2-2.5; the larger, the better the HFI SNR); an SPM has Ld = Lq, ρ = 1, and HFI simply fails — exactly the machine a power-on self-test must reject. The inductances come in mH, but the ratio is dimensionless: no unit conversion needed.',
  ),
  starter: `// TODO: 返回 [ratio]（凸极比 Lq/Ld，无量纲）
// 提示：IPM 的 Lq > Ld → ratio > 1；SPM 相等 → 1
function saliencyRatio(ldMh, lqMh) {
  const ratio = 0;
  return [ratio];
}
return saliencyRatio;`,
  starterEn: `// TODO: return [ratio] (saliency ratio Lq/Ld, dimensionless)
// Hint: an IPM has Lq > Ld -> ratio > 1; an SPM has them equal -> 1
function saliencyRatio(ldMh, lqMh) {
  const ratio = 0;
  return [ratio];
}
return saliencyRatio;`,
  cases: [
    { label: 'Ld=Lq=2.5 mH（SPM → ρ=1，HFI 失效）', args: [2.5, 2.5], expected: [1] },
    { label: 'Ld=4.0, Lq=6.5 mH（典型 IPM）', args: [4.0, 6.5], expected: [1.625] },
    { label: 'Ld=0.8, Lq=3.2 mH（大凸极，近同步磁阻）', args: [0.8, 3.2], expected: [4] },
    { label: 'Ld=5.0, Lq=7.5 mH（中等凸极）', args: [5.0, 7.5], expected: [1.5] },
    { label: 'Ld=Lq=1.0 mH（另一台 SPM）', args: [1.0, 1.0], expected: [1] },
    { label: 'Ld=3.0, Lq=9.0 mH（强凸极 IPM）', args: [3.0, 9.0], expected: [3] },
  ],
  hints: [
    e('一行除法：ratio = lqMh / ldMh。别被 mH 吓到——分子分母同单位，比值无量纲。', 'It is one division: ratio = lqMh / ldMh. Do not let the mH unit scare you — same unit upstairs and downstairs, the ratio is dimensionless.'),
    e('记住分界线：ρ = 1 是 SPM，高频注入解不出位置；ρ > 1 才有凸极信号。两个 Ld=Lq 的用例正等着它。', 'Memorize the boundary: ρ = 1 means SPM, where high-frequency injection demodulates nothing; only ρ > 1 carries a saliency signal. Two Ld=Lq cases are waiting for it.'),
    e('工程上 ρ < 1.1~1.2 就该放弃 HFI 切到反电动势观测器。STM32 上电自检：ρ 未过阈值直接置故障码，别让压缩机在地库里"蠕动启动"。', 'In practice, below ρ ≈ 1.1-1.2 you drop HFI and switch to a back-EMF observer. STM32 power-on self-test: fail fast with a fault code if ρ misses the threshold — do not let the compressor crawl through open-loop startup in a basement machine room.'),
  ],
  cReference: `/* STM32 C 参考：上电自检——凸极比判据（决定 HFI 是否可用） */
typedef struct { float ld_mH, lq_mH; } motor_l_t;   /* 铭牌/参数辨识结果 */

#define SALIENCY_MIN  1.15f    /* HFI 可用的最低凸极比（工程经验值） */

static float saliency_ratio(const motor_l_t *m)
{
    if (m->ld_mH < 1e-6f) return 0.0f;   /* 参数非法，防除零 */
    return m->lq_mH / m->ld_mH;
}

/* 上电自检：0=可走 HFI；-1=凸极不足（SPM）；-2=参数非法 */
static int hfi_selfcheck(const motor_l_t *m)
{
    float rho = saliency_ratio(m);
    if (rho <= 0.0f)         return -2;  /* Ld/Lq 数据未标定 */
    if (rho < SALIENCY_MIN)  return -1;  /* Ld≈Lq，无凸极信号可解调 */
    return 0;                              /* IPM：允许 HFI 启动 */
}`,
};

/** 官方答案（朴素风格，注册进 solutions.ts）。 */
export const saliencyRatioSolution: string = `function saliencyRatio(ldMh, lqMh) {
  const ratio = lqMh / ldMh;
  return [ratio];
}
return saliencyRatio;`;
