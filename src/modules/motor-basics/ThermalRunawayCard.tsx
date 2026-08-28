import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { defaultPmsmParameters } from '../../simulation/math/motorModel';
import { downsampleThermalPoints, simulateThermal } from '../../simulation/math/thermalSim';
import { defaultThermalParams } from '../../simulation/math/thermalRsFlux';
import { formatNumber } from '../../utils/format';

const T_DEMAG = defaultThermalParams.TdemagC;
const T_RUNAWAY = 200;
const CHART_MAX_POINTS = 280;

// 预设标签为 i18n key（TKey 字面量），渲染处经 t() 取文案。
const LOOP_PRESETS = {
  roomLoad: {
    label: 'motorBasics.thermalRunawayPresetRoomLoad',
    ambientC: 25,
    vq: 6,
    loadTorque: 0.25,
  },
  hotAmbient: {
    label: 'motorBasics.thermalRunawayPresetHotAmbient',
    ambientC: 50,
    vq: 6,
    loadTorque: 0.25,
  },
  overload: {
    label: 'motorBasics.thermalRunawayPresetOverload',
    ambientC: 25,
    vq: 10,
    loadTorque: 0.45,
  },
} as const;

type PresetKey = keyof typeof LOOP_PRESETS;

interface ChartSample {
  t: number;
  windingTempC: number;
  copperLossW: number;
}

/**
 * 热闭环卡：损耗跟着温度跑，才会热失控。
 *
 * 降额卡（ThermalDeratingCard）把 Ploss 钉死，一阶爬升一定收敛。
 * 本卡走 simulateThermal：T↑ → Rs↑ + ψf↓ → Pcu/Pfe↑ → T↑↑。
 */
