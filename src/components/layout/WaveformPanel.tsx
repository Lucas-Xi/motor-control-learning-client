import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { calculateSvpwm } from '../../simulation/math/svpwm';
import { createFaultWaveform, isStatusOnlyFault } from '../../simulation/math/faultWaveforms';
import { BenchScope } from '../../modules/refrigeration-bench/BenchScope';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { Card } from '../ui/Card';
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
      options={{ limit: pid.limit, antiWindup: pid.antiWindup, loadDisturbance: pid.loadDisturbance }}
    />
  );
}

function FaultBranch() {
  const fault = useSimulationStore((state) => state.fault);
  const data = useMemo(() => createFaultWaveform(fault.faultType, fault.severity, 200), [fault.faultType, fault.severity]);
  const title = faultCases[fault.faultType]?.title ?? '';
  if (isStatusOnlyFault(fault.faultType)) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-line-subtle bg-bg-base text-center">
        <span className="text-caption text-ink-muted">当前故障：<span className="text-accent-warn">{title}</span></span>
        <p className="max-w-md px-6 text-body text-ink-secondary">
          状态位类告警，<span className="text-accent-warn">无可见电气波形特征</span>。
          仅由压力传感器 / 油位开关上报，电流和转速保持额定运行直到主控触发停机保护。
        </p>
      </div>
    );
  }
  return (
    <div className="h-56">
      <div className="mb-1 flex items-center justify-between text-caption text-ink-muted">
        <span>当前故障：<span className="text-accent-fault">{title}</span> · 严重度 {(fault.severity * 100).toFixed(0)}%</span>
        <span>波形随严重度滑块即时变化</span>
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
 * 移动端折叠开关：<xl 默认折叠成 ~120px 高的预览，
 * 点 chevron 按钮展开 ~360px（与默认非折叠高度一致）。
 * 桌面端 ignore（按 xl: 媒体查询移除高度/可折叠 UI）。
 */
export function WaveformPanel() {
  const activeModule = useSimulationStore((state) => state.activeModule);
  const { t } = useI18n();
  // 默认折叠：节约移动端首屏空间。用户主动点开后保持展开。
  const [mobileExpanded, setMobileExpanded] = useState(false);
  // 模块切换时回到折叠态，避免上一个模块用户展开后挤压新模块
  useEffect(() => {
    setMobileExpanded(false);
  }, [activeModule]);

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
    <Card
      title={t('shell.waveformCardTitle')}
      eyebrow={t('shell.waveformCardEyebrow')}
      className="mt-4"
      action={
        <button
          type="button"
          onClick={() => setMobileExpanded((v) => !v)}
          className="mobile-touch-target inline-flex items-center gap-1 rounded-lg border border-line-subtle bg-bg-base px-2 py-1 text-caption text-ink-secondary hover:text-ink-primary xl:hidden"
          aria-expanded={mobileExpanded}
          aria-label={mobileExpanded ? t('shell.waveformCollapseAria') : t('shell.waveformExpandAria')}
        >
          {mobileExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          <span>{mobileExpanded ? t('shell.waveformCollapse') : t('shell.waveformExpand')}</span>
        </button>
      }
    >
      <div
        className={`overflow-hidden transition-[max-height] duration-300 xl:max-h-none ${
          mobileExpanded ? 'max-h-[420px]' : 'max-h-[120px]'
        }`}
      >
        {branch}
      </div>
    </Card>
  );
}
