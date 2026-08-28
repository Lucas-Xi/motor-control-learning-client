import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge, Layers3, Target } from 'lucide-react';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useSimulationStore } from '../../store/simulationStore';
import { clamp } from '../../utils/clamp';
import { formatNumber } from '../../utils/format';
import type { ControlLoopParams } from '../../simulation/engine/types';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { SerialCompareSpeedLoopCard } from './SerialCompareSpeedLoopCard';
import { IronLossBreakdownCard } from './IronLossBreakdownCard';
import { MechanicalResonanceCard } from './MechanicalResonanceCard';
import { CoggingFeedforwardCard } from './CoggingFeedforwardCard';
import { CoggingAdaptiveCard } from './CoggingAdaptiveCard';
import { ResonanceNotchCard } from './ResonanceNotchCard';
import { AutoNotchCard } from './AutoNotchCard';
import { ServoPositionCard } from './ServoPositionCard';
import { TwoMassBodeCard } from './TwoMassBodeCard';
import { makeAntiWindupPI } from '../../simulation/math/antiwindup';
import { CodeLabCard } from '../../components/lab/CodeLabCard';

/**
 * 使用带反计算抗饱和（back-calculation anti-windup）的 PI 控制器模拟三环级联。
 *
 * 相比于简单的积分钳位，反计算抗饱和在控制器饱和时把饱和量按 ka/ki 比例
 * 反馈到积分器，避免积分饱和导致的超调和振荡。
 *
 * 位置环：PID（带微分前馈）
 * 速度环：PI
 * 电流环：PI
 */
function simulateTripleLoop(params: ControlLoopParams) {
  const dt = 0.002;
  const duration = 2.2;

  // 位置环 PI（反计算抗饱和）
  const posPI = makeAntiWindupPI(
    params.positionKp, params.positionKi, 0.5,
    -800, 800,
  );
  // 速度环 PI
  const speedPI = makeAntiWindupPI(
    params.speedKp, params.speedKi, 0.5,
    -1200, 1200,
  );
  // 电流环 PI
  const currentPI = makeAntiWindupPI(
    params.currentKp, params.currentKi, 0.5,
    -20, 20,
  );

  let position = 0;
  let speedRpm = 0;
  let iq = 0;
  let lastPosError = 0;
  const data = [];

  for (let t = 0; t <= duration; t += dt) {
    // 位置环（PID：PI 抗饱和输出 + 微分项）
    const posError = params.targetPosition - position;
    const posDerivative = (posError - lastPosError) / dt;
    lastPosError = posError;
    const piOut = posPI.step(posError, dt);
    const speedRefFromPosition = piOut + params.positionKd * posDerivative;
    const speedRef = clamp(speedRefFromPosition, -Math.abs(params.targetSpeed), Math.abs(params.targetSpeed));

    // 速度环
    const speedError = speedRef - speedRpm;
    const iqRef = clamp(speedPI.step(speedError, dt), -10, 10);

    // 电流环
    const currentError = iqRef - iq;
    const voltageCmd = clamp(currentPI.step(currentError, dt), -24, 24);

    // 机电模型
    iq += (voltageCmd * 0.32 - iq) * dt * 80;
    const torque = 0.095 * iq;
    const omega = speedRpm * 2 * Math.PI / 60;
    const acceleration = (torque - params.loadTorque - params.damping * omega) / Math.max(params.inertia, 1e-6);
    speedRpm += (acceleration * dt * 60) / (2 * Math.PI);
    position += speedRpm * 6 * dt;
    if (data.length % 2 === 0) {
      data.push({ t, position, targetPosition: params.targetPosition, speedRpm, speedRef, iq, iqRef, torque });
    }
  }
  return data;
}

function LoopBlock({ title, desc, icon }: { title: string; desc: string; icon: 'position' | 'speed' | 'current' }) {
  const Icon = icon === 'position' ? Target : icon === 'speed' ? Gauge : Layers3;
  const color = icon === 'position' ? '#ffb84d' : icon === 'speed' ? '#34d6ff' : '#43f7b5';
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <Icon className="mb-1.5 h-5 w-5" style={{ color }} />
      <h3 className="font-display text-title text-ink-primary">{title}</h3>
      <p className="mt-1 text-caption leading-relaxed text-ink-secondary">{desc}</p>
    </div>
  );
}

