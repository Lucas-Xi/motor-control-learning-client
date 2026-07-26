import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
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
    <Card title="绕组接法" eyebrow="Y / Δ 切换对比" density="compact">
      <div className="mb-3 flex gap-2">
        {(['Y', 'Δ'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => updateMotor({ windingType: t })}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-body font-medium transition-colors ${
              motor.windingType === t
                ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong'
            }`}
          >
            {t === 'Y' ? 'Y (星形)' : 'Δ (三角形)'}
          </button>
        ))}
      </div>
      <div className="space-y-1.5 text-caption">
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">等效相电阻 Rs</span>
          <span className="text-ink-primary">{formatNumber(derived.rsEq, 3)} Ω</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">等效 Ld</span>
          <span className="text-ink-primary">{formatNumber(derived.ldEq, 2)} mH</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">等效 Lq</span>
          <span className="text-ink-primary">{formatNumber(derived.lqEq, 2)} mH</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">相电流峰值</span>
          <span className="text-ink-primary">{formatNumber(derived.iPhasePeak, 2)} A</span>
        </div>
        <div className="flex justify-between rounded border border-line-subtle bg-bg-base px-3 py-1.5">
          <span className="text-ink-muted">转矩常数 Kt</span>
          <span className="text-accent-primary">{formatNumber(derived.kt, 4)} Nm/A</span>
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {derived.isDelta
          ? 'Δ 接：线电压 = 相电压，相电流 = 线电流/√3。等效阻抗×3，转矩不变但铁损增加。适合低速大转矩场合。'
          : 'Y 接：相电压 = 线电压/√3，相电流 = 线电流。标准中小电机常用接法。'}
      </p>
    </Card>
  );
}