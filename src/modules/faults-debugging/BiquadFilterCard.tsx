import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { makeHighpass, makeLowpass, makeNotch } from '../../simulation/math/biquad';
import { formatNumber } from '../../utils/format';

/**
 * 测量噪声 + 双二阶滤波卡：消费 src/simulation/math/biquad.ts (makeLowpass/Highpass/Notch)。
 *
 * 教学要点：
 *   - 模拟电流采样：基波 50 Hz + 1 kHz/5 kHz 谐波 + 高斯噪声
 *   - 四种模式：Passthrough（原始）/ LPF 200Hz / Notch (用户可调中心)
 *   - 实时显示原始 vs 滤波后波形，下方给 RMS / 抑制比 KPI
 *
 * 公式（来自 biquad.ts 文件头，RBJ Cookbook）：
 *   ω0 = 2π·fc/fs,  α = sin(ω0)/(2Q),  c = cos(ω0)
 *   LPF:   b0=(1-c)/2, b1=1-c, b2=(1-c)/2, a1=-2c, a2=1-α  (a0=1+α 归一)
 *   Notch: b0=1, b1=-2c, b2=1, a1=-2c, a2=1-α
 */

const FS = 20000; // 20 kHz 采样
const DURATION_MS = 20; // 一个 50Hz 周期 = 20 ms
const N = Math.floor((FS * DURATION_MS) / 1000); // 400 点

type Mode = 'pass' | 'lpf' | 'notch' | 'hpf';

