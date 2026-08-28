import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  detectDcm,
  simulateSwitchingPfc,
  switchingRippleNearPeak,
} from '../../simulation/math/switchingPfc';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { formatNumber } from '../../utils/format';

const PFC_PRESETS = {
  appliance: {
    // label 为 TKey，渲染处经 tr() 翻译
    label: 'apfFrontend.switchingPresetAppliance',
    lUh: 500,
    pwmFs: 20000,
    loadCurrent: 4,
  },
  compact: {
    label: 'apfFrontend.switchingPresetCompact',
    lUh: 200,
    pwmFs: 40000,
    loadCurrent: 3,
  },
  heavy: {
    label: 'apfFrontend.switchingPresetHeavy',
    lUh: 1200,
    pwmFs: 10000,
    loadCurrent: 5,
  },
} as const;

type PresetKey = keyof typeof PFC_PRESETS;

interface ChartSample {
  tMs: number;
  iL: number;
  vRectGhost: number;
}

const CHART_MAX_POINTS = 280;

function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const lastIdx = data.length - 1;
  const out: T[] = [];
  for (let k = 0; k < maxPoints - 1; k++) {
    const i = Math.round((k * lastIdx) / (maxPoints - 1));
    out.push(data[i]);
  }
  out.push(data[lastIdx]);
  return out;
}

/**
 * 开关级 Boost PFC 卡：三角载波比较得到锯齿 i_L。
 * 平均模型（PfcWaveformCard 等）只给 50Hz 电流；本卡回答 Δi_L、EMI 和 DCM。
 */
export function SwitchingPfcCard() {
  const { t } = useI18n();
  // 预设 label 为 TKey 字面量，统一经此 helper 翻译
  const tr = (s: string): string => t(s as TKey);
  const [presetKey, setPresetKey] = useState<PresetKey>('appliance');
  const [lUh, setLUh] = useState<number>(PFC_PRESETS.appliance.lUh);
  const [pwmFs, setPwmFs] = useState<number>(PFC_PRESETS.appliance.pwmFs);
  const [loadCurrent, setLoadCurrent] = useState<number>(PFC_PRESETS.appliance.loadCurrent);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = PFC_PRESETS[k];
    setLUh(p.lUh);
    setPwmFs(p.pwmFs);
    setLoadCurrent(p.loadCurrent);
  };

  const result = useMemo(
    () =>
      simulateSwitchingPfc({
        vAcRms: 220,
        freqHz: 50,
        udcRef: 380,
        lUh,
        cUf: 470,
        loadCurrent,
        pwmFs,
        currentKp: 0.5,
        currentKi: 50,
        cycles: 2,
      }),
    [lUh, pwmFs, loadCurrent],
  );

  const swRipple = useMemo(
    () => switchingRippleNearPeak(result, pwmFs),
    [result, pwmFs],
  );
  const dcm = useMemo(() => detectDcm(result), [result]);
  const rippleRatio = swRipple / (result.iLRms + 1e-12);
  const warn = dcm || rippleRatio > 0.4;

  const chartData = useMemo<ChartSample[]>(() => {
    const pts = result.points;
    if (pts.length === 0) return [];
    const tLast = pts[pts.length - 1].t;
    const t0 = tLast * 0.8;
    const window: ChartSample[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.t < t0) continue;
      window.push({
        tMs: Number((p.t * 1000).toFixed(3)),
        iL: Number(p.iL.toFixed(3)),
        vRectGhost: Number((p.vRect / 50).toFixed(3)),
      });
    }
    return downsample(window, CHART_MAX_POINTS);
  }, [result]);

  return (
    <Card
      title={t('apfFrontend.switchingTitle')}
      eyebrow="switching boost · Δi_L"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('apfFrontend.switchingFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('apfFrontend.switchingIntroA')}
        <span className="formula"> fs</span>
        {t('apfFrontend.switchingIntroB')}
        <span className="formula">Δi ≈ vRect·D·Ts/L</span>
        {t('apfFrontend.switchingIntroC')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">{t('apfFrontend.switchingPresetLabel')}</span>
        {(Object.keys(PFC_PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => selectPreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {tr(PFC_PRESETS[k].label)}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-muted">
        L <span className="formula">{formatNumber(lUh, 0)} µH</span> ·
        fs <span className="formula">{formatNumber(pwmFs / 1000, 0)} kHz</span> ·
        I_load <span className="formula">{formatNumber(loadCurrent, 1)} A</span> ·
        220 V / 50 Hz · Udc* 380 V · C 470 µF
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('apfFrontend.switchingInductanceLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(lUh, 0)} µH</span>
        </span>
        <input
          type="range" value={lUh} min={80} max={2000} step={10}
          onChange={(e) => setLUh(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="boost inductance uH"
          aria-valuemin={80} aria-valuemax={2000} aria-valuenow={lUh}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('apfFrontend.switchingFrequencyLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(pwmFs / 1000, 1)} kHz</span>
        </span>
        <input
          type="range" value={pwmFs} min={8000} max={50000} step={1000}
          onChange={(e) => setPwmFs(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="pwm switching frequency"
          aria-valuemin={8000} aria-valuemax={50000} aria-valuenow={pwmFs}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('apfFrontend.switchingLoadLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(loadCurrent, 1)} A</span>
        </span>
        <input
          type="range" value={loadCurrent} min={0.5} max={8} step={0.1}
          onChange={(e) => setLoadCurrent(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="load current"
          aria-valuemin={0.5} aria-valuemax={8} aria-valuenow={loadCurrent}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('apfFrontend.switchingMetricRipple')}</p>
          <p className={`formula text-body ${rippleRatio > 0.4 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(swRipple, 2)} A
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">THD</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.thd, 1)} %
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">PF</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.pf, 3)}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('apfFrontend.switchingMetricUdcAvg')}</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.udcAvg, 1)} V
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMs" type="number" domain={['dataMin', 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (ms)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'i_L (A)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} ms`}
              formatter={(v, name) => {
                const n = String(name);
                const unit = n.includes('vRect') ? ' V/50' : ' A';
                return [`${Number(v).toFixed(2)}${unit}`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <Line type="monotone" dataKey="vRectGhost" stroke="#5d7793" strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive={false} name="vRect/50" />
            <Line type="monotone" dataKey="iL" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name="i_L" />
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
              {dcm ? t('apfFrontend.switchingWarnDcm') : ''}
              {dcm && rippleRatio > 0.4 ? ' ' : ''}
              {rippleRatio > 0.4 ? t('apfFrontend.switchingWarnRipple') : ''}
            </span>
          ) : (
            <span className="text-accent-measure">
              {t('apfFrontend.switchingOkCcm')}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('apfFrontend.switchingStm32Title')}</span>
        {t('apfFrontend.switchingStm32Hint')}
      </p>
    </Card>
  );
}