export function ThermalRunawayCard() {
  const { t } = useI18n();
  const [presetKey, setPresetKey] = useState<PresetKey>('roomLoad');
  const [ambientC, setAmbientC] = useState<number>(LOOP_PRESETS.roomLoad.ambientC);
  const [vq, setVq] = useState<number>(LOOP_PRESETS.roomLoad.vq);
  const [loadTorque, setLoadTorque] = useState<number>(LOOP_PRESETS.roomLoad.loadTorque);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = LOOP_PRESETS[k];
    setAmbientC(p.ambientC);
    setVq(p.vq);
    setLoadTorque(p.loadTorque);
  };

  const result = useMemo(
    () =>
      simulateThermal({
        vd: 0,
        vq,
        loadTorque,
        ambientC,
        initialTempC: ambientC,
        duration: 4,
        dt: 0.002,
        config: { base: defaultPmsmParameters },
      }),
    [vq, loadTorque, ambientC],
  );

  const chartData = useMemo<ChartSample[]>(() => {
    const src = downsampleThermalPoints(result.points, CHART_MAX_POINTS);
    return src.map((p) => ({
      t: Number(p.t.toFixed(3)),
      windingTempC: Number(p.windingTempC.toFixed(2)),
      copperLossW: Number(p.copperLossW.toFixed(3)),
    }));
  }, [result]);

  const runaway = result.thermalRunaway;
  const demag = result.demagAlarmCount > 0;
  const warn = runaway || demag;

  return (
    <Card
      title={t('motorBasics.thermalRunawayTitle')}
      eyebrow={t('motorBasics.thermalRunawayEyebrow')}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('motorBasics.thermalRunawayFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('motorBasics.thermalRunawayIntroA')}
        <span className="formula">P_loss</span>
        {t('motorBasics.thermalRunawayIntroB')}
        <span className="formula">T → Rs/ψf → Pcu/Pfe → T</span>
        {t('motorBasics.thermalRunawayIntroC')}
        <span className="formula">Rs +0.393%/K</span>
        {t('motorBasics.thermalRunawayIntroD')}
        <span className="formula">ψf −0.12%/K</span>
        {t('motorBasics.thermalRunawayIntroE')}
        <span className="text-accent-fault">peak &gt; 200°C</span>
        {t('motorBasics.thermalRunawayIntroEnd')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-secondary">{t('motorBasics.thermalRunawayPresetLabel')}</span>
        {(Object.keys(LOOP_PRESETS) as PresetKey[]).map((k) => (
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
            {t(LOOP_PRESETS[k].label)}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-secondary">
        {t('motorBasics.thermalRunawaySummaryAmbient')}<span className="formula">{formatNumber(ambientC, 0)} °C</span> ·
        vq <span className="formula">{formatNumber(vq, 1)} V</span> ·
        {t('motorBasics.thermalRunawaySummaryLoad')}<span className="formula">{formatNumber(loadTorque, 2)} Nm</span> ·
        vd <span className="formula">0 V</span> ·
        {t('motorBasics.thermalRunawaySummaryDuration')}<span className="formula">4 s</span>
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('motorBasics.thermalRunawayAmbientLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(ambientC, 0)} °C</span>
        </span>
        <input
          type="range" value={ambientC} min={15} max={60} step={1}
          onChange={(e) => setAmbientC(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('motorBasics.thermalRunawayAmbientAria')}
          aria-valuemin={15} aria-valuemax={60} aria-valuenow={ambientC}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('motorBasics.thermalRunawayVqLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(vq, 1)} V</span>
        </span>
        <input
          type="range" value={vq} min={2} max={12} step={0.1}
          onChange={(e) => setVq(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('motorBasics.thermalRunawayVqAria')}
          aria-valuemin={2} aria-valuemax={12} aria-valuenow={vq}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('motorBasics.thermalRunawayLoadLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(loadTorque, 2)} Nm</span>
        </span>
        <input
          type="range" value={loadTorque} min={0.05} max={0.6} step={0.01}
          onChange={(e) => setLoadTorque(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('motorBasics.thermalRunawayLoadAria')}
          aria-valuemin={0.05} aria-valuemax={0.6} aria-valuenow={loadTorque}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('motorBasics.thermalRunawaySteadyLabel')}</p>
          <p className={`formula text-body ${result.steadyTempC > T_DEMAG ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(result.steadyTempC, 1)} °C
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('motorBasics.thermalRunawayPeakLabel')}</p>
          <p className={`formula text-body ${
            runaway ? 'text-accent-fault' : result.peakTempC > T_DEMAG ? 'text-accent-warn' : 'text-accent-primary'
          }`}>
            {formatNumber(result.peakTempC, 1)} °C
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">τ</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.thermalTimeConstant, 2)} s
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('motorBasics.thermalRunawayDemagCountLabel')}</p>
          <p className={`formula text-body ${demag ? 'text-accent-fault' : 'text-accent-measure'}`}>
            {result.demagAlarmCount}
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
              label={{ value: 't (s)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="temp"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'T_winding (°C)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 36 }}
            />
            <YAxis
              yAxisId="pcu"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: 'Pcu (W)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 11, dx: -4, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
              formatter={(v, name) => {
                const n = String(name);
                const unit = n.includes('Pcu') || n.includes('W') ? ' W' : ' °C';
                return [`${Number(v).toFixed(2)}${unit}`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              yAxisId="temp"
              y={T_DEMAG}
              stroke="#ffb84d"
              strokeDasharray="3 3"
              label={{ value: `${t('motorBasics.thermalRunawayDemagRefPrefix')}${T_DEMAG}°C`, fill: '#ffb84d', fontSize: 9, position: 'insideTopRight' }}
            />
            <ReferenceLine
              yAxisId="temp"
              y={T_RUNAWAY}
              stroke="#fb7185"
              strokeDasharray="3 3"
              label={{ value: `${t('motorBasics.thermalRunawayRunawayRefPrefix')}200°C`, fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="windingTempC"
              stroke="#34d6ff"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
              name={t('motorBasics.thermalRunawayLegendWinding')}
            />
            <Line
              yAxisId="pcu"
              type="monotone"
              dataKey="copperLossW"
              stroke="#ffb84d"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Pcu (W)"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        runaway
          ? 'border-accent-fault/40 bg-accent-fault/10'
          : warn
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : 'border-accent-measure/40 bg-accent-measure/10'
      }`}
      >
        {runaway ? (
          <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-accent-fault" aria-hidden="true" />
        ) : warn ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {runaway ? (
            <span className="text-accent-fault">
              {t('motorBasics.thermalRunawayMsgRunawayPrefix')}{formatNumber(result.peakTempC, 1)}{t('motorBasics.thermalRunawayMsgRunawaySuffix')}
            </span>
          ) : demag ? (
            <span className="text-accent-warn">
              {t('motorBasics.thermalRunawayMsgDemagPrefix')}{result.demagAlarmCount}{t('motorBasics.thermalRunawayMsgDemagMid')}{T_DEMAG}{t('motorBasics.thermalRunawayMsgDemagSuffix')}
            </span>
          ) : (
            <span className="text-accent-measure">
              {t('motorBasics.thermalRunawayMsgOkPrefix')}{formatNumber(result.peakTempC, 1)}{t('motorBasics.thermalRunawayMsgOkMid')}{formatNumber(result.steadyTempC, 1)}{t('motorBasics.thermalRunawayMsgOkSuffix')}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        {t('motorBasics.thermalRunawayClosing')}
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('motorBasics.thermalRunawayPortingTitle')}</span>
        {t('motorBasics.thermalRunawayPortingBody')}
      </p>
    </Card>
  );
}
