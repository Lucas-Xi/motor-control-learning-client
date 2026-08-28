import { useMemo, useState } from 'react';
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import type { Refrigerant } from '../../simulation/math/refrigerantProps';
import { pSat } from '../../simulation/math/refrigerantProps';
import { volumetricEfficiency, wagnerCoeffs, wagnerSaturationPressure } from '../../simulation/math/wagnerEq';
import { formatNumber } from '../../utils/format';

const REFRIGERANTS: Array<{ id: Refrigerant; label: string }> = [
  { id: 'R32', label: 'R-32' },
  { id: 'R410A', label: 'R-410A' },
  { id: 'R134a', label: 'R-134a' },
];

/**
 * Wagner 方程 vs Antoine 方程偏差卡 + 容积效率 3D 曲面摘要。
 * 学员选制冷剂 + 看温度全程的两种方法精度差异（典型 ±3-8%）；
 * 拉转速 / 吸气温度滑块看容积效率随工况变化（而不只是压比）。
 */
export function WagnerVsAntoineCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const { t } = useI18n();

  const [selected, setSelected] = useState<Refrigerant>(refrig.refrigerant ?? 'R32');
  const [rpm, setRpm] = useState(3000);
  const [TsucC, setTsucC] = useState(refrig.Te + refrig.superheatK);

  // 温度扫描 -20°C..T_critical-5
  const sweep = useMemo(() => {
    const tc = wagnerCoeffs[selected].Tc - 273.15;
    const Tmin = -20;
    const Tmax = Math.min(80, tc - 5);
    const N = 25;
    return Array.from({ length: N + 1 }, (_, k) => {
      const T = Tmin + ((Tmax - Tmin) * k) / N;
      const wagner = wagnerSaturationPressure(T, selected);
      const antoine = pSat(T, selected);
      const errPct = wagner > 1e-3 ? Math.abs((wagner - antoine) / wagner) * 100 : 0;
      return {
        T: Number(T.toFixed(0)),
        Wagner: Number(wagner.toFixed(3)),
        Antoine: Number(antoine.toFixed(3)),
        errPct: Number(errPct.toFixed(1)),
      };
    });
  }, [selected]);

  // 当前工况下容积效率
  const Te = refrig.Te ?? 7;
  const Tc = refrig.Tc ?? 45;
  const Ps = wagnerSaturationPressure(Te, selected);
  const Pd = wagnerSaturationPressure(Tc, selected);
  const ratio = Pd / Math.max(0.01, Ps);

  const eta = useMemo(
    () =>
      volumetricEfficiency({
        clearanceRatio: refrig.clearanceRatio ?? 0.05,
        pressureRatio: ratio,
        polytropicN: 1.2,
        rpm,
        rpmRated: 3000,
        TsucC,
      }),
    [refrig.clearanceRatio, ratio, rpm, TsucC],
  );

  // 平均偏差
  const meanErr = useMemo(() => {
    const sum = sweep.reduce((a, p) => a + p.errPct, 0);
    return sum / Math.max(1, sweep.length);
  }, [sweep]);
  const maxErr = useMemo(() => Math.max(...sweep.map((p) => p.errPct)), [sweep]);

  const errTone = maxErr < 4 ? 'measure' : maxErr < 8 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('refrigerationBench.wagnerTitle')}
      eyebrow={t('refrigerationBench.wagnerEyebrow')}
      density="compact"
      action={<FidelityBadge level="exact" hint={t('refrigerationBench.wagnerFidelityHint')} />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">{t('refrigerationBench.wagnerIntro')}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {REFRIGERANTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            aria-pressed={selected === r.id}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              selected === r.id
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('refrigerationBench.wagnerKpiMean')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(meanErr, 1)} %</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(errTone)}`}>
          <p className="text-caption opacity-80">{t('refrigerationBench.wagnerKpiMax')}</p>
          <p className="formula text-body">{formatNumber(maxErr, 1)} %</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">Pd/Ps</p>
          <p className="formula text-body text-accent-measure">{formatNumber(ratio, 2)}</p>
        </div>
      </div>

      <div className="mb-3 h-44">
        <SafeResponsiveContainer>
          <ComposedChart data={sweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="T" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" °C" />
            <YAxis yAxisId="left" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" MPa" />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#ffb84d', fontSize: 11 }} unit=" %" domain={[0, 10]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line yAxisId="left" type="monotone" dataKey="Wagner" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            <Line yAxisId="left" type="monotone" dataKey="Antoine" stroke="#34d6ff" strokeWidth={1.4} dot={false} isAnimationActive={false} strokeDasharray="4 3" />
            <Bar yAxisId="right" dataKey="errPct" fill="#ffb84d" fillOpacity={0.45} name={t('refrigerationBench.wagnerSeriesErr')} />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>rpm</span>
            <span className="formula text-ink-primary">{formatNumber(rpm, 0)}</span>
          </span>
          <input type="range" value={rpm} min={500} max={6000} step={100}
            onChange={(e) => setRpm(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('refrigerationBench.wagnerRpmAria')}
            aria-valuemin={500} aria-valuemax={6000} aria-valuenow={rpm} aria-valuetext={`${rpm} rpm`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.wagnerSuctionT')}</span>
            <span className="formula text-ink-primary">{formatNumber(TsucC, 0)} °C</span>
          </span>
          <input type="range" value={TsucC} min={-10} max={70} step={2}
            onChange={(e) => setTsucC(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('refrigerationBench.wagnerSuctionTAria')}
            aria-valuemin={-10} aria-valuemax={70} aria-valuenow={TsucC} aria-valuetext={`${TsucC} °C`}
          />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2 text-center">
          <p className="text-caption text-ink-muted">{t('refrigerationBench.wagnerEtaBase')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(eta.etaBase * 100, 1)}%</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2 text-center">
          <p className="text-caption text-ink-muted">{t('refrigerationBench.wagnerEtaSpeed')}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(eta.speedFactor, 3)}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2 text-center">
          <p className="text-caption text-ink-muted">{t('refrigerationBench.wagnerEtaTemp')}</p>
          <p className="formula text-body text-accent-warn">{formatNumber(eta.tempFactor, 3)}</p>
        </div>
        <div className="rounded-lg border border-accent-primary/40 bg-accent-primary/10 p-2 text-center">
          <p className="text-caption text-accent-primary">{t('refrigerationBench.wagnerEtaTotal')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(eta.eta_v * 100, 1)}%</p>
        </div>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {t('refrigerationBench.wagnerNoteFormula')} {formatNumber(eta.etaBase, 3)} × {formatNumber(eta.speedFactor, 3)} ×{' '}
        {formatNumber(eta.tempFactor, 3)} = {formatNumber(eta.eta_v, 3)}{t('refrigerationBench.wagnerNoteTail')}
      </p>
    </Card>
  );
}
