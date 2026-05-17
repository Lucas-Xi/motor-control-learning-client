import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { HfiInjectionWaveform } from '../../components/charts/HfiInjectionWaveform';
import { computeHfiSignals } from '../../simulation/math/hfiSignals';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * HFI 信号链可视化卡片：
 *   注入电压 → 凸极调制电流响应 → 与载波相乘解调 → 一阶 LPF 误差信号
 *
 * 数据来源：
 *   - useSimulationStore 的 hfi（injectVoltage / injectFreqHz / saliencyRatio / measNoise / trueThetaRad）
 *   - useSimulationStore 的 motorBasics（ldMh / lqMh）
 * 本地状态：
 *   - 假定角度估计误差 θe，0 - 30°，让学员看到误差信号峰值如何随 sin(2θe) 变。
 */
export function HfiSignalChainCard() {
  // 切片选择器：避免每帧 time 推送拉爆
  const injectVoltage = useSimulationStore((s) => s.hfi.injectVoltage);
  const injectFreqHz = useSimulationStore((s) => s.hfi.injectFreqHz);
  const saliencyRatio = useSimulationStore((s) => s.hfi.saliencyRatio);
  const measNoise = useSimulationStore((s) => s.hfi.measNoise);
  const ldMh = useSimulationStore((s) => s.motorBasics.ldMh);
  const lqMh = useSimulationStore((s) => s.motorBasics.lqMh);

  const [thetaErrDeg, setThetaErrDeg] = useState(15);

  // 优先用 motorBasics 的 Ld/Lq；如果它们偏离 saliencyRatio 太远（学员只动了滑块没改电感），
  // 则退回用 saliencyRatio 推回一对 Ld/Lq，保持「凸极比滑块」依然有效。
  const { ldEffective, lqEffective } = useMemo(() => {
    const fromBasicsRatio = lqMh / Math.max(0.1, ldMh);
    const consistent = Math.abs(fromBasicsRatio - saliencyRatio) < 0.1;
    if (consistent) return { ldEffective: ldMh, lqEffective: lqMh };
    // 保持 Ld 不变，按 saliencyRatio 推 Lq
    return { ldEffective: ldMh, lqEffective: ldMh * Math.max(1.0, saliencyRatio) };
  }, [ldMh, lqMh, saliencyRatio]);

  const summary = useMemo(() => {
    return computeHfiSignals({
      injectFreqHz,
      injectAmpV: injectVoltage,
      ld: ldEffective,
      lq: lqEffective,
      thetaError: (thetaErrDeg * Math.PI) / 180,
      noiseLevel: measNoise,
      // 至少容下 6 个注入周期，方便学员看到稳态
      durationMs: Math.max(6, (6 * 1000) / Math.max(1, injectFreqHz)),
      sampleHz: Math.max(20000, injectFreqHz * 30),
    });
  }, [injectFreqHz, injectVoltage, ldEffective, lqEffective, thetaErrDeg, measNoise]);

  const ratio = lqEffective / Math.max(0.01, ldEffective);

  return (
    <Card
      title="HFI 信号链可视化"
      eyebrow="injection ↔ demod chain"
      density="compact"
    >
      <div className="grid grid-cols-3 gap-2">
        <Metric label="凸极比 Lq/Ld" value={formatNumber(ratio, 2)} hint={ratio < 1.2 ? 'IPM 凸极不足' : '可用'} tone={ratio < 1.2 ? 'fault' : 'measure'} />
        <Metric label="误差信号峰值" value={`${formatNumber(summary.errorPeak, 4)} A`} hint="∝ sin(2θe)" tone="warn" />
        <Metric label="解调 SNR" value={`${formatNumber(summary.demodSnrDb, 1)} dB`} hint={summary.demodSnrDb > 6 ? '可锁相' : '过噪声'} tone={summary.demodSnrDb > 6 ? 'measure' : 'fault'} />
      </div>

      <div className="mt-3 rounded-md border border-line-subtle bg-bg-base px-3 py-2">
        <div className="flex items-center justify-between text-caption">
          <span className="text-ink-muted">假定角度估计误差 θe</span>
          <span className="text-ink-primary tabular-nums">{thetaErrDeg.toFixed(0)}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={thetaErrDeg}
          onChange={(e) => setThetaErrDeg(Number(e.target.value))}
          className="mt-1 w-full accent-accent-primary"
          aria-label="假定角度估计误差 (°)"
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={thetaErrDeg}
          aria-valuetext={`${thetaErrDeg.toFixed(0)}°`}
        />
        <p className="mt-1 text-caption leading-snug text-ink-muted">
          θe = 0° 时误差信号几乎为零；增大 θe 误差信号峰值按 sin(2θe) 上升，约在 45° 处最大。这就是 PLL 闭环要驱回 0 的方向信息。
        </p>
      </div>

      <div className="mt-3">
        <HfiInjectionWaveform samples={summary.samples} height={220} />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        cyan = 注入电压 V_h·sin(ω_h·t)；mint = IPM 凸极调制后的电流响应（含噪声）；amber = 与 sin(ω_h·t) 相乘的解调中间信号（含 2ω_h 振荡 + 直流误差项）；rose = 一阶 LPF 后留下的角度误差信号 ∝ -(V_h / 2ω_h)·Δ·sin(2θe)。
      </p>
    </Card>
  );
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  tone: 'measure' | 'warn' | 'fault';
}

function Metric({ label, value, hint, tone }: MetricProps) {
  const toneCls =
    tone === 'measure' ? 'text-accent-measure' :
    tone === 'warn' ? 'text-accent-warn' :
    'text-accent-fault';
  // 颜色 + 形状 + sr-only 三通道（色盲/打印友好）
  const Icon = tone === 'measure' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : AlertOctagon;
  const srLabel = tone === 'measure' ? '正常' : tone === 'warn' ? '警戒' : '异常';
  return (
    <div className="rounded border border-line-subtle bg-bg-base px-2 py-1.5">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className={`flex items-center gap-1 font-display text-body tabular-nums ${toneCls}`}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="sr-only">{srLabel}：</span>
        {value}
      </p>
      {hint && <p className="text-caption text-ink-muted">{hint}</p>}
    </div>
  );
}
