import { Snowflake, Thermometer, Zap, Activity, AlertTriangle, CheckCircle2, AlertOctagon, MinusCircle, Cog } from 'lucide-react';
import { Sparkline } from '../../components/charts/Sparkline';
import { torqueToIq } from '../../simulation/math/vaporCycle';
import { sampleComplianceParams } from '../../simulation/math/mechanicalCompliance';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchComplianceStore, type ComplianceKey } from '../../store/benchComplianceStore';
import { formatNumber } from '../../utils/format';
import { useBenchCycle } from './useBenchCycle';
import { useCycleHistory } from './useCycleHistory';
import { useI18n, type TKey } from '../../i18n/useI18n';

// 4 个传动预设的翻译 key（key 与 sampleComplianceParams 一致）
const COMPLIANCE_PRESET_LABEL_KEYS: Record<ComplianceKey, TKey> = {
  directDriveCompressor: 'refrigerationBench.complianceDirect',
  industrialFanBelt: 'refrigerationBench.complianceFanBelt',
  roboticJoint: 'refrigerationBench.complianceRobotJoint',
  agedDrive: 'refrigerationBench.complianceAged',
};

/**
 * 台架顶部常显的 KPI 条：4 个核心指标（COP / 排气温度 / 制冷量 / 所需 Iq）
 * 配合 sparkline + 阈值色 + 状态徽章。让用户切换到任何 probe tab 时都能瞥一眼当前工况健康度。
 */
