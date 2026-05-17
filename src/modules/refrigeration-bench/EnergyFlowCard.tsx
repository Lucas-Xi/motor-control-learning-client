import { AlertOctagon, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EnergyFlowSankey } from '../../components/charts/EnergyFlowSankey';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchCycle } from './useBenchCycle';
import { formatNumber } from '../../utils/format';

// 教学级粗略效率（变频器实际典型值）
const PFC_EFF_DEFAULT = 0.96;
const FOC_EFF_DEFAULT = 0.93;

/**
 * 能量流图卡片：把当前蒸气压缩循环 + 变频器链路的能量分布可视化。
 *
 *   电网 ──→ PFC ──→ FOC(机械) ──→ 压缩机气动功 ──→ 制冷量
 *
 *  其中：
 *    - mechPowerKw       = gridPowerKw × η_PFC × η_FOC      （≈ 循环内 W_comp）
 *    - compressorWorkKw  = mechPowerKw × η_v                （容积效率简化）
 *    - coolingKw         = simulateCycle().Qc               （来自 Ph 模型）
 *    - gridPowerKw       = W_comp / (η_PFC × η_FOC)         （反推电网取功）
 */
export function EnergyFlowCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const cycle = useBenchCycle();

  const pfcEff = PFC_EFF_DEFAULT;
  const focEff = FOC_EFF_DEFAULT;

  // 反推电网取功：W_comp 是压缩机轴功率，电网到轴需要除以 PFC、FOC 效率
  const gridPowerKw = cycle.Wcomp / Math.max(0.4, pfcEff * focEff);
  const pfcOutKw = gridPowerKw * pfcEff;
  const mechPowerKw = pfcOutKw * focEff;

  const pfcLossW = (gridPowerKw - pfcOutKw) * 1000; // W
  const focLossW = (pfcOutKw - mechPowerKw) * 1000; // W

  const overallEff = gridPowerKw > 1e-6 ? cycle.Qc / gridPowerKw : 0;

  return (
    <Card title="能量流图" eyebrow="grid-to-cooling sankey" density="compact">
      <div className="relative w-full overflow-hidden" style={{ paddingTop: `${(380 / 720) * 100}%` }}>
        <div className="absolute inset-0">
          <EnergyFlowSankey
            gridPowerKw={gridPowerKw}
            pfcEfficiency={pfcEff}
            focEfficiency={focEff}
            isentropicEff={refrig.isentropicEff}
            volumetricEff={cycle.volumetricEff}
            coolingKw={cycle.Qc}
            cop={cycle.cop}
          />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-caption">
        {/* COP_sys：颜色 + 形状 + sr-only 三通道 */}
        {(() => {
          const eStatus = overallEff > 3 ? 'measure' : overallEff > 2 ? 'warn' : 'fault';
          const EIcon = eStatus === 'measure' ? CheckCircle2 : eStatus === 'warn' ? AlertTriangle : AlertOctagon;
          const eCls = eStatus === 'measure' ? 'text-accent-measure' : eStatus === 'warn' ? 'text-accent-warn' : 'text-accent-fault';
          const eSr = eStatus === 'measure' ? '高效' : eStatus === 'warn' ? '一般' : '低效';
          return (
            <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
              <div className="text-ink-muted">总效率 (COP_sys)</div>
              <div className={`flex items-center gap-1 font-mono font-medium ${eCls}`}>
                <EIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">{eSr}：</span>
                {formatNumber(overallEff, 2)}
              </div>
            </div>
          );
        })()}
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted">PFC 损耗</div>
          <div className="flex items-center gap-1 font-mono font-medium text-accent-fault">
            <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">损耗：</span>
            {formatNumber(pfcLossW, 0)} W
          </div>
        </div>
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted">FOC 损耗</div>
          <div className="flex items-center gap-1 font-mono font-medium text-accent-fault">
            <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">损耗：</span>
            {formatNumber(focLossW, 0)} W
          </div>
        </div>
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        默认 η_PFC = {(PFC_EFF_DEFAULT * 100).toFixed(0)}%，η_FOC = {(FOC_EFF_DEFAULT * 100).toFixed(0)}%；
        η_等熵、η_容积 来自 Ph 模型当前参数。带宽 ∝ 功率，肉眼直接对比哪一环节损失最大。
      </p>
    </Card>
  );
}
