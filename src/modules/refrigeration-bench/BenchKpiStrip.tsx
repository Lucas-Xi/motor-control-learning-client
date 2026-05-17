import { Snowflake, Thermometer, Zap, Activity, AlertTriangle, CheckCircle2, AlertOctagon, MinusCircle } from 'lucide-react';
import { Sparkline } from '../../components/charts/Sparkline';
import { torqueToIq } from '../../simulation/math/vaporCycle';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { useBenchCycle } from './useBenchCycle';
import { useCycleHistory } from './useCycleHistory';

/**
 * 台架顶部常显的 KPI 条：4 个核心指标（COP / 排气温度 / 制冷量 / 所需 Iq）
 * 配合 sparkline + 阈值色 + 状态徽章。让用户切换到任何 probe tab 时都能瞥一眼当前工况健康度。
 */
export function BenchKpiStrip() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const result = useBenchCycle();

  const cop = result.cop;
  const Td = result.Tdischarge;
  const Qc = result.Qc;
  const Iq = motor.flux > 1e-6 ? torqueToIq(result.torqueLoad, motor.polePairs, motor.flux) : 0;

  const h = useCycleHistory({ cop, Td, Qc, Iq });

  // 状态判定
  const copStatus = cop >= 4 ? 'good' : cop >= 2.5 ? 'warn' : 'bad';
  const TdStatus = Td <= 90 ? 'good' : Td <= 110 ? 'warn' : 'bad';
  const IqStatus = Math.abs(Iq) <= motor.ratedCurrent ? 'good' : 'bad';
  const QcStatus = Qc >= 1 ? 'good' : Qc >= 0.3 ? 'warn' : 'bad';

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiTile
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        label="COP"
        value={formatNumber(cop, 2)}
        unit=""
        status={copStatus}
        history={h.cop}
        hint={cop >= 4 ? '高效区' : cop >= 2.5 ? '一般' : '低效'}
      />
      <KpiTile
        icon={<Thermometer className="h-3.5 w-3.5" />}
        label="排气温度"
        value={formatNumber(Td, 1)}
        unit="°C"
        status={TdStatus}
        history={h.Td}
        hint={Td > 110 ? '超限保护' : Td > 90 ? '接近警戒' : '正常'}
      />
      <KpiTile
        icon={<Snowflake className="h-3.5 w-3.5" />}
        label="制冷量"
        value={formatNumber(Qc, 2)}
        unit="kW"
        status={QcStatus}
        history={h.Qc}
        hint={Qc >= 1 ? '充足' : Qc >= 0.3 ? '偏低' : '不足'}
      />
      <KpiTile
        icon={<Zap className="h-3.5 w-3.5" />}
        label="所需 Iq"
        value={formatNumber(Iq, 1)}
        unit="A"
        status={IqStatus}
        history={h.Iq}
        hint={Math.abs(Iq) > motor.ratedCurrent ? '超额定' : `${((Math.abs(Iq) / motor.ratedCurrent) * 100).toFixed(0)}% 额定`}
      />
    </div>
  );
}

type Status = 'good' | 'warn' | 'bad';

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  status: Status;
  history: number[];
  hint: string;
}

function KpiTile({ icon, label, value, unit, status, history, hint }: TileProps) {
  const bg = status === 'good' ? 'border-accent-measure/40 bg-accent-measure/[0.04]'
    : status === 'warn' ? 'border-accent-warn/40 bg-accent-warn/[0.04]'
    : 'border-accent-fault/40 bg-accent-fault/[0.04]';
  const valueColor = status === 'good' ? 'text-accent-measure'
    : status === 'warn' ? 'text-accent-warn'
    : 'text-accent-fault';
  const sparkColor = status === 'good' ? '#43f7b5'
    : status === 'warn' ? '#ffb84d'
    : '#ff5c7a';

  // 状态徽标：颜色 + 形状双通道，色盲友好（WCAG 1.4.1）
  //   good = ✓ MinusCircle 圆勾，warn = △ AlertTriangle，bad = ⬢ AlertOctagon
  const StatusIcon = status === 'good' ? CheckCircle2
    : status === 'warn' ? AlertTriangle
    : AlertOctagon;
  const statusText = status === 'good' ? '正常' : status === 'warn' ? '警戒' : '超限';
  // sparkline 形状区分：good 实线、warn 虚线、bad 点线
  const sparkDash = status === 'good' ? undefined : status === 'warn' ? '3 2' : '1 2';
  // hint 区域的图标也分形状（避免重复使用 Activity）
  const HintIcon = status === 'good' ? Activity : status === 'warn' ? MinusCircle : AlertTriangle;

  return (
    <div className={`rounded-xl border ${bg} px-3 py-2 transition-colors`}>
      <div className="flex items-center justify-between text-caption text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className={valueColor}>{icon}</span>
          {label}
        </span>
        <span className={`flex items-center gap-1 ${valueColor}`} title={statusText}>
          <StatusIcon className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{statusText}</span>
        </span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className={`font-mono text-display-sm font-bold ${valueColor}`} style={{ fontSize: '22px', lineHeight: 1 }}>
            {value}
          </span>
          {unit && <span className="text-caption text-ink-muted">{unit}</span>}
        </div>
        <Sparkline data={history} color={sparkColor} width={56} height={20} strokeDasharray={sparkDash} />
      </div>
      <div className={`mt-0.5 flex items-center gap-1 text-[10px] ${status === 'good' ? 'text-ink-muted' : status === 'warn' ? 'text-accent-warn' : 'text-accent-fault'}`}>
        <HintIcon className="h-2.5 w-2.5" aria-hidden="true" />
        {hint}
      </div>
    </div>
  );
}
