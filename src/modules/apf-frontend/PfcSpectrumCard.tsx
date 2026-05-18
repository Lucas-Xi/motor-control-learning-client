import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { spectrumOf, outputSampleRate, type BoostPfcResult } from '../../simulation/math/boostPfc';
import { makeNotch } from '../../simulation/math/biquad';
import { formatNumber } from '../../utils/format';

/**
 * 输入电流频谱卡：
 *   - 基波 50 Hz + 关键谐波 150/250/350/450 Hz 柱状图
 *   - 高亮 3 / 5 / 7 次（家用 PFC 主要痛点）
 *   - 切换 "陷波抑制" 模式：把 biquad makeNotch 串到 i_grid 上看某次谐波被压下去
 *
 * 物理意义：
 *   - IEC 61000-3-2 Class D 对 50W~600W 家电的谐波限值很严，3/5/7 次限值
 *     分别是基波的 3.4 / 1.9 / 1.0 mA/W；
 *   - 实测 PFC 后 3 次谐波是首要降标点，5/7 次次之；
 *   - 陷波器仅在仿真层叠到电流采样上演示——真实 STM32 实现会把陷波放在
 *     电流环参考侧（避免把控制带宽吃掉）。
 */

type FilterMode = 'none' | 'notch3' | 'notch5' | 'notch7';

const HARMONIC_TARGETS = [50, 150, 250, 350, 450, 550, 650];
const HIGHLIGHT_ORDERS = new Set([3, 5, 7]);

const CYAN = '#34d6ff';
const MINT = '#43f7b5';
const WARN = '#ffb84d';
const FAULT = '#ff5d8a';

export function PfcSpectrumCard({ result }: { result: BoostPfcResult }) {
  const [mode, setMode] = useState<FilterMode>('none');
  const [source, setSource] = useState<'pfc' | 'noPfc'>('pfc');

  const fsOut = outputSampleRate({});

  // 1) 取出 i_grid 时间序列
  // 2) 若开陷波，在采样上跑一遍 biquad
  const filtered = useMemo(() => {
    const src = source === 'pfc' ? result.i_grid_pfc : result.i_grid_no_pfc;
    if (mode === 'none') return src;
    const order = mode === 'notch3' ? 3 : mode === 'notch5' ? 5 : 7;
    const fc = 50 * order;
    const notch = makeNotch(fc, fsOut, 8);
    const out = new Array<number>(src.length);
    for (let i = 0; i < src.length; i += 1) out[i] = notch.step(src[i]);
    return out;
  }, [result, mode, source, fsOut]);

  // 3) 算频谱
  const { freq, mag } = useMemo(() => spectrumOf(filtered, fsOut), [filtered, fsOut]);

  // 4) 把 50/150/250/... 处的能量挑出来作为柱状图
  const bars = useMemo(() => {
    const findClosest = (target: number) => {
      let best = 1;
      for (let k = 2; k < freq.length; k += 1) {
        if (Math.abs(freq[k] - target) < Math.abs(freq[best] - target)) best = k;
      }
      return best;
    };
    return HARMONIC_TARGETS.map((f) => {
      const idx = findClosest(f);
      return { freq: f, mag: mag[idx] ?? 0, order: Math.round(f / 50) };
    });
  }, [freq, mag]);

  // 重算 THD（基于过滤后的电流序列，便于看陷波效果）
  const thd = useMemo(() => {
    if (bars[0].mag < 1e-6) return 0;
    let sq = 0;
    for (let i = 1; i < bars.length; i += 1) sq += bars[i].mag * bars[i].mag;
    return (Math.sqrt(sq) / bars[0].mag) * 100;
  }, [bars]);

  const thdTone = thd < 10 ? 'measure' : thd < 30 ? 'warn' : 'fault';
  const tone = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title="输入电流频谱"
      eyebrow="harmonics (DFT)"
      density="compact"
      action={<span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${tone(thdTone)}`}>THD {formatNumber(thd, 1)}%</span>}
    >
      <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-line-subtle bg-bg-base p-1 text-caption">
        <button
          type="button"
          onClick={() => setSource('pfc')}
          className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
            source === 'pfc' ? 'bg-accent-primary/15 text-accent-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          PFC 输出
        </button>
        <button
          type="button"
          onClick={() => setSource('noPfc')}
          className={`flex-1 rounded px-2 py-1 font-medium transition-colors ${
            source === 'noPfc' ? 'bg-accent-warn/15 text-accent-warn' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          裸整流
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-line-subtle bg-bg-base p-1 text-caption">
        {(['none', 'notch3', 'notch5', 'notch7'] as FilterMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-2 py-1 transition-colors ${
              mode === m ? 'bg-accent-measure/15 text-accent-measure' : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {m === 'none' ? '不滤波' : `陷波 ${m.replace('notch', '')}×50Hz`}
          </button>
        ))}
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <BarChart data={bars} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="freq" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="Hz" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }}
              formatter={((v: unknown, _name: unknown, item: { payload?: { order?: number; freq?: number } }) => [
                `${formatNumber(Number(v), 3)} A`,
                `${item.payload?.order ?? '-'} 次（${item.payload?.freq ?? '-'} Hz）`,
              ]) as never}
            />
            <ReferenceLine y={0} stroke="#1e2a3d" />
            <Bar dataKey="mag" radius={[4, 4, 0, 0]}>
              {bars.map((b) => (
                <Cell
                  key={b.freq}
                  fill={
                    b.order === 1
                      ? CYAN
                      : HIGHLIGHT_ORDERS.has(b.order)
                      ? source === 'pfc'
                        ? FAULT
                        : WARN
                      : MINT
                  }
                  opacity={b.order === 1 ? 1 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-caption">
        {bars.slice(1, 4).map((b) => (
          <div key={b.freq} className="rounded border border-line-subtle bg-bg-base p-2">
            <p className="text-ink-muted">
              {b.order} 次 · {b.freq} Hz
            </p>
            <p className="text-ink-primary">
              {formatNumber(bars[0].mag > 1e-6 ? (b.mag / bars[0].mag) * 100 : 0, 1)}% 基波
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        基波（50 Hz）<span className="text-accent-primary">cyan</span>，3/5/7 次重点谐波<span className="text-accent-fault">红</span>（家电 PFC 主要痛点，IEC 61000-3-2 Class D 主限值）。切到"陷波 N×50Hz"会用 biquad 把该次压下来 —— 这是仿真演示；真实 STM32 实现一般把陷波放在电流环参考侧，避免吞控制带宽。
      </p>
    </Card>
  );
}
