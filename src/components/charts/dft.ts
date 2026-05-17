/**
 * 朴素 DFT —— 用于波形面板的 FFT 视图。
 *
 * 不引入 fft.js / numjs 等依赖：N 通常 ≤ 256，O(N²) 在 4 万次复数乘法量级，
 * 现代 JS 引擎单帧内可以跑完。如果未来 N 拉大到 1024+，再换 FFT 算法。
 *
 * 输入：实数序列 samples[0..N-1]
 * 输出：单边幅值谱 mags[0..N/2]
 *   mags[k] = (2/N) × |X(k)|   （DC 不乘 2，最大尺度对齐"幅值"）
 *   freq[k] = k × fs / N        （fs = sample rate Hz）
 */
export function computeSingleSidedSpectrum(samples: number[], fs: number): { freq: number[]; mag: number[] } {
  const N = samples.length;
  if (N < 2) return { freq: [], mag: [] };
  const half = Math.floor(N / 2);
  const freq = new Array<number>(half + 1);
  const mag = new Array<number>(half + 1);

  // 预算三角函数（O(N)）— 内层循环不再每次 cos/sin
  const twoPiOverN = (2 * Math.PI) / N;

  for (let k = 0; k <= half; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n += 1) {
      const ang = twoPiOverN * k * n;
      re += samples[n] * Math.cos(ang);
      im -= samples[n] * Math.sin(ang);
    }
    const m = Math.sqrt(re * re + im * im);
    // 单边谱归一化：DC 用 1/N，其它乘 2/N（包含正负频率能量合并）
    mag[k] = k === 0 ? m / N : (2 * m) / N;
    freq[k] = (k * fs) / N;
  }
  return { freq, mag };
}

/**
 * THD（总谐波失真）：
 *   THD = sqrt( Σ Vk² )  /  V1     (k = 2, 3, 4, …)
 * V1 是基频幅值（自动识别为单边谱中除 DC 外最大峰）。
 *
 * 实际工程：通常只看到 50 倍频以下，且会限制 harmonicMax 防止把噪声底也算进 THD。
 * 返回百分比；若没有可识别基频返回 NaN。
 */
export function computeTHD(mag: number[], harmonicMax = 40): number {
  if (mag.length < 3) return Number.NaN;
  // 跳过 DC（k=0），找最大幅值的 bin 作为基频
  let fundIdx = 1;
  for (let k = 2; k < mag.length; k += 1) if (mag[k] > mag[fundIdx]) fundIdx = k;
  const v1 = mag[fundIdx];
  if (!Number.isFinite(v1) || v1 <= 1e-6) return Number.NaN;
  let sqSum = 0;
  for (let h = 2; h <= harmonicMax; h += 1) {
    const idx = fundIdx * h;
    if (idx >= mag.length) break;
    sqSum += mag[idx] * mag[idx];
  }
  return (Math.sqrt(sqSum) / v1) * 100;
}
