import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import {
  bemfThd,
  coggingTorque,
  defaultBemfHarmonics,
  sampleCoggingParams,
} from '../../simulation/math/cogging';
import { formatNumber } from '../../utils/format';

/**
 * 齿槽转矩 + BEMF 空间谐波卡片：解释"低速咯咯响"与"电流环 6 倍频毛刺"两个教学难点。
 * 数据来源：cogging.ts 纯函数；电机参数从 motorBasics store 取 polePairs。
 */
export function CoggingTorqueCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { t } = useI18n();

  // 齿槽参数：用海立 1.5HP 样本 + 学员当前 polePairs（slots 仍取 12）
  const cogParams = useMemo(
    () => ({
      ...sampleCoggingParams.hitachi15HP,
      polePairs: motor.polePairs,
    }),
    [motor.polePairs],
  );

  // 扫描机械角 0..2π 共 240 个点
  const waveform = useMemo(() => {
    const N = 240;
    return Array.from({ length: N + 1 }, (_, k) => {
      const theta = (k / N) * 2 * Math.PI;
      const r = coggingTorque(theta, cogParams);
      return {
        deg: Number(((theta * 180) / Math.PI).toFixed(1)),
        T_cog_mNm: r.torque * 1000,
      };
    });
  }, [cogParams]);

  const periodPerRev = useMemo(() => coggingTorque(0, cogParams).periodPerRev, [cogParams]);
  const peak = useMemo(() => {
    let max = 0;
    for (const p of waveform) if (Math.abs(p.T_cog_mNm) > max) max = Math.abs(p.T_cog_mNm);
    return max;
  }, [waveform]);

  // BEMF 谐波柱状图数据
  const harmonicsData = useMemo(
    () =>
      defaultBemfHarmonics.map((h) => ({
        order: `${h.order}`,
        coef_pct: h.coef * 100,
      })),
    [],
  );
  const thd = useMemo(() => bemfThd(defaultBemfHarmonics) * 100, []);
  const thdTone = thd < 5 ? 'measure' : thd < 10 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('motorBasics.coggingTitle')}
      eyebrow={t('motorBasics.coggingEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint={t('motorBasics.coggingFidelityHint')} />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">{t('motorBasics.coggingIntro')}</p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('motorBasics.coggingKpiPeriods')}</p>
          <p className="formula text-body text-accent-primary">{periodPerRev}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('motorBasics.coggingKpiPeak')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(peak, 1)} mN·m</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(thdTone)}`}>
          <p className="text-caption opacity-80">BEMF THD</p>
          <p className="formula text-body">{formatNumber(thd, 1)} %</p>
        </div>
      </div>

      <div className="mb-3 h-40">
        <SafeResponsiveContainer>
          <LineChart data={waveform} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="deg" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" mN·m" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
              }}
            />
            <Line type="monotone" dataKey="T_cog_mNm" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name="T_cog" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div>
        <p className="mb-1 text-caption text-ink-muted">
          {t('motorBasics.coggingHarmonicsTitle')}
        </p>
        <div className="h-32">
          <SafeResponsiveContainer>
            <BarChart data={harmonicsData} margin={{ top: 4, right: 12, bottom: 4, left: -6 }}>
              <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
              <XAxis dataKey="order" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{
                  background: '#0d1929',
                  border: '1px solid #1e2a3d',
                  borderRadius: 8,
                  color: '#e7f3ff',
                }}
              />
              <Bar dataKey="coef_pct" fill="#34d6ff" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
