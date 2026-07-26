import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Card';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';
import { computeSingleSidedSpectrum, computeTHD } from './dft';
import { generateThreePhaseCurrent } from '../../simulation/math/transforms';
import { formatNumber } from '../../utils/format';
import { useSimulationStore } from '../../store/simulationStore';

type PhaseKey = 'ia' | 'ib' | 'ic';

const PHASE_CONFIG: Record<PhaseKey, { label: string; color: string }> = {
  ia: { label: 'A', color: '#f5a623' },
  ib: { label: 'B', color: '#43f7b5' },
  ic: { label: 'C', color: '#34d6ff' },
};

interface HarmonicBar {
  order: number;
  freq: number;
  /** 三相幅值 */
  ia: number;
  ib: number;
  ic: number;
}

interface PhaseThd {
  key: PhaseKey;
  thd: number;
  valid: boolean;
}

/**
 * 三相电流频谱对比卡。
 *
 * 扩展自单相 FFT 卡，同时计算 Ia/Ib/Ic 三相信号各自的频谱和 THD，
 * 并排显示三相谐波条状图 + THD 对比。
 */
export function ThreePhaseSpectrumCard() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const cursorMs = useSimulationStore((s) => s.time);

  const { bars, thds } = useMemo(() => {
    const fs = 5000;
    const cycles = 2;
    const period = 1 / Math.max(1, threePhase.frequency);
    const N = Math.round(fs * period * cycles);
    const N2 = N < 4 ? 4 : N;

    // 分别采集三相样本
    const samples: Record<PhaseKey, number[]> = { ia: [], ib: [], ic: [] };
    for (let i = 0; i < N2; i++) {
      const t = (cursorMs / 1000) + (i / fs);
      const abc = generateThreePhaseCurrent({
        amplitude: threePhase.amplitude,
        frequency: threePhase.frequency,
        phaseDeg: threePhase.phaseDeg,
        balance: threePhase.balance,
        harmonic: threePhase.harmonic,
        noise: threePhase.noise,
        time: t,
      });
      samples.ia.push(abc.ia);
      samples.ib.push(abc.ib);
      samples.ic.push(abc.ic);
    }

    // 各相 FFT
    const spectra: Record<PhaseKey, { freq: number[]; mag: number[] }> = {
      ia: computeSingleSidedSpectrum(samples.ia, fs),
      ib: computeSingleSidedSpectrum(samples.ib, fs),
      ic: computeSingleSidedSpectrum(samples.ic, fs),
    };

    // 各相 THD
    const thdValues: PhaseThd[] = (['ia', 'ib', 'ic'] as PhaseKey[]).map((k) => {
      const v = computeTHD(spectra[k].mag, 40);
      return { key: k, thd: Number.isFinite(v) ? v : 0, valid: Number.isFinite(v) };
    });

    // 合并谐波数据（取频谱中的基波到 15 次）
    const fundIdx = 1;
    const maxHarmonic = 15;
    const barData: HarmonicBar[] = [];
    for (let h = 0; h <= maxHarmonic; h++) {
      const idx = fundIdx * h;
      if (idx >= spectra.ia.mag.length) break;
      barData.push({
        order: h,
        freq: Math.round(spectra.ia.freq[idx]),
        ia: spectra.ia.mag[idx],
        ib: spectra.ib.mag[idx],
        ic: spectra.ic.mag[idx],
      });
    }

    const maxM = Math.max(...barData.flatMap((b) => [b.ia, b.ib, b.ic]), 0.001);

    return { bars: barData, thds: thdValues, maxMag: maxM };
  }, [threePhase, cursorMs]);

  // THD 颜色
  const thdTone = (v: number) => {
    if (!Number.isFinite(v)) return 'warn';
    if (v < 10) return 'measure';
    if (v < 30) return 'warn';
    return 'fault';
  };
  const toneClass = (t: string) =>
    t === 'measure' ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn' ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
        : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  // 三相平均 THD
  const avgThd = thds.reduce((s, t) => s + t.thd, 0) / thds.length;

  return (
    <Card title="三相电流频谱 (DFT)" eyebrow="Ia / Ib / Ic · FFT 对比" density="compact"
      action={
        <div className="flex gap-1.5">
          {thds.map((t) => (
            <span key={t.key}
              className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneClass(thdTone(t.thd))}`}
              style={{ borderColor: PHASE_CONFIG[t.key].color + '55' }}
            >
              {PHASE_CONFIG[t.key].label} THD {t.valid ? formatNumber(t.thd, 1) : '—'}%
            </span>
          ))}
        </div>
      }
    >
      {/* 三相并排条状图 */}
      <div className="h-56">
        <SafeResponsiveContainer>
          <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
            barGap={1} barCategoryGap="20%"
          >
            <CartesianGrid stroke="rgba(148, 210, 255, 0.08)" strokeDasharray="3 6" />
            <XAxis dataKey="freq" tick={{ fill: '#8fb7c9', fontSize: 10 }} unit="Hz" />
            <YAxis tick={{ fill: '#8fb7c9', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 10, fontSize: 12 }}
              formatter={((v: unknown, _name: string, item: { payload?: { order?: number } }) =>
                [`${formatNumber(Number(v), 3)} A`, `${item.payload?.order ?? '-'} 次`]) as never}
            />
            <ReferenceLine y={0} stroke="rgba(148,210,255,0.15)" />
            <Bar dataKey="ia" radius={[2, 2, 0, 0]} fill="#f5a623" opacity={0.7} />
            <Bar dataKey="ib" radius={[2, 2, 0, 0]} fill="#43f7b5" opacity={0.7} />
            <Bar dataKey="ic" radius={[2, 2, 0, 0]} fill="#34d6ff" opacity={0.7} />
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      {/* THD 对比条 */}
      <div className="mt-1 flex h-4 gap-2">
        {thds.map((t) => {
          const pct = t.valid ? Math.min(t.thd / Math.max(avgThd * 2, 1), 1) : 0;
          return (
            <div key={t.key} className="flex flex-1 flex-col gap-0.5">
              <div className="flex justify-between text-[9px] text-ink-muted">
                <span>{PHASE_CONFIG[t.key].label}</span>
                <span>{t.valid ? formatNumber(t.thd, 1) + '%' : '—'}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-base">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct * 100}%`, backgroundColor: PHASE_CONFIG[t.key].color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex flex-wrap gap-2 text-caption text-ink-muted">
        <span><span style={{ color: '#f5a623' }}>■</span> A 相</span>
        <span><span style={{ color: '#43f7b5' }}>■</span> B 相</span>
        <span><span style={{ color: '#34d6ff' }}>■</span> C 相</span>
      </div>
    </Card>
  );
}