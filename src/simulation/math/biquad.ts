/**
 * 双二阶（Biquad）IIR 滤波器 —— Direct-Form II Transposed（DF-II-T）实现。
 *
 * 物理背景：
 *   电机控制里常见用途：
 *     - 速度环测速：把粗糙编码器差分先低通到 ωc ≈ 100-500 Hz；
 *     - 电流采样：陷波器抑制 PWM 开关纹波（ωc = f_pwm）；
 *     - SMO/EEMF：高通去掉直流偏置；
 *     - HFI：带通提取注入频率响应。
 *
 *   传递函数（标准 2 阶 IIR）：
 *
 *     H(z) = (b0 + b1·z⁻¹ + b2·z⁻²) / (1 + a1·z⁻¹ + a2·z⁻²)
 *
 *   DF-II-T 差分方程（仅两个状态变量 z1, z2）：
 *
 *     y[n] = b0·x[n] + z1
 *     z1   = b1·x[n] - a1·y[n] + z2
 *     z2   = b2·x[n] - a2·y[n]
 *
 * 为什么 DF-II-T 数值最稳：
 *   - Direct-Form I 用 4 个状态（2 输入历史 + 2 输出历史），定点下两条路径误差独立累积；
 *   - Direct-Form II 把两条延迟线合并成 1 条，但**中间节点 w[n] 的动态范围**可能远超输入输出，
 *     在共振陷波 (Q > 5) 时极易溢出 q15；
 *   - Direct-Form II Transposed 把延迟线放在加法器**之后**，每个状态变量都是"输出域"的量，
 *     动态范围与 y[n] 一致，q15/q31 下溢出概率最低，且对系数量化误差最不敏感。
 *
 *   定点实践：DF-II-T 是 ARM CMSIS-DSP `arm_biquad_cascade_df1_q15` 系列的默认推荐拓扑。
 *
 * 系数计算（Robert Bristow-Johnson Audio EQ Cookbook，行业事实标准）：
 *   - ω0 = 2π·fc/fs,  α = sin(ω0)/(2Q),  c = cos(ω0)
 *   - LPF:    b0=(1-c)/2, b1=1-c,   b2=(1-c)/2, a0=1+α, a1=-2c,  a2=1-α
 *   - HPF:    b0=(1+c)/2, b1=-(1+c), b2=(1+c)/2, a0=1+α, a1=-2c,  a2=1-α
 *   - Notch:  b0=1,       b1=-2c,    b2=1,       a0=1+α, a1=-2c,  a2=1-α
 *   最后所有系数除以 a0 归一化。
 *
 * 参考：
 *   - Robert Bristow-Johnson, "Audio EQ Cookbook" (musicdsp.org)
 *   - ARM CMSIS-DSP `arm_biquad_*` 系列函数族文档
 *   - 阮毅《电力拖动自动控制系统》第 5 章 5.6 节"采样滤波与抗混叠"
 *   - TI Application Report SLOA049 "Active Low-Pass Filter Design"
 *
 * 单位：
 *   - fc, fs: Hz（fc 必须 < fs/2，否则双线性预畸变会非物理）
 *   - Q: 无量纲，典型 0.707 (Butterworth) ~ 5 (尖峰陷波)
 *
 * STM32 移植要点：
 *   - q15 实现：直接调用 `arm_biquad_cascade_df1_q15`；级联多个二阶节实现高阶滤波器。
 *   - ISR 周期：放在电流环采样中断里，每相每节单次乘加 ~5 个时钟，Cortex-M4F 上完全够用。
 *   - 查表 vs 迭代：系数在初始化时算一次缓存，运行期只跑差分方程，不要每拍重算 sin/cos。
 *   - 截止频率 fc 不要超过 fs/4，预畸变误差才能 < 5%；Nyquist 边缘（fs/2）必失真。
 */

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface BiquadFilter {
  step(x: number): number;
  reset(): void;
  /** 当前系数（只读视图，便于诊断） */
  readonly coeffs: BiquadCoeffs;
}

/**
 * 内部：根据预先算好的系数构造 DF-II-T 实例。
 * 闭包持有两个状态 z1/z2；除 step()/reset() 不暴露任何副作用接口。
 */
function makeBiquadFromCoeffs(coeffs: BiquadCoeffs): BiquadFilter {
  let z1 = 0;
  let z2 = 0;
  return {
    step(x: number) {
      // DF-II-T 差分方程（见文件头公式块）
      const y = coeffs.b0 * x + z1;
      z1 = coeffs.b1 * x - coeffs.a1 * y + z2;
      z2 = coeffs.b2 * x - coeffs.a2 * y;
      return y;
    },
    reset() {
      z1 = 0;
      z2 = 0;
    },
    coeffs,
  };
}

/**
 * 低通：二阶 RBJ 双线性。Q=0.707 为最大平坦（Butterworth）。
 */
export function makeLowpass(fc: number, fs: number, Q = 0.7071067811865475): BiquadFilter {
  const nyquist = fs * 0.5;
  const fcClamped = Math.min(Math.max(fc, 1e-6), nyquist * 0.999);
  const Qsafe = Math.max(Q, 1e-4);
  const w0 = (2 * Math.PI * fcClamped) / fs;
  const c = Math.cos(w0);
  const s = Math.sin(w0);
  const alpha = s / (2 * Qsafe);
  const a0 = 1 + alpha;
  const b0 = ((1 - c) / 2) / a0;
  const b1 = (1 - c) / a0;
  const b2 = ((1 - c) / 2) / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  return makeBiquadFromCoeffs({ b0, b1, b2, a1, a2 });
}

/**
 * 陷波：二阶带阻，中心频率 fc。Q 越大陷得越窄、阻得越深。
 * 抑制 PWM 开关纹波时 Q=10-30 比较常见。
 */
export function makeNotch(fc: number, fs: number, Q = 5): BiquadFilter {
  const nyquist = fs * 0.5;
  const fcClamped = Math.min(Math.max(fc, 1e-6), nyquist * 0.999);
  const Qsafe = Math.max(Q, 1e-4);
  const w0 = (2 * Math.PI * fcClamped) / fs;
  const c = Math.cos(w0);
  const s = Math.sin(w0);
  const alpha = s / (2 * Qsafe);
  const a0 = 1 + alpha;
  const b0 = 1 / a0;
  const b1 = (-2 * c) / a0;
  const b2 = 1 / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  return makeBiquadFromCoeffs({ b0, b1, b2, a1, a2 });
}

/**
 * 高通：二阶 RBJ 双线性。常用于去掉电流采样的直流偏置（不能用 1 阶 RC，相位响应不够平）。
 */
export function makeHighpass(fc: number, fs: number, Q = 0.7071067811865475): BiquadFilter {
  const nyquist = fs * 0.5;
  const fcClamped = Math.min(Math.max(fc, 1e-6), nyquist * 0.999);
  const Qsafe = Math.max(Q, 1e-4);
  const w0 = (2 * Math.PI * fcClamped) / fs;
  const c = Math.cos(w0);
  const s = Math.sin(w0);
  const alpha = s / (2 * Qsafe);
  const a0 = 1 + alpha;
  const b0 = ((1 + c) / 2) / a0;
  const b1 = (-(1 + c)) / a0;
  const b2 = ((1 + c) / 2) / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  return makeBiquadFromCoeffs({ b0, b1, b2, a1, a2 });
}