export function BenchKpiStrip() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const result = useBenchCycle();
  const mechEnabled = useBenchComplianceStore((s) => s.enabled);
  const mechPreset = useBenchComplianceStore((s) => s.preset);
  const setMechPreset = useBenchComplianceStore((s) => s.setPreset);
  const toggleMech = useBenchComplianceStore((s) => s.toggleEnabled);
  const { t } = useI18n();

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

  // 瞬态扭矩超调比：peak / 稳态。> 1.5 警告，> 2.0 危险（典型反液击工况下的振铃峰值）
  const mech = result.mechCompliance;
  const overshootRatio = mech && result.torqueLoad > 1e-3
    ? mech.peakTorqueNm / result.torqueLoad
    : 0;
  const mechStatus = !mech ? 'good' : overshootRatio < 1.5 ? 'good' : overshootRatio < 2.0 ? 'warn' : 'bad';
  const mechToneClass =
    mechStatus === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/[0.04] text-accent-measure'
      : mechStatus === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/[0.04] text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/[0.04] text-accent-fault';

  return (
    <div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <KpiTile
        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        label={t('refrigerationBench.kpiCop')}
        value={formatNumber(cop, 2)}
        unit=""
        status={copStatus}
        statusLabels={{ good: t('refrigerationBench.statusGood'), warn: t('refrigerationBench.statusWarn'), bad: t('refrigerationBench.statusBad') }}
        history={h.cop}
        hint={cop >= 4 ? t('refrigerationBench.hintCopHigh') : cop >= 2.5 ? t('refrigerationBench.hintCopMid') : t('refrigerationBench.hintCopLow')}
      />
      <KpiTile
        icon={<Thermometer className="h-3.5 w-3.5" />}
        label={t('refrigerationBench.kpiTdischarge')}
        value={formatNumber(Td, 1)}
        unit="°C"
        status={TdStatus}
        statusLabels={{ good: t('refrigerationBench.statusGood'), warn: t('refrigerationBench.statusWarn'), bad: t('refrigerationBench.statusBad') }}
        history={h.Td}
        hint={Td > 110 ? t('refrigerationBench.hintTdHigh') : Td > 90 ? t('refrigerationBench.hintTdMid') : t('refrigerationBench.hintTdOk')}
      />
      <KpiTile
        icon={<Snowflake className="h-3.5 w-3.5" />}
        label={t('refrigerationBench.kpiCapacity')}
        value={formatNumber(Qc, 2)}
        unit="kW"
        status={QcStatus}
        statusLabels={{ good: t('refrigerationBench.statusGood'), warn: t('refrigerationBench.statusWarn'), bad: t('refrigerationBench.statusBad') }}
        history={h.Qc}
        hint={Qc >= 1 ? t('refrigerationBench.hintCapAmple') : Qc >= 0.3 ? t('refrigerationBench.hintCapLow') : t('refrigerationBench.hintCapMin')}
      />
      <KpiTile
        icon={<Zap className="h-3.5 w-3.5" />}
        label={t('refrigerationBench.kpiIqRequired')}
        value={formatNumber(Iq, 1)}
        unit="A"
        status={IqStatus}
        statusLabels={{ good: t('refrigerationBench.statusGood'), warn: t('refrigerationBench.statusWarn'), bad: t('refrigerationBench.statusBad') }}
        history={h.Iq}
        hint={Math.abs(Iq) > motor.ratedCurrent ? t('refrigerationBench.hintIqOver') : `${((Math.abs(Iq) / motor.ratedCurrent) * 100).toFixed(0)}% ${t('refrigerationBench.hintIqRatedSuffix')}`}
      />
    </div>

    {/* 机械传动柔性条：开关 + 4 预设 + 反液击瞬态扭矩峰值 + 共振频率。
        关闭态保持最简（仅开关 + 提示），让既有 4 KPI 视觉重心不被夺。 */}
    <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-caption ${
      mechEnabled ? mechToneClass : 'border-line-subtle bg-bg-surface text-ink-muted'
    }`}>
      <span className="flex items-center gap-1.5">
        <Cog className={`h-3.5 w-3.5 ${mechEnabled ? '' : 'text-ink-muted'}`} aria-hidden="true" />
        {t('refrigerationBench.mechFlexTitle')}
      </span>
      <button
        type="button"
        onClick={toggleMech}
        className={`rounded border px-1.5 py-[1px] text-[10px] transition-colors ${
          mechEnabled
            ? 'border-current/60 bg-current/10'
            : 'border-line bg-bg-elev hover:text-ink'
        }`}
        title={t('refrigerationBench.mechFlexToggleTitle')}
      >
        {mechEnabled ? t('refrigerationBench.mechFlexOn') : t('refrigerationBench.mechFlexOff')}
      </button>
      {mechEnabled && (
        <>
          <label className="flex items-center gap-1.5">
            <span>{t('refrigerationBench.mechFlexDrive')}</span>
            <select
              value={mechPreset}
              onChange={(e) => setMechPreset(e.target.value as ComplianceKey)}
              className="rounded border border-line bg-bg-elev px-1.5 py-[1px] text-[11px] text-ink-primary focus:border-accent-primary focus:outline-none"
              aria-label={t('refrigerationBench.mechFlexDriveAria')}
            >
              {(Object.keys(sampleComplianceParams) as ComplianceKey[]).map((k) => (
                <option key={k} value={k}>{t(COMPLIANCE_PRESET_LABEL_KEYS[k])}</option>
              ))}
            </select>
          </label>
          {mech && (
            <>
              <span className="font-mono">
                {t('refrigerationBench.mechFlexPeak')} <span className="font-bold">{formatNumber(mech.peakTorqueNm, 2)}</span> N·m
                <span className="ml-1 text-[10px] opacity-75">
                  {t('refrigerationBench.mechFlexPeakXPre')}{formatNumber(overshootRatio, 2)} {t('refrigerationBench.mechFlexSteady')}{t('refrigerationBench.mechFlexPeakXPost')}
                </span>
              </span>
              <span className="font-mono text-[10px] opacity-75">
                {t('refrigerationBench.mechFlexResonance')} {formatNumber(mech.resonanceHz, 0)} Hz · {t('refrigerationBench.mechFlexAntiResonance')} {formatNumber(mech.antiResonanceHz, 0)} Hz
              </span>
            </>
          )}
        </>
      )}
    </div>
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
  /** good/warn/bad 三状态的本地化短文案；由父组件根据当前 locale 注入。 */
  statusLabels: Record<Status, string>;
  history: number[];
  hint: string;
}

function KpiTile({ icon, label, value, unit, status, statusLabels, history, hint }: TileProps) {
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
  const statusText = statusLabels[status];
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
