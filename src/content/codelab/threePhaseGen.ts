import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：对称三相电流生成（02 号模块 three-phase）。
 *
 * 相位约定对齐 src/simulation/math/transforms.ts 的 generateThreePhaseCurrent：
 *   ia = I·sin(θ)；ib = I·sin(θ − 2π/3)（B 滞后 A 120°）；ic = I·sin(θ + 2π/3)
 *   （C 滞后 B 120°，等价超前 A 120°）。期望值由 transforms.ts 冻结生成
 * （balance/harmonic/noise 全 0，base=θ）：10 位小数。
 */
export const threePhaseGenChallenge: CodeChallenge = {
  id: 'three-phase-gen',
  moduleId: 'three-phase',
  functionName: 'threePhaseGen',
  difficulty: 1,
  title: e('编程挑战：生成对称三相电流', 'Code Lab: generate balanced three-phase currents'),
  statement: e(
    '三相对称正弦电流是电机工程的"心跳"：三相同幅值、相位互差 120°，任意时刻之和为 0。' +
      '实现 threePhaseGen(amp, thetaRad)，返回 [ia, ib, ic]：A 相为基准 ia = amp·sin(θ)；' +
      'B 相滞后 A 120°（θ − 2π/3）；C 相再滞后 B 120°（θ + 2π/3，等价超前 A 120°）。' +
      'amp 可为负（相当于相位翻转 180°）。自检：三者之和恒为 0。',
    'Balanced three-phase sinusoids are the heartbeat of motor drives: equal amplitudes, 120° apart, summing to zero at every instant. ' +
      'Implement threePhaseGen(amp, thetaRad) returning [ia, ib, ic]: phase A is the reference, ia = amp·sin(θ); ' +
      'phase B lags A by 120° (θ − 2π/3); phase C lags B by another 120° (θ + 2π/3, i.e. leading A by 120°). ' +
      'amp may be negative (equivalent to a 180° phase flip). Self-check: the three currents always sum to zero.',
  ),
  starter: `// TODO: 返回 [ia, ib, ic]（对称三相，相位差 2π/3）
// 提示：shift = (2 * Math.PI) / 3；ib 用 Math.sin(thetaRad - shift)，ic 用 Math.sin(thetaRad + shift)
function threePhaseGen(amp, thetaRad) {
  const ia = 0;
  const ib = 0;
  const ic = 0;
  return [ia, ib, ic];
}
return threePhaseGen;`,
  starterEn: `// TODO: return [ia, ib, ic] (balanced three-phase, 2*pi/3 apart)
// Hint: shift = (2 * Math.PI) / 3; ib uses Math.sin(thetaRad - shift), ic uses Math.sin(thetaRad + shift)
function threePhaseGen(amp, thetaRad) {
  const ia = 0;
  const ib = 0;
  const ic = 0;
  return [ia, ib, ic];
}
return threePhaseGen;`,
  cases: [
    { label: 'amp=1, θ=0（A 相过零）', args: [1, 0], expected: [0, -0.8660254038, 0.8660254038] },
    { label: 'amp=1, θ=π/2（A 相峰值）', args: [1, 1.5707963267948966], expected: [1, -0.5, -0.5] },
    { label: 'amp=2, θ=0.7 rad（一般角）', args: [2, 0.7], expected: [1.2884353745, -1.9689632154, 0.6805278409] },
    { label: 'amp=-1.5, θ=0.3 rad（负幅值=相位翻转）', args: [-1.5, 0.3], expected: [-0.44328031, 1.4626586581, -1.0193783481] },
    { label: 'amp=5, θ=4π/3（A 相走到 C 的位置）', args: [5, 4.1887902047863905], expected: [-4.3301270189, 4.3301270189, 0] },
    { label: 'amp=3, θ=-0.8 rad（负角）', args: [3, -0.8], expected: [-2.1520682727, -0.7340629915, 2.8861312642] },
  ],
  hints: [
    e('把 120° 存成常量 shift = (2·Math.PI)/3，别在三个 sin 里各写一遍 2.0944——魔法数字是 bug 之源。', 'Store 120° once as shift = (2·Math.PI)/3 instead of spelling 2.0944 inside each sin — magic numbers breed bugs.'),
    e('方向别搞反：B 滞后 A 是减（θ − shift），C 滞后 B 即超前 A 是加（θ + shift）。用 θ=π/2 自检：应为 [1, −0.5, −0.5]。', 'Mind the direction: B lags A so subtract (θ − shift); C lags B, i.e. leads A, so add (θ + shift). Check with θ=π/2: expect [1, −0.5, −0.5].'),
    e('STM32 上没人调 sinf：预生成 256 点正弦表，相位直接用 16 位计数（120° = 65536/3 ≈ 21845），一次移位就是查表下标。', 'Nobody calls sinf on an STM32: precompute a 256-entry sine table, keep phase as a 16-bit counter (120° = 65536/3 ≈ 21845), and one shift yields the table index.'),
  ],
  cReference: `/* STM32 C 参考：三相正弦查表（256 点表，免 sinf；角度 0..65535 ↔ 0..2π） */
#define LUT_N   256u
#define STEP_120  (65536u / 3u)          /* 120° = 21845 计数 */

static const int16_t SIN_LUT[LUT_N] = { /* 0, 804, 1608, ... 片上脚本预生成 */
    0, 804, 1608, 2410, 3212, 4013, 4811, 5607, /* ... */
};

static inline int16_t lut_sin(uint16_t angle)    /* Q15 正弦，角度 16 位回卷 */
{
    return SIN_LUT[angle >> 8];                  /* 高 8 位 = 表下标 */
}

static void three_phase_gen(int16_t amp_q15, uint16_t theta,
                            int16_t *ia, int16_t *ib, int16_t *ic)
{
    *ia = (int16_t)(((int32_t)amp_q15 * lut_sin(theta))                  >> 15);
    *ib = (int16_t)(((int32_t)amp_q15 * lut_sin((uint16_t)(theta - STEP_120))) >> 15); /* 滞后 120° */
    *ic = (int16_t)(((int32_t)amp_q15 * lut_sin((uint16_t)(theta + STEP_120))) >> 15); /* 滞后 240° */
}`,
};

/** 官方答案（朴素风格，注册进 solutions.ts）。 */
export const threePhaseGenSolution: string = `function threePhaseGen(amp, thetaRad) {
  const shift = (2 * Math.PI) / 3;
  const ia = amp * Math.sin(thetaRad);
  const ib = amp * Math.sin(thetaRad - shift);
  const ic = amp * Math.sin(thetaRad + shift);
  return [ia, ib, ic];
}
return threePhaseGen;`;
