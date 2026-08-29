import { e } from '../../i18n/entries';
import type { CodeChallenge } from './types';

/**
 * Code Lab：陷波器 biquad 系数（10 号模块 control-loops，配套 ResonanceNotchCard）。
 *
 * 测试向量由 src/simulation/math/biquad.ts 的 makeNotch（RBJ Audio EQ Cookbook
 * 陷波公式）冻结生成：
 *   ω0 = 2π·f0/fs，α = sin(ω0)/(2Q)
 *   b0 = 1，b1 = -2cos(ω0)，b2 = 1，a1 = -2cos(ω0)，a2 = 1-α，全部除以 a0 = 1+α
 */
export const notchCoeffChallenge: CodeChallenge = {
  id: 'notch-coeff',
  moduleId: 'control-loops',
  functionName: 'notchCoeff',
  difficulty: 3,
  title: e('编程挑战：计算陷波器 biquad 系数', 'Code Lab: compute notch biquad coefficients'),
  statement: e(
    '机械共振峰会让高增益速度环自激，对策是在 iq 指令上串一个二阶陷波、中心对准共振点。' +
      '实现 notchCoeff(f0Hz, fsHz, q)，返回归一化（a0=1）后的 [b0, b1, b2, a1, a2]。' +
      'ω0 = 2π·f0/fs，α = sin(ω0)/(2q)；b0 = 1，b1 = -2cos(ω0)，b2 = 1，a1 = -2cos(ω0)，a2 = 1-α，' +
      '最后五个系数同除 a0 = 1+α。自检：b0 = b2、b1 = a1，且 Q 越大 b0 越接近 1。',
    'A mechanical resonance peak makes a high-gain speed loop self-oscillate; the fix is a second-order notch in the iq command, centered on the resonance. ' +
      'Implement notchCoeff(f0Hz, fsHz, q) returning the normalized (a0=1) coefficients [b0, b1, b2, a1, a2]. ' +
      'ω0 = 2π·f0/fs, α = sin(ω0)/(2q); b0 = 1, b1 = -2cos(ω0), b2 = 1, a1 = -2cos(ω0), a2 = 1-α, ' +
      'then divide all five by a0 = 1+α. Self-check: b0 = b2, b1 = a1, and larger Q pushes b0 toward 1.',
  ),
  starter: `// TODO: 返回归一化系数 [b0, b1, b2, a1, a2]
// w0 = 2*PI*f0Hz/fsHz，alpha = sin(w0)/(2*q)，a0 = 1+alpha，五个系数同除 a0
function notchCoeff(f0Hz, fsHz, q) {
  const b0 = 0;
  const b1 = 0;
  const b2 = 0;
  const a1 = 0;
  const a2 = 0;
  return [b0, b1, b2, a1, a2];
}
return notchCoeff;`,
  starterEn: `// TODO: return the normalized coefficients [b0, b1, b2, a1, a2]
// w0 = 2*PI*f0Hz/fsHz, alpha = sin(w0)/(2*q), a0 = 1+alpha, divide all five by a0
function notchCoeff(f0Hz, fsHz, q) {
  const b0 = 0;
  const b1 = 0;
  const b2 = 0;
  const a1 = 0;
  const a2 = 0;
  return [b0, b1, b2, a1, a2];
}
return notchCoeff;`,
  cases: [
    {
      label: 'f0=120 Hz, Q=2, fs=10 kHz（低速共振，宽陷波）',
      args: [120, 10000, 2],
      expected: [0.9815163767, -1.9574555815, 0.9815163767, -1.9574555815, 0.9630327534],
    },
    {
      label: 'f0=120 Hz, Q=8, fs=10 kHz（同频窄陷，对照 Q=2）',
      args: [120, 10000, 8],
      expected: [0.9953141354, -1.9849726972, 0.9953141354, -1.9849726972, 0.9906282707],
    },
    {
      label: 'f0=450 Hz, Q=8, fs=10 kHz（典型传动共振）',
      args: [450, 10000, 8],
      expected: [0.9828618921, -1.8876721378, 0.9828618921, -1.8876721378, 0.9657237842],
    },
    {
      label: 'f0=800 Hz, Q=20, fs=10 kHz（高 Q 深陷）',
      args: [800, 10000, 20],
      expected: [0.9880994861, -1.7317563604, 0.9880994861, -1.7317563604, 0.9761989721],
    },
    {
      label: 'f0=2000 Hz, Q=8, fs=10 kHz（高频纹波抑制）',
      args: [2000, 10000, 8],
      expected: [0.9438939682, -0.5833585541, 0.9438939682, -0.5833585541, 0.8877879364],
    },
    {
      label: 'f0=2000 Hz, Q=20, fs=10 kHz（fs/4 处窄陷）',
      args: [2000, 10000, 20],
      expected: [0.9767757758, -0.6036806289, 0.9767757758, -0.6036806289, 0.9535515517],
    },
  ],
  hints: [
    e(
      '归一化就是五个原始系数同除 a0 = 1+α：返回的 b0 是 1/(1+α) 而不是 1，b1 是 −2cos(ω0)/(1+α)。',
      'Normalization means dividing all five raw coefficients by a0 = 1+α: the returned b0 is 1/(1+α), not 1, and b1 is −2cos(ω0)/(1+α).',
    ),
    e(
      '陷波的零点在单位圆上——b0=b2 且 b1=a1 是它的指纹，极点在同一角度往圆内缩 α。用这两个等式自检返回值。',
      'The notch zeros sit on the unit circle — b0=b2 and b1=a1 are its fingerprint; the poles pull inside by α at the same angle. Use both identities to self-check.',
    ),
    e(
      'f0 别超过 fs/4（10 kHz 采样最高可靠陷 2.5 kHz），否则双线性预畸变误差明显；工程上宁可提高采样率。',
      'Keep f0 below fs/4 (2.5 kHz at a 10 kHz rate here) or the bilinear pre-warp error grows — in practice raise fs instead.',
    ),
  ],
  cReference: `/* STM32 C 参考：RBJ 陷波 —— 初始化算一次系数，ISR 只跑 DF-II-T 差分方程 */
typedef struct { float b0, b1, b2, a1, a2, z1, z2; } notch_t;

void notch_init(notch_t *n, float f0, float fs, float q)   /* 上电调一次 */
{
    float w0    = 6.28318530718f * f0 / fs;
    float cw    = cosf(w0);
    float alpha = sinf(w0) / (2.0f * q);
    float a0    = 1.0f + alpha;
    n->b0 = 1.0f           / a0;  /* 归一化：五系数同除 a0，等价 float[5] */
    n->b1 = -2.0f * cw     / a0;
    n->b2 = 1.0f           / a0;
    n->a1 = -2.0f * cw     / a0;
    n->a2 = (1.0f - alpha) / a0;
    n->z1 = n->z2 = 0.0f;          /* DF-II-T 的两个状态 */
}

static inline float notch_step(notch_t *n, float x)  /* 速度环 ISR，5 次乘加 */
{
    float y = n->b0 * x + n->z1;
    n->z1   = n->b1 * x - n->a1 * y + n->z2;
    n->z2   = n->b2 * x - n->a2 * y;
    return y;
}`,
};

export const notchCoeffSolution: string = `function notchCoeff(f0Hz, fsHz, q) {
  const w0 = (2 * Math.PI * f0Hz) / fsHz;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = 1 / a0;
  const b1 = (-2 * Math.cos(w0)) / a0;
  const b2 = 1 / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  return [b0, b1, b2, a1, a2];
}
return notchCoeff;`;