/** 固定种子的伪随机（线性同余），保证渲染稳定 */
function lcgNoise(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function buildSignals(mode: Mode, fcLpf: number, fcNotch: number, noiseAmp: number) {
  const noise = lcgNoise(0xc0ffee);
  // Box-Muller for 近似高斯
  const gauss = () => {
    const u1 = Math.max(1e-9, (noise() + 1) / 2);
    const u2 = (noise() + 1) / 2;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  // 滤波器（按模式）
  const filter =
    mode === 'lpf' ? makeLowpass(fcLpf, FS, 0.7071)
    : mode === 'notch' ? makeNotch(fcNotch, FS, 10)
    : mode === 'hpf' ? makeHighpass(fcLpf, FS, 0.7071)
    : null;

  // 跑两遍（先稳态预热再采样）
  const samples: Array<{ t: number; raw: number; filtered: number }> = [];
  // 预热
  for (let i = 0; i < N; i += 1) {
    const t = i / FS;
    const x = 5 * Math.sin(2 * Math.PI * 50 * t)
      + 0.8 * Math.sin(2 * Math.PI * 1000 * t)
      + 0.5 * Math.sin(2 * Math.PI * 5000 * t)
      + noiseAmp * gauss();
    if (filter) filter.step(x);
  }
  // 正式采样
  let rawSumSq = 0;
  let filtSumSq = 0;
  for (let i = 0; i < N; i += 1) {
    const t = i / FS;
    const x = 5 * Math.sin(2 * Math.PI * 50 * t)
      + 0.8 * Math.sin(2 * Math.PI * 1000 * t)
      + 0.5 * Math.sin(2 * Math.PI * 5000 * t)
      + noiseAmp * gauss();
    const y = filter ? filter.step(x) : x;
    samples.push({ t: t * 1000, raw: x, filtered: y });
    rawSumSq += x * x;
    filtSumSq += y * y;
  }
  const rawRms = Math.sqrt(rawSumSq / N);
  const filtRms = Math.sqrt(filtSumSq / N);
  return { samples, rawRms, filtRms };
}

const W = 460;
const H = 200;
const PAD = { l: 30, r: 12, t: 12, b: 26 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

export function BiquadFilterCard() {
  const [mode, setMode] = useState<Mode>('lpf');
  const [fcLpf, setFcLpf] = useState(200);
  const [fcNotch, setFcNotch] = useState(1000);
  const [noiseAmp, setNoiseAmp] = useState(0.4);

  const { samples, rawRms, filtRms } = useMemo(
    () => buildSignals(mode, fcLpf, fcNotch, noiseAmp),
    [mode, fcLpf, fcNotch, noiseAmp],
  );

  const yMax = useMemo(() => {
    let max = 0;
    for (const s of samples) {
      if (Math.abs(s.raw) > max) max = Math.abs(s.raw);
    }
    return Math.max(6, max);
  }, [samples]);

  const xOf = (t: number) => PAD.l + (t / DURATION_MS) * PW;
  const yOf = (v: number) => PAD.t + (1 - (v + yMax) / (2 * yMax)) * PH;

  const subsample = useMemo(() => {
    // 减点：每 4 个采样画一个，160 万降到 100 点
    const step = Math.max(1, Math.floor(samples.length / 200));
    return samples.filter((_, i) => i % step === 0);
  }, [samples]);

  const rawPath = subsample
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.t).toFixed(1)} ${yOf(s.raw).toFixed(1)}`)
    .join(' ');
  const filtPath = subsample
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.t).toFixed(1)} ${yOf(s.filtered).toFixed(1)}`)
    .join(' ');

  const suppression = rawRms > 1e-6 ? (1 - filtRms / rawRms) * 100 : 0;

  return (
    <Card title="测量噪声 + 双二阶滤波" eyebrow="biquad DF-II-T" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        信号 = 50Hz 基波 + 1kHz/5kHz 谐波 + 高斯噪声 ·{' '}
        <code className="formula text-ink-secondary">y[n] = b0·x + z1; z1 = b1·x − a1·y + z2; z2 = b2·x − a2·y</code>
      </p>

      {/* 模式切换 */}
      <div
        className="mb-3 inline-flex overflow-hidden rounded-md border border-line-subtle"
        role="radiogroup"
        aria-label="滤波器模式选择"
      >
        {(['pass', 'lpf', 'notch', 'hpf'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-caption transition ${
              mode === m
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'bg-bg-base text-ink-muted hover:bg-bg-surface'
            }`}
          >
            {m === 'pass' ? 'Passthrough' : m === 'lpf' ? 'LPF' : m === 'notch' ? 'Notch' : 'HPF'}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Slider
          label={mode === 'hpf' ? 'fc 截止' : mode === 'lpf' ? 'fc 截止' : 'fc 截止 (LPF)'}
          value={fcLpf}
          min={50}
          max={2000}
          step={50}
          unit=" Hz"
          onChange={setFcLpf}
        />
        <Slider
          label="fc 中心 (Notch)"
          value={fcNotch}
          min={500}
          max={6000}
          step={100}
          unit=" Hz"
          onChange={setFcNotch}
        />
        <Slider label="噪声幅值" value={noiseAmp} min={0} max={1.5} step={0.05} unit=" σ" onChange={setNoiseAmp} />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`双二阶滤波器对比图，模式 ${mode}，原始 RMS ${formatNumber(rawRms, 2)}，滤波后 RMS ${formatNumber(filtRms, 2)}，抑制率 ${formatNumber(suppression, 1)}%`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="rgba(231,243,255,0.12)" strokeWidth="1" />
        {/* 原始波形 (低饱和度) */}
        <path d={rawPath} stroke="rgba(255,92,122,0.55)" strokeWidth="1" fill="none" />
        {/* 滤波后波形 */}
        <path d={filtPath} stroke="rgb(var(--accent-measure))" strokeWidth="1.6" fill="none" />
        <text x={PAD.l} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">0 ms</text>
        <text x={W - PAD.r - 28} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">{DURATION_MS} ms</text>
        <text x={4} y={yOf(yMax * 0.8)} fill="rgb(var(--ink-muted))" fontSize="10">+{formatNumber(yMax, 0)}</text>
        <text x={4} y={yOf(-yMax * 0.8)} fill="rgb(var(--ink-muted))" fontSize="10">−{formatNumber(yMax, 0)}</text>
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">原始 RMS</p>
          <p className="formula text-accent-fault">{formatNumber(rawRms, 2)} A</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">滤波后 RMS</p>
          <p className="formula text-accent-measure">{formatNumber(filtRms, 2)} A</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">抑制率</p>
          <p className={`formula ${suppression > 30 ? 'text-accent-measure' : 'text-ink-primary'}`}>
            {formatNumber(suppression, 1)}%
          </p>
        </div>
      </div>
    </Card>
  );
}
