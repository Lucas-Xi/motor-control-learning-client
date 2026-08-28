import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import {
  buildFfcLut,
  evaluateFfc,
} from '../../simulation/math/coggingCompensation';
import { sampleCoggingParams } from '../../simulation/math/cogging';
import { formatNumber } from '../../utils/format';

// 与 motor-basics ThermalDeratingCard 基准对齐：4 极对 + ψf=0.045 → K_t = 0.27 N·m/A
const POLE_PAIRS = 4;
const FLUX = 0.045;
const KT = 1.5 * POLE_PAIRS * FLUX;

const LUT_SIZES = [16, 32, 64, 128, 256] as const;

/**
 * 齿槽前馈补偿（CT-FFC）卡：cogging.ts 模拟扰动，本卡演示 STM32 上"反相同幅"
 * 查表抵消的实际效果，并暴露两大工程权衡：LUT 分辨率 vs 角度估计误差。
 */
export function CoggingFeedforwardCard() {
  const { t } = useI18n();
  const [lutSize, setLutSize] = useState<(typeof LUT_SIZES)[number]>(64);
  const [angleErrDeg, setAngleErrDeg] = useState(0);
  const params = sampleCoggingParams.hitachi15HP;

  const lut = useMemo(() => buildFfcLut(lutSize, params, KT), [lutSize, params]);

  // 两条评估：当前条件 + 理想对照（无角误差 + 大 LUT）
  const result = useMemo(
    () => evaluateFfc(lut, params, KT, (angleErrDeg * Math.PI) / 180, 360),
    [lut, params, angleErrDeg],
  );
  const idealLut = useMemo(() => buildFfcLut(512, params, KT), [params]);
  const ideal = useMemo(() => evaluateFfc(idealLut, params, KT, 0, 360), [idealLut, params]);

  // 图表数据：每 2° 一个点（180 个），免得 360 个点拖慢 SVG
  const chartData = useMemo(
    () => result.samples.filter((_, i) => i % 2 === 0).map((s) => ({
      thetaDeg: s.thetaDeg,
      Tcog: Number((s.tCogNm * 1000).toFixed(2)),       // mN·m
      Tresidual: Number((s.tResidualNm * 1000).toFixed(2)),
      iqFfc: Number(s.iqFfcA.toFixed(3)),
    })),
    [result],
  );

  const supprStatus =
    result.suppressionDb >= 25
      ? { tone: 'good', Icon: CheckCircle2, label: 'controlLoops.coggingFfcStatusGoodLabel' as const, hint: 'controlLoops.coggingFfcStatusGoodHint' as const }
      : result.suppressionDb >= 12
      ? { tone: 'warn', Icon: AlertTriangle, label: 'controlLoops.coggingFfcStatusWarnLabel' as const, hint: 'controlLoops.coggingFfcStatusWarnHint' as const }
      : { tone: 'bad', Icon: AlertOctagon, label: 'controlLoops.coggingFfcStatusBadLabel' as const, hint: 'controlLoops.coggingFfcStatusBadHint' as const };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('controlLoops.coggingFfcTitle')}
      eyebrow="cogging feed-forward · STM32 lookup compensation"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('controlLoops.coggingFfcFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('controlLoops.coggingFfcIntroA')}
        <span className="text-ink-primary">{t('controlLoops.coggingFfcIntroB')}</span>
        {t('controlLoops.coggingFfcIntroC')}
        <span className="text-accent-warn">{t('controlLoops.coggingFfcIntroD')}</span>
        {t('controlLoops.coggingFfcIntroE')}
        <span className="text-accent-fault">{t('controlLoops.coggingFfcIntroF')}</span>
        {t('controlLoops.coggingFfcIntroG')}
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.coggingFfcLutSizeLabel')}</span>
            <span className="formula text-ink-primary">{lutSize} entries</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {LUT_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLutSize(n)}
                className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
                  lutSize === n
                    ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                    : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.coggingFfcAngleErrLabel')}</span>
            <span className="formula text-ink-primary">{formatNumber(angleErrDeg, 1)}°</span>
          </span>
          <input
            type="range"
            value={angleErrDeg}
            min={0}
            max={15}
            step={0.5}
            onChange={(e) => setAngleErrDeg(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('controlLoops.coggingFfcAriaAngleErr')}
            aria-valuemin={0}
            aria-valuemax={15}
            aria-valuenow={angleErrDeg}
            aria-valuetext={`${angleErrDeg} degrees`}
          />
        </label>
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="thetaDeg"
              type="number"
              domain={[0, 360]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'θ_mech (°)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="T"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'T (mN·m)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 30 }}
              domain={[-100, 100]}
            />
            <YAxis
              yAxisId="iq"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              label={{ value: 'iq_ffc (A)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10, dx: -12, dy: -30 }}
              domain={[-0.5, 0.5]}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `θ = ${Number(v).toFixed(0)}°`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine yAxisId="T" y={0} stroke="#5d7793" strokeDasharray="2 3" />
            <Line yAxisId="T" type="monotone" dataKey="Tcog" stroke="#fb7185" strokeWidth={1.4} dot={false} isAnimationActive={false} name={t('controlLoops.coggingFfcLineCog')} />
            <Line yAxisId="T" type="monotone" dataKey="Tresidual" stroke="#43f7b5" strokeWidth={2} dot={false} isAnimationActive={false} name={t('controlLoops.coggingFfcLineResidual')} />
            <Line yAxisId="iq" type="monotone" dataKey="iqFfc" stroke="#34d6ff" strokeWidth={1.2} strokeDasharray="3 3" dot={false} isAnimationActive={false} name={t('controlLoops.coggingFfcLineIq')} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingFfcRmsBefore')}</p>
          <p className="formula text-body text-accent-fault">{formatNumber(result.rmsBeforeNm * 1000, 1)} mN·m</p>
          <p className="text-[10px] opacity-75">{t('controlLoops.coggingFfcRatedPctPrefix')}{formatNumber((result.rmsBeforeNm / 1) * 100, 1)}{t('controlLoops.coggingFfcRatedPctSuffix')}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingFfcRmsAfter')}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(result.rmsAfterNm * 1000, 2)} mN·m</p>
          <p className="text-[10px] opacity-75">{t('controlLoops.coggingFfcIdealPrefix')}{formatNumber(ideal.rmsAfterNm * 1000, 2)}{t('controlLoops.coggingFfcIdealSuffix')}</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(supprStatus.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <supprStatus.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t(supprStatus.label)}</span>
          </div>
          <p className="formula text-body">{formatNumber(result.suppressionDb, 1)} dB</p>
          <p className="text-[10px] leading-snug opacity-90">{t(supprStatus.hint)}</p>
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('controlLoops.coggingFfcPortingTitle')}</span>
        {t('controlLoops.coggingFfcPortingA')}<span className="formula">buildFfcLut</span>
        {t('controlLoops.coggingFfcPortingB')}<span className="formula">int16_t lut[64]</span>
        {t('controlLoops.coggingFfcPortingC')}
        <span className="formula">iq_total = iq_PI + lut[(theta &gt;&gt; n) &amp; mask]</span>
        {t('controlLoops.coggingFfcPortingD')}
        <span className="text-accent-fault">{t('controlLoops.coggingFfcPortingE')}</span>
        {t('controlLoops.coggingFfcPortingF')}
      </p>
    </Card>
  );
}
