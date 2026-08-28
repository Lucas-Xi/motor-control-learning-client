import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  analyzeResonance,
  frequencyResponse,
  sweepFrequencyResponse,
  type TwoMassParams,
} from '../../simulation/math/twoMassResonance';
import { formatNumber } from '../../utils/format';

/** 典型联轴器 / 皮带预设：刚度把 NRF 从百赫兹压到十赫兹 */
const COUPLING_PRESETS = {
  servoCoupling: {
    label: '伺服弹性联轴器',
    j1: 0.0008,
    j2: 0.0012,
    shaftStiffness: 800,
    shaftDamping: 0.04,
  },
  compressorCoupling: {
    label: '压缩机橡胶联轴器',
    j1: 0.003,
    j2: 0.012,
    shaftStiffness: 180,
    shaftDamping: 0.08,
  },
  beltFan: {
    label: '皮带风机',
    j1: 0.002,
    j2: 0.015,
    shaftStiffness: 60,
    shaftDamping: 0.12,
  },
} as const;

type PresetKey = keyof typeof COUPLING_PRESETS;

interface BodeSample {
  freqHz: number;
  magDb: number;
}

const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 400];
const SWEEP_MAX_POINTS = 280;

function downsampleBode(data: BodeSample[], maxPoints: number): BodeSample[] {
  if (data.length <= maxPoints) return data;
  const stride = Math.ceil(data.length / maxPoints);
  const out: BodeSample[] = [];
  for (let i = 0; i < data.length; i += stride) out.push(data[i]);
  const last = data[data.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * 双质量 Bode 卡：G(jω)=ω1/Te 的反共振陷波 + 共振峰，
 * 把速度环带宽钉在 NRF 之下。时域相对转速见 MechanicalResonanceCard。
 */
export function TwoMassBodeCard() {
  const [presetKey, setPresetKey] = useState<PresetKey>('servoCoupling');
  const [shaftStiffness, setShaftStiffness] = useState<number>(COUPLING_PRESETS.servoCoupling.shaftStiffness);
  const [shaftDamping, setShaftDamping] = useState<number>(COUPLING_PRESETS.servoCoupling.shaftDamping);
  const [j2, setJ2] = useState<number>(COUPLING_PRESETS.servoCoupling.j2);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = COUPLING_PRESETS[k];
    setShaftStiffness(p.shaftStiffness);
    setShaftDamping(p.shaftDamping);
    setJ2(p.j2);
  };

  const preset = COUPLING_PRESETS[presetKey];

  const params = useMemo<TwoMassParams>(
    () => ({
      j1: preset.j1,
      j2,
      shaftStiffness,
      shaftDamping,
    }),
    [preset.j1, j2, shaftStiffness, shaftDamping],
  );

  const analysis = useMemo(() => analyzeResonance(params), [params]);
  const bwLimitHz = 0.3 * analysis.antiResonanceFreq;
  const highQ = analysis.qualityFactor > 8;
  const softShaft = shaftStiffness < 100;
  const warn = highQ || softShaft;

  const bodeData = useMemo<BodeSample[]>(() => {
    const sweep = sweepFrequencyResponse(params, 1, 400, 24);
    const extras = [analysis.antiResonanceFreq, analysis.resonanceFreq]
      .filter((f) => f >= 1 && f <= 400)
      .map((freqHz) => {
        const { mag } = frequencyResponse(freqHz, params);
        return {
          freqHz,
          magDb: 20 * Math.log10(Math.max(mag, 1e-20)),
        };
      });
    const merged = [
      ...sweep.map((p) => ({ freqHz: p.freqHz, magDb: p.magDb })),
      ...extras,
    ].sort((a, b) => a.freqHz - b.freqHz);
    return downsampleBode(merged, SWEEP_MAX_POINTS);
  }, [params, analysis.antiResonanceFreq, analysis.resonanceFreq]);

  return (
    <Card
      title="双质量 Bode：反共振把速度环带宽钉死"
      eyebrow="two-mass · ARF / NRF"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="Ellis Ch.12；ω_ar=√(Ks/J2)，ω_r=√(Ks(J1+J2)/(J1 J2))；G(jω)=ω1/Te"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        反共振是分子零点，电机侧几乎拧不动负载；共振是极点，轴扭振。
        速度环穿越必须低于
        <span className="formula text-accent-warn"> NRF</span>
        ，否则 Kp 一加就啸叫。这就是为什么机械卡讲时域相对转速，本卡讲频域上限。
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-secondary">联轴器预设：</span>
        {(Object.keys(COUPLING_PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => selectPreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:text-ink'
            }`}
          >
            {COUPLING_PRESETS[k].label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-secondary">
        J1 <span className="formula">{formatNumber(preset.j1, 4)} kg·m²</span> ·
        J2 <span className="formula">{formatNumber(j2, 4)} kg·m²</span> ·
        Ks <span className="formula">{formatNumber(shaftStiffness, 0)} Nm/rad</span> ·
        Cs <span className="formula">{formatNumber(shaftDamping, 2)} Nm·s/rad</span>
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>轴刚度 Ks（Nm/rad）</span>
          <span className="formula text-ink-primary">{formatNumber(shaftStiffness, 0)}</span>
        </span>
        <input
          type="range" value={shaftStiffness} min={30} max={2000} step={10}
          onChange={(e) => setShaftStiffness(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="shaft stiffness"
          aria-valuemin={30} aria-valuemax={2000} aria-valuenow={shaftStiffness}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>轴阻尼 Cs（Nm·s/rad）</span>
          <span className="formula text-ink-primary">{formatNumber(shaftDamping, 2)}</span>
        </span>
        <input
          type="range" value={shaftDamping} min={0.01} max={0.4} step={0.01}
          onChange={(e) => setShaftDamping(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="shaft damping"
          aria-valuemin={0.01} aria-valuemax={0.4} aria-valuenow={shaftDamping}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>负载惯量 J2（kg·m²）</span>
          <span className="formula text-ink-primary">{formatNumber(j2, 4)}</span>
        </span>
        <input
          type="range" value={j2} min={0.0005} max={0.03} step={0.0005}
          onChange={(e) => setJ2(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="load inertia j2"
          aria-valuemin={0.0005} aria-valuemax={0.03} aria-valuenow={j2}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">反共振 NRF</p>
          <p className="formula text-body text-accent-measure">
            {formatNumber(analysis.antiResonanceFreq, 1)} Hz
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">共振 ARF</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(analysis.resonanceFreq, 1)} Hz
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">Q</p>
          <p className={`formula text-body ${highQ ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(analysis.qualityFactor, 1)}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">建议速度环带宽</p>
          <p className="formula text-body text-accent-warn">
            ≤ {formatNumber(bwLimitHz, 1)} Hz
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={bodeData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="freqHz"
              type="number"
              scale="log"
              domain={[1, 400]}
              ticks={LOG_TICKS}
              allowDataOverflow
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              tickFormatter={(v) => String(v)}
              label={{ value: 'f (Hz)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: '|G| (dB)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 20 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `f = ${Number(v).toFixed(1)} Hz`}
              formatter={(v) => [`${Number(v).toFixed(1)} dB`, '|G| ω1/Te']}
            />
            <ReferenceLine
              x={analysis.antiResonanceFreq}
              stroke="#43f7b5"
              strokeDasharray="3 3"
              label={{ value: 'NRF', fill: '#43f7b5', fontSize: 10, position: 'insideTopLeft' }}
            />
            <ReferenceLine
              x={analysis.resonanceFreq}
              stroke="#ffb84d"
              strokeDasharray="3 3"
              label={{ value: 'ARF', fill: '#ffb84d', fontSize: 10, position: 'insideTopRight' }}
            />
            <Line
              type="monotone"
              dataKey="magDb"
              stroke="#34d6ff"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              name="|G| dB"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        warn
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : 'border-accent-measure/40 bg-accent-measure/10'
      }`}
      >
        {warn ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {warn ? (
            <span className="text-accent-warn">
              {highQ ? 'Q > 8：陷波必须对准共振峰，否则残余增益会把速度环顶穿。' : ''}
              {highQ && softShaft ? ' ' : ''}
              {softShaft ? '刚度偏低（皮带量级）：反共振掉到十赫兹，速度环带宽被钉死。' : ''}
            </span>
          ) : (
            <span className="text-accent-measure">
              峰值不尖、反共振够高：速度环可按 ≤ 0.3·f_ar 穿越，陷波作保险。
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：陷波中心对准
        <span className="formula"> ω_r</span>；
        辨识用 chirp（上一张 AutoNotchCard）；
        带宽经验
        <span className="formula"> f_bw ≤ 0.25~0.3 f_ar</span>。
      </p>
    </Card>
  );
}
