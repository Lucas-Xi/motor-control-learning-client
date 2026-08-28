import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { scoreSMO, simulateSMO } from '../../simulation/math/smo';
import { formatNumber } from '../../utils/format';

const CHART_MAX_POINTS = 280;
const CHATTER_WARN = 0.3;

const TUNE_PRESETS = {
  textbook: {
    label: '教材默认',
    speedRpm: 1500,
    smoGain: 80,
    boundaryLayer: 0.5,
    lpfCutoffHz: 120,
  },
  aggressive: {
    label: '高增益',
    speedRpm: 1500,
    smoGain: 220,
    boundaryLayer: 0.15,
    lpfCutoffHz: 250,
  },
  lowSpeed: {
    label: '低速',
    speedRpm: 280,
    smoGain: 80,
    boundaryLayer: 0.5,
    lpfCutoffHz: 80,
  },
} as const;

type PresetKey = keyof typeof TUNE_PRESETS;

interface ChartSample {
  t: number;
  errorDeg: number;
  switchSurfaceA: number;
}

function downsampleTune(data: ChartSample[], maxPoints: number): ChartSample[] {
  if (data.length <= maxPoints) return data;
  const stride = Math.ceil(data.length / maxPoints);
  const out: ChartSample[] = [];
  for (let i = 0; i < data.length; i += stride) out.push(data[i]);
  const last = data[data.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * SMO 整定卡：把主图里写死的 K / φ / LPF 拧开。
 * 主图只证明能锁；本卡看增益抖振、边界层拖尾、低速失锁。
 */
export function SmoTuningCard() {
  const [presetKey, setPresetKey] = useState<PresetKey>('textbook');
  const [speedRpm, setSpeedRpm] = useState<number>(TUNE_PRESETS.textbook.speedRpm);
  const [smoGain, setSmoGain] = useState<number>(TUNE_PRESETS.textbook.smoGain);
  const [boundaryLayer, setBoundaryLayer] = useState<number>(TUNE_PRESETS.textbook.boundaryLayer);
  const [lpfCutoffHz, setLpfCutoffHz] = useState<number>(TUNE_PRESETS.textbook.lpfCutoffHz);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = TUNE_PRESETS[k];
    setSpeedRpm(p.speedRpm);
    setSmoGain(p.smoGain);
    setBoundaryLayer(p.boundaryLayer);
    setLpfCutoffHz(p.lpfCutoffHz);
  };

  const samples = useMemo(
    () =>
      simulateSMO({
        speedRpm,
        polePairs: 4,
        rs: 0.55,
        lsMh: 1.2,
        fluxLinkage: 0.045,
        smoGain,
        boundaryLayer,
        lpfCutoffHz,
        pllKp: 200,
        pllKi: 2000,
        noise: 0.01,
      }),
    [speedRpm, smoGain, boundaryLayer, lpfCutoffHz],
  );

  const metrics = useMemo(() => scoreSMO(samples), [samples]);

  const chartData = useMemo<ChartSample[]>(() => {
    const mapped = samples.map((s) => ({
      t: Number(s.t.toFixed(3)),
      errorDeg: Number(s.errorDeg.toFixed(3)),
      switchSurfaceA: Number(s.switchSurfaceA.toFixed(4)),
    }));
    return downsampleTune(mapped, CHART_MAX_POINTS);
  }, [samples]);

  const chatterHigh = metrics.chatter > CHATTER_WARN;
  const warn = !metrics.locked || chatterHigh;

  return (
    <Card
      title="SMO 整定：增益抖振，边界层拖尾"
      eyebrow="sliding mode · sat boundary"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="z=K·sat(S/φ)；K 大跟踪快但 z 方波抖；φ 大平滑但等效增益下降；LPF 压抖振也加相位。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        z = K · sat(S/φ)。K 大跟踪快，但 z 变成方波抖振；φ 大把开关面抹平，等效增益下降、拖尾变长；
        LPF 压抖振也往 θ_est 里塞相位。三件事互相拆台。
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-secondary">整定预设：</span>
        {(Object.keys(TUNE_PRESETS) as PresetKey[]).map((k) => (
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
            {TUNE_PRESETS[k].label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-secondary">
        n <span className="formula">{formatNumber(speedRpm, 0)} rpm</span> ·
        K <span className="formula">{formatNumber(smoGain, 0)}</span> ·
        φ <span className="formula">{formatNumber(boundaryLayer, 2)} A</span> ·
        LPF <span className="formula">{formatNumber(lpfCutoffHz, 0)} Hz</span>
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>转速（rpm）</span>
          <span className="formula text-ink-primary">{formatNumber(speedRpm, 0)} rpm</span>
        </span>
        <input
          type="range" value={speedRpm} min={150} max={3000} step={10}
          onChange={(e) => setSpeedRpm(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="speed rpm"
          aria-valuemin={150} aria-valuemax={3000} aria-valuenow={speedRpm}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>滑模增益 K</span>
          <span className="formula text-ink-primary">{formatNumber(smoGain, 0)}</span>
        </span>
        <input
          type="range" value={smoGain} min={20} max={300} step={1}
          onChange={(e) => setSmoGain(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="smo gain"
          aria-valuemin={20} aria-valuemax={300} aria-valuenow={smoGain}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>边界层 φ（A）</span>
          <span className="formula text-ink-primary">{formatNumber(boundaryLayer, 2)} A</span>
        </span>
        <input
          type="range" value={boundaryLayer} min={0.05} max={2} step={0.01}
          onChange={(e) => setBoundaryLayer(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="boundary layer"
          aria-valuemin={0.05} aria-valuemax={2} aria-valuenow={boundaryLayer}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>BEMF LPF 截止（Hz）</span>
          <span className="formula text-ink-primary">{formatNumber(lpfCutoffHz, 0)} Hz</span>
        </span>
        <input
          type="range" value={lpfCutoffHz} min={40} max={400} step={5}
          onChange={(e) => setLpfCutoffHz(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="lpf cutoff hz"
          aria-valuemin={40} aria-valuemax={400} aria-valuenow={lpfCutoffHz}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">RMS误差</p>
          <p className={`formula text-body ${metrics.rmsErrorDeg > 20 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(metrics.rmsErrorDeg, 1)}°
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">峰值误差</p>
          <p className={`formula text-body ${metrics.peakErrorDeg > 30 ? 'text-accent-warn' : 'text-accent-primary'}`}>
            {formatNumber(metrics.peakErrorDeg, 1)}°
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">抖振 |S|</p>
          <p className={`formula text-body ${chatterHigh ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(metrics.chatter, 3)}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">是否锁定</p>
          <p className={`formula text-body ${metrics.locked ? 'text-accent-measure' : 'text-accent-fault'}`}>
            {metrics.locked ? '锁定' : '失锁'}
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t" type="number" domain={[0, 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (ms)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="err"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'error (°)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 20 }}
            />
            <YAxis
              yAxisId="s"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: '|S| (A)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 11, dx: -4, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} ms`}
              formatter={(v, name) => {
                const n = String(name);
                const unit = n.includes('S') ? ' A' : '°';
                return [`${Number(v).toFixed(2)}${unit}`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              yAxisId="err"
              y={10}
              stroke="#ff5c7a"
              strokeDasharray="3 4"
              strokeOpacity={0.6}
              label={{ value: '+10°', fill: '#ff8aa0', fontSize: 9, position: 'insideTopRight' }}
            />
            <ReferenceLine
              yAxisId="err"
              y={-10}
              stroke="#ff5c7a"
              strokeDasharray="3 4"
              strokeOpacity={0.6}
              label={{ value: '−10°', fill: '#ff8aa0', fontSize: 9, position: 'insideBottomRight' }}
            />
            <Line
              yAxisId="err"
              type="monotone"
              dataKey="errorDeg"
              stroke="#ff5c7a"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              name="errorDeg"
            />
            <Line
              yAxisId="s"
              type="monotone"
              dataKey="switchSurfaceA"
              stroke="#ffb84d"
              strokeWidth={1.3}
              dot={false}
              isAnimationActive={false}
              name="|S|"
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
          {!metrics.locked ? (
            <span className="text-accent-warn">
              未锁定：低速 BEMF 被噪声淹，θ_est 在 ±10° 门外晃。先把转速拉上去，再谈 K/φ。
            </span>
          ) : chatterHigh ? (
            <span className="text-accent-warn">
              抖振 |S| = {formatNumber(metrics.chatter, 3)} &gt; 0.3：边界层太薄，EMI/ADC 受不了。加厚 φ 或降低 K。
            </span>
          ) : (
            <span className="text-accent-measure">
              已锁定，抖振可接受。RMS {formatNumber(metrics.rmsErrorDeg, 1)}° · |S| {formatNumber(metrics.chatter, 3)}。
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        主图用死参数只证明 SMO 能锁。本卡让你把 K/φ/LPF 拧坏——工业上这三件事互相拆台。
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：sat 用 Q15；
        K 太大电流环听到开关噪声；φ 按额定电流 5–10%；
        LPF 截止约 <span className="formula">0.1~0.2× f_e</span>。
      </p>
    </Card>
  );
}
