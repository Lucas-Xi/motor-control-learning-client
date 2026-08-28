import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * Y/Δ 绕组接法切换卡。
 *
 * Y 接（星形）：相电压 = 线电压 / √3，相电流 = 线电流
 * Δ 接（三角形）：相电压 = 线电压，相电流 = 线电流 / √3
 *
 * 对电机参数的影响：
 *   - Δ 接等效相电阻 = 3 × Y 接相电阻
 *   - Δ 接等效相电感 = 3 × Y 接相电感
 *   - 相同线电压下，Δ 接相电流更大（转矩更大但铁损更高）
 */
export function WindingConnectionCard() {
  const { t } = useI18n();
  const motor = useSimulationStore((s) => s.motorBasics);
  const updateMotor = useSimulationStore((s) => s.updateMotorBasics);

  const derived = useMemo(() => {
    const isDelta = motor.windingType === 'Δ';
    // Y 接：Rs, Ld, Lq 即为相参数
    // Δ 接：线参数 = 相参数 × 3（等效电路视角）
    const rsEq = isDelta ? motor.rs * 3 : motor.rs;
    const ldEq = isDelta ? motor.ldMh * 3 : motor.ldMh;
    const lqEq = isDelta ? motor.lqMh * 3 : motor.lqMh;
    // 额定相电流幅值（Y 接=线电流，Δ 接=线电流/√3）
    const iPhasePeak = isDelta ? motor.ratedCurrent / Math.sqrt(3) : motor.ratedCurrent;
    // 转矩常数 Kt ≈ 1.5 × polePairs × ψf
    const kt = 1.5 * motor.polePairs * motor.flux;
    return { isDelta, rsEq, ldEq, lqEq, iPhasePeak, kt };
  }, [motor]);

  return (
    <Card title={t('motorBasics.windingTitle')} eyebrow={t('motorBasics.windingEyebrow')} density="compact">
      <div className="mb-3 flex gap-2">
        {(['Y', 'Δ'] as const).map((conn) => (
          <button
            key={conn}
            type="button"
            onClick={() => updateMotor({ windingType: conn })}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-body font-medium transition-colors ${
              motor.windingType === conn
                ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong'
            }`}
          >
            {conn === 'Y' ? t('motorBasics.windingStarLabel') : t('motorBasics.windingDeltaLabel')}
          </button>
        ))}
      </div>
      <div className="space-y-1.5 text-caption">
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">{t('motorBasics.windingRsLabel')}</span>
          <span className="text-ink-primary">{formatNumber(derived.rsEq, 3)} Ω</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">{t('motorBasics.windingLdLabel')}</span>
          <span className="text-ink-primary">{formatNumber(derived.ldEq, 2)} mH</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">{t('motorBasics.windingLqLabel')}</span>
          <span className="text-ink-primary">{formatNumber(derived.lqEq, 2)} mH</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">{t('motorBasics.windingIPeakLabel')}</span>
          <span className="text-ink-primary">{formatNumber(derived.iPhasePeak, 2)} A</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">{t('motorBasics.windingKtLabel')}</span>
          <span className="text-accent-primary">{formatNumber(derived.kt, 4)} Nm/A</span>
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {derived.isDelta ? t('motorBasics.windingDeltaHint') : t('motorBasics.windingStarHint')}
      </p>
    </Card>
  );
}