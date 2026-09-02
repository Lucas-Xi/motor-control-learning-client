import { useMemo } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { calculateSvpwm } from '../../simulation/math/svpwm';
import { createFaultWaveform, isStatusOnlyFault } from '../../simulation/math/faultWaveforms';
import { BenchScope } from '../../modules/refrigeration-bench/BenchScope';
import { usePersistentState } from '../../utils/usePersistentState';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/useI18n';
import { DQWaveform } from '../charts/DQWaveform';
import { PWMChart } from '../charts/PWMChart';
import { StepResponseChart } from '../charts/StepResponseChart';
import { ThreePhaseWaveform } from '../charts/ThreePhaseWaveform';
import { SafeResponsiveContainer } from '../charts/SafeResponsiveContainer';
import { faultCases } from '../../content/faultCases';
import type { ThreePhaseParams } from '../../simulation/engine/types';

function ThreePhaseBranch() {
  const params = useSimulationStore((state) => state.threePhase);
  const time = useSimulationStore((state) => state.time);
  return <ThreePhaseWaveform params={params} cursorMs={time * 1000} />;
}

function MotorBasicsBranch() {
  // 由电机基础滑块（rpm × polepairs 决定电频率，机械角度做初始相位，额定电流做幅值）派生三相电流
  const motor = useSimulationStore((state) => state.motorBasics);
  const time = useSimulationStore((state) => state.time);
  const synthetic = useMemo<ThreePhaseParams>(() => ({
    amplitude: motor.ratedCurrent,
    frequency: Math.max(1, (motor.rpm / 60) * motor.polePairs),
    phaseDeg: motor.mechanicalDeg % 360,
    balance: 0,
    harmonic: 0,
    noise: 0,
  }), [motor.ratedCurrent, motor.rpm, motor.polePairs, motor.mechanicalDeg]);
  return <ThreePhaseWaveform params={synthetic} cursorMs={time * 1000} />;
}

function DQBranch() {
  // Park 模块：由 park.thetaDeg 推导旋转电频率（粗略），其余用 threePhase 的幅值/谐波/噪声
  const park = useSimulationStore((state) => state.park);
  const threePhase = useSimulationStore((state) => state.threePhase);
  const time = useSimulationStore((state) => state.time);
  const synthetic = useMemo<ThreePhaseParams>(() => ({
    amplitude: Math.max(threePhase.amplitude, Math.hypot(park.iAlpha, park.iBeta)),
    frequency: Math.max(1, threePhase.frequency),
    phaseDeg: park.thetaDeg,
    balance: threePhase.balance,
    harmonic: threePhase.harmonic,
    noise: threePhase.noise,
  }), [park.iAlpha, park.iBeta, park.thetaDeg, threePhase.amplitude, threePhase.frequency, threePhase.balance, threePhase.harmonic, threePhase.noise]);
  return <DQWaveform params={synthetic} cursorMs={time * 1000} />;
}

function SvpwmBranch() {
  const svpwm = useSimulationStore((state) => state.svpwm);
  const sv = useMemo(
    () => calculateSvpwm({ uAlpha: svpwm.uAlpha, uBeta: svpwm.uBeta, uDc: svpwm.uDc }),
    [svpwm.uAlpha, svpwm.uBeta, svpwm.uDc],
  );
  return <PWMChart dutyA={sv.dutyA} dutyB={sv.dutyB} dutyC={sv.dutyC} />;
}

function InverterBranch() {
  // 直接用 inverter.dutyA/B/C，不再借 svpwm slice
  const inv = useSimulationStore((state) => state.inverter);
  return <PWMChart dutyA={inv.dutyA} dutyB={inv.dutyB} dutyC={inv.dutyC} />;
}

function FieldWeakeningBranch() {
  // 弱磁工作点 → 经 dq 反变换得到 αβ 电压 → SVPWM 占空比，直接和滑块联动
  const params = useSimulationStore((state) => state.weakField);
  const sv = useMemo(() => {
    const ld = params.ldMh / 1000;
    const lq = params.lqMh / 1000;
    const omegaElectrical = (params.targetRpm * 2 * Math.PI / 60) * 4;
    const vd = 0.55 * params.id - omegaElectrical * lq * params.iq;
    const vq = 0.55 * params.iq + omegaElectrical * (ld * params.id + params.flux);
    // 取一个稳态电角度 0° 做投影示意
    const uAlpha = vd;
    const uBeta = vq;
    return calculateSvpwm({ uAlpha, uBeta, uDc: params.uDc });
  }, [params.ldMh, params.lqMh, params.targetRpm, params.id, params.iq, params.flux, params.uDc]);
  return <PWMChart dutyA={sv.dutyA} dutyB={sv.dutyB} dutyC={sv.dutyC} />;
}

function PIDBranch() {
  const pid = useSimulationStore((state) => state.pid);
  return (
    <StepResponseChart
      gains={{ kp: pid.kp, ki: pid.ki, kd: pid.kd }}
      target={pid.target}
      sampleMs={pid.sampleMs}
    />
  );
}

