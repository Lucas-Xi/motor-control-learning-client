import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { MtpaCurve } from '../../components/charts/MtpaCurve';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * MTPA / MTPV 操作图卡片：
 *   读 weakField (id, iq, uDc, targetRpm) 与 motorBasics (Ld, Lq, ψf, polePairs, ratedCurrent)，
 *   绘制 IPM 工程级操作图，附 4 列指标（转矩 / 电流余量 / 电压利用率 / MTPA 状态）。
 */
export function MtpaCurveCard() {
  const { t } = useI18n();
  const id = useSimulationStore((s) => s.weakField.id);
  const iq = useSimulationStore((s) => s.weakField.iq);
  const uDc = useSimulationStore((s) => s.weakField.uDc);
  const targetRpm = useSimulationStore((s) => s.weakField.targetRpm);

  const polePairs = useSimulationStore((s) => s.motorBasics.polePairs);
  const ldMh = useSimulationStore((s) => s.motorBasics.ldMh);
  const lqMh = useSimulationStore((s) => s.motorBasics.lqMh);
  const flux = useSimulationStore((s) => s.motorBasics.flux);
  const ratedCurrent = useSimulationStore((s) => s.motorBasics.ratedCurrent);

  // 关键派生指标（与 MtpaCurve 内的判定保持同公式同单位）
  const metrics = useMemo(() => {
    const ldH = ldMh / 1000;
    const lqH = lqMh / 1000;
    const omegaE = ((targetRpm * 2 * Math.PI) / 60) * polePairs;
    const vMax = uDc / Math.sqrt(3);
    const torque = 1.5 * polePairs * (flux * iq + (ldH - lqH) * id * iq);
    const iMag = Math.hypot(id, iq);
    const currentReserve = Math.max(0, ratedCurrent - iMag);
    // 电压利用率：当前 |Vdq| / V_max（以理想稳态 dq 方程估）
    const vd = -omegaE * lqH * iq;
    const vq = omegaE * (ldH * id + flux);
    const vMag = Math.hypot(vd, vq);
    const utilisation = vMax > 1e-3 ? Math.min(2, vMag / vMax) : 0;

    // 是否在 MTPA：用 |I| 重新求 MTPA 最优点比较
    let onMtpa = false;
    if (iMag < 0.5) {
      onMtpa = true;
    } else {
      let bestTau = -Infinity;
      let bestId = 0;
      let bestIq = iMag;
      for (let i = 0; i <= 90; i += 1) {
        const beta = (i / 90) * (Math.PI / 2);
        const idTry = -iMag * Math.sin(beta);
        const iqTry = iMag * Math.cos(beta);
        const tau = 1.5 * polePairs * (flux * iqTry + (ldH - lqH) * idTry * iqTry);
        if (tau > bestTau) {
          bestTau = tau;
          bestId = idTry;
          bestIq = iqTry;
        }
      }
      onMtpa = Math.hypot(bestId - id, bestIq - iq) < 1.0;
    }

    return { torque, currentReserve, utilisation, onMtpa, iMag };
  }, [id, iq, uDc, targetRpm, polePairs, ldMh, lqMh, flux, ratedCurrent]);

  return (
    <Card title={t('weakField.mtpaCurveTitle')} eyebrow="ipm operating map" density="compact">
      {/* padding-top hack 维持 4:3 (480 / 360 = 4/3) */}
      <div className="relative w-full overflow-hidden" style={{ paddingTop: `${(360 / 480) * 100}%` }}>
        <div className="absolute inset-0">
          <MtpaCurve
            id={id}
            iq={iq}
            ld={ldMh}
            lq={lqMh}
            flux={flux}
            polePairs={polePairs}
            ratedCurrent={ratedCurrent}
            rpm={targetRpm}
            uDc={uDc}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.mtpaCurveMetricTorque')}</p>
          <p className="font-mono text-ink-primary">{formatNumber(metrics.torque, 2)} Nm</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.mtpaCurveMetricCurrentReserve')}</p>
          <p className="font-mono text-ink-primary">{formatNumber(metrics.currentReserve, 1)} A</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.mtpaCurveMetricVoltageUtilisation')}</p>
          <p className={`font-mono ${metrics.utilisation > 1 ? 'text-accent-warn' : 'text-ink-primary'}`}>
            {formatNumber(metrics.utilisation * 100, 0)}%
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">MTPA</p>
          <p className={`font-mono ${metrics.onMtpa ? 'text-accent-measure' : 'text-accent-warn'}`}>
            {metrics.onMtpa ? t('weakField.mtpaCurveOnMtpa') : t('weakField.mtpaCurveOffMtpa')}
          </p>
        </div>
      </div>
    </Card>
  );
}
