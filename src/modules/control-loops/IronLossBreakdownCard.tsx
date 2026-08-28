import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { defaultIronLossParams, ironLoss } from '../../simulation/math/ironLoss';
import { formatNumber } from '../../utils/format';

/**
 * 铁损分解卡片：转速扫描 Bertotti 三项（磁滞 + 经典涡流 + 异常）+ 铜损对比。
 * 教学目的：让学员看见"高速段铁损是涡流主导（频率平方）"，
 * 解释为什么 EV 主驱 12000 rpm 巡航效率会比 4000 rpm 低 4-6 个 percentage points。
 */
export function IronLossBreakdownCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { t } = useI18n();

  const [iq, setIq] = useState(motor.ratedCurrent * 0.6);

  // 扫描转速 100..6000 rpm 共 24 个点
  const data = useMemo(() => {
    const N = 24;
    const rpmMin = 100;
    const rpmMax = 6000;
    const rs = (motor.rs ?? 0.5);
    return Array.from({ length: N + 1 }, (_, k) => {
      const rpm = rpmMin + ((rpmMax - rpmMin) * k) / N;
      const omegaMech = (rpm / 60) * 2 * Math.PI;
      const omegaElec = omegaMech * motor.polePairs;
      const loss = ironLoss(omegaElec, iq, defaultIronLossParams);
      // 铜损：3 相 × 1/2 × i² × R（dq 等效用 3/2 因子）
      const pCopper = 1.5 * iq * iq * rs;
      const pIn = loss.total + pCopper;
      const pOut = Math.max(0, motor.flux * 1.5 * motor.polePairs * iq * omegaMech);
      const eff = pOut > 1e-3 ? (pOut / (pOut + loss.total + pCopper)) * 100 : 0;
      return {
        rpm: Math.round(rpm),
        ph: Number(loss.ph.toFixed(2)),
        pe: Number(loss.pe.toFixed(2)),
        pa: Number(loss.pa.toFixed(2)),
        pcu: Number(pCopper.toFixed(2)),
        ptot: Number(pIn.toFixed(2)),
        eff: Number(eff.toFixed(1)),
      };
    });
  }, [iq, motor.rs, motor.polePairs, motor.flux]);

  // 当前工作点：取 4000 rpm 作为家用空调典型巡航
  const current = useMemo(() => {
    const cruiseRpm = 4000;
    const omegaMech = (cruiseRpm / 60) * 2 * Math.PI;
    const omegaElec = omegaMech * motor.polePairs;
    const loss = ironLoss(omegaElec, iq, defaultIronLossParams);
    const rs = (motor.rs ?? 0.5);
    const pCu = 1.5 * iq * iq * rs;
    return { ...loss, pCu };
  }, [iq, motor.rs, motor.polePairs]);

  const totalAtCruise = current.total + current.pCu;
  const ironPct = totalAtCruise > 0 ? (current.total / totalAtCruise) * 100 : 0;
  const ironTone = ironPct < 30 ? 'measure' : ironPct < 50 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('controlLoops.ironLossTitle')}
      eyebrow={t('controlLoops.ironLossEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint={t('controlLoops.ironLossFidelityHint')} />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">{t('controlLoops.ironLossIntro')}</p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.ironLossKpiCu')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.pCu, 1)} W</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.ironLossKpiFe')}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(current.total, 1)} W</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(ironTone)}`}>
          <p className="text-caption opacity-80">{t('controlLoops.ironLossKpiFePct')}</p>
          <p className="formula text-body">{formatNumber(ironPct, 0)} %</p>
        </div>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>iq (A)</span>
          <span className="formula text-ink-primary">{formatNumber(iq, 2)}</span>
        </span>
        <input
          type="range"
          value={iq}
          min={0.5}
          max={motor.ratedCurrent * 1.2}
          step={0.1}
          onChange={(e) => setIq(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('controlLoops.ironLossIqAria')}
          aria-valuemin={0.5}
          aria-valuemax={motor.ratedCurrent * 1.2}
          aria-valuenow={iq}
          aria-valuetext={`${formatNumber(iq, 2)} A`}
        />
      </label>

      <div className="h-48">
        <SafeResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -6 }} stackOffset="none">
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="rpm" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" rpm" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" W" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" stackId="loss" dataKey="ph" stroke="#34d6ff" fill="#34d6ff" fillOpacity={0.7} name={t('controlLoops.ironLossSeriesPh')} isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pe" stroke="#43f7b5" fill="#43f7b5" fillOpacity={0.7} name={t('controlLoops.ironLossSeriesPe')} isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pa" stroke="#ffb84d" fill="#ffb84d" fillOpacity={0.6} name={t('controlLoops.ironLossSeriesPa')} isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pcu" stroke="#ff5d8a" fill="#ff5d8a" fillOpacity={0.5} name={t('controlLoops.ironLossSeriesPcu')} isAnimationActive={false} />
          </AreaChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {t('controlLoops.ironLossNoteA')} <span className="formula">P_e ∝ (f·B)²</span>{' '}
        {t('controlLoops.ironLossNoteB')}
      </p>
    </Card>
  );
}