function Primary() {
  const params = useSimulationStore((s) => s.controlLoop);
  const { t } = useI18n();
  const data = useMemo(() => simulateTripleLoop(params), [params]);
  return (
    <Card
      title={t('controlLoops.primaryTitle')}
      eyebrow={t('controlLoops.primaryEyebrow')}
      density="compact"
      action={<FidelityBadge level="simplified" hint={t('controlLoops.fidelityHint')} />}
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="s" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="position" dot={false} stroke="#ffb84d" strokeWidth={1.8} name={t('controlLoops.positionLabel')} isAnimationActive={false} />
            <Line type="monotone" dataKey="targetPosition" dot={false} stroke="#9eb5cb" strokeDasharray="5 5" name={t('controlLoops.targetPositionLabel')} isAnimationActive={false} />
            <Line type="monotone" dataKey="speedRpm" dot={false} stroke="#34d6ff" strokeWidth={1.8} name={t('controlLoops.speedLabel')} isAnimationActive={false} />
            <Line type="monotone" dataKey="iq" dot={false} stroke="#43f7b5" strokeWidth={1.6} name={t('controlLoops.iqLabel')} isAnimationActive={false} />
            <Line type="monotone" dataKey="iqRef" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name={t('controlLoops.iqRefLabel')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const params = useSimulationStore((s) => s.controlLoop);
  const { t } = useI18n();
  const data = useMemo(() => simulateTripleLoop(params), [params]);
  const last = data[data.length - 1];
  const oscillationRisk = params.speedKp > 0.22 || params.positionKp > 8;
  return (
    <>
      <Card title={t('controlLoops.hierarchyTitle')} eyebrow={t('controlLoops.hierarchyEyebrow')} density="compact">
        <div className="space-y-2">
          <LoopBlock title={t('controlLoops.positionLoopTitle')} icon="position" desc={t('controlLoops.positionLoopDesc')} />
          <LoopBlock title={t('controlLoops.speedLoopTitle')} icon="speed" desc={t('controlLoops.speedLoopDesc')} />
          <LoopBlock title={t('controlLoops.currentLoopTitle')} icon="current" desc={t('controlLoops.currentLoopDesc')} />
        </div>
      </Card>
      <Card title={t('controlLoops.finalStateTitle')} eyebrow={t('controlLoops.finalStateEyebrow')} density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('controlLoops.positionLabel')} </span><span className="text-ink-primary">{formatNumber(last.position, 1)}°</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('controlLoops.speedLabel')} </span><span className="text-ink-primary">{formatNumber(last.speedRpm, 1)} rpm</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('controlLoops.iqLabel')} </span><span className="text-ink-primary">{formatNumber(last.iq, 2)} A</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('controlLoops.torqueLabel')} </span><span className="text-ink-primary">{formatNumber(last.torque, 3)} Nm</span></div>
        </div>
      </Card>
      {oscillationRisk && (
        <Card tone="fault" density="compact">
          <p className="text-body leading-relaxed text-accent-fault">{t('controlLoops.oscWarn')}</p>
        </Card>
      )}
      <SerialCompareSpeedLoopCard />
      {/* round-10 物理真实化：铁损分解 Bertotti 三项 */}
      <IronLossBreakdownCard />
      {/* round-15 接入 UI：双质量传动共振 + Kp 上限 */}
      <MechanicalResonanceCard />
      {/* round-27 双质量 Bode：ARF/NRF × 速度环带宽上限 */}
      <TwoMassBodeCard />
      {/* round-22 齿槽前馈补偿（CT-FFC）：现象 → 对策 */}
      <CoggingFeedforwardCard />
      {/* round-28 自适应齿槽：失配植物 × LMS 残差学习 */}
      <CoggingAdaptiveCard />
      {/* round-23 反共振陷波抑制：与 MechanicalResonanceCard 形成扰动→对策闭环 */}
      <ResonanceNotchCard />
      {/* round-24 扫频辨识 × 自适应陷波：刚度漂移让固定陷波失准 → chirp 找峰重对准 */}
      <AutoNotchCard />
      {/* 伺服 S 曲线加减速规划 */}
      <ServoPositionCard />
      {/* Code Lab：陷波器 biquad 系数（配套上方共振陷波卡片） */}
      <CodeLabCard />
    </>
  );
}

export function ControlLoopsModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="control-loops" />} />;
}