function FaultBranch() {
  const { t, locale } = useI18n();
  const fault = useSimulationStore((state) => state.fault);
  const data = useMemo(() => createFaultWaveform(fault.faultType, fault.severity, 200), [fault.faultType, fault.severity]);
  const faultCase = faultCases[fault.faultType];
  // en-US 优先 titleEn，缺失回退中文 title（与 FaultsDebuggingModule 一致）
  const title = (locale === 'en-US' ? (faultCase?.titleEn ?? faultCase?.title) : faultCase?.title) ?? '';
  if (isStatusOnlyFault(fault.faultType)) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-line-subtle bg-bg-base text-center">
        <span className="text-caption text-ink-muted">{t('shell.faultCurrentLabel')}<span className="text-accent-warn">{title}</span></span>
        <p className="max-w-md px-6 text-body text-ink-secondary">
          {t('shell.faultStatusOnlyLead')}<span className="text-accent-warn">{t('shell.faultStatusOnlyHighlight')}</span>
          {t('shell.faultStatusOnlyTail')}
        </p>
      </div>
    );
  }
  return (
    <div className="h-56">
      <div className="mb-1 flex items-center justify-between text-caption text-ink-muted">
        <span>{t('shell.faultCurrentLabel')}<span className="text-accent-fault">{title}</span> · {t('faultsDebugging.serialSeverityLabel')} {(fault.severity * 100).toFixed(0)}%</span>
        <span>{t('shell.faultSeverityHint')}</span>
      </div>
      <SafeResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
          <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
          <YAxis yAxisId="i" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
          <YAxis yAxisId="s" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
          <Line yAxisId="i" type="monotone" dataKey="ia" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="Ia" isAnimationActive={false} />
          <Line yAxisId="i" type="monotone" dataKey="ib" dot={false} stroke="#43f7b5" strokeWidth={1.6} name="Ib" isAnimationActive={false} />
          <Line yAxisId="i" type="monotone" dataKey="ic" dot={false} stroke="#ffb84d" strokeWidth={1.6} name="Ic" isAnimationActive={false} />
          <Line yAxisId="s" type="monotone" dataKey="speed" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name="speed" isAnimationActive={false} />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}

function ControlLoopBranch() {
  // 用三闭环模块自身的电流环增益和目标速度做阶跃示意（不再硬编码）
  const params = useSimulationStore((state) => state.controlLoop);
  return (
    <StepResponseChart
      gains={{ kp: params.currentKp, ki: params.currentKi, kd: 0 }}
      target={1}
      sampleMs={2}
    />
  );
}

/**
 * 底部波形区（v0.2）：全端统一的可折叠设计。
 * 头部是一条 40px 的摘要栏（标题 + 折叠开关），收起时不挂载图表
 * （recharts/R3F 全部卸载，滚动与内存零负担），展开恢复。
 * 折叠偏好持久化到 localStorage，同时同步 uiStore.waveformOpen。
 */
export function WaveformPanel() {
  const activeModule = useSimulationStore((state) => state.activeModule);
  const waveformOpen = useUIStore((state) => state.waveformOpen);
  const toggleWaveform = useUIStore((state) => state.toggleWaveform);
  const { t } = useI18n();
  // 持久化偏好为唯一事实源；uiStore 同步一份供键盘快捷键等处读取
  const [persistOpen, setPersistOpen] = usePersistentState('waveform.open', true);
  const open = persistOpen;
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    setPersistOpen(v);
    useUIStore.setState({ waveformOpen: typeof v === 'function' ? v(open) : v });
  };
  void waveformOpen;
  void toggleWaveform;

  const branch =
      activeModule === 'park-transform' ? <DQBranch />
      : activeModule === 'svpwm' ? <SvpwmBranch />
      : activeModule === 'inverter' ? <InverterBranch />
      : activeModule === 'field-weakening' ? <FieldWeakeningBranch />
      : activeModule === 'pid-control' ? <PIDBranch />
      : activeModule === 'control-loops' ? <ControlLoopBranch />
      : activeModule === 'motor-basics' ? <MotorBasicsBranch />
      : activeModule === 'faults-debugging' ? <FaultBranch />
      : activeModule === 'refrigeration-bench' ? <BenchScope />
      : <ThreePhaseBranch />;

  return (
    <aside aria-label={t('shell.waveformCardTitle')} className="wave-collapse mt-4 block">
      <div className="overflow-hidden rounded-2xl border border-line-subtle bg-bg-surface">
        {/* 摘要栏：始终可见，折叠时即整个组件 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? t('shell.waveHideAria') : t('shell.waveShowAria')}
          className="flex h-10 w-full items-center justify-between px-3 text-left transition-colors hover:bg-bg-raised/60"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Activity className="h-3.5 w-3.5 shrink-0 text-accent-primary" aria-hidden />
            <span className="truncate text-caption font-medium text-ink-primary">{t('shell.waveformCardTitle')}</span>
            <span className="hidden truncate text-caption uppercase tracking-[0.18em] text-ink-muted sm:inline">{t('shell.waveformCardEyebrow')}</span>
          </span>
          <span className="flex items-center gap-1.5 text-caption text-ink-muted">
            {!open && <span className="hidden md:inline">{t('shell.waveCollapsedHint')}</span>}
            {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
          </span>
        </button>
        {/* 内容：收起即卸载（recharts 不挂载） */}
        {open && <div className="px-3 pb-3">{branch}</div>}
      </div>
    </aside>
  );
}
