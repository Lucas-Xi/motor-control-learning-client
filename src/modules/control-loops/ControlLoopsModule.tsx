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

function simulateTripleLoop(params: ControlLoopParams) {
  const dt = 0.002;
  const duration = 2.2;
  let position = 0;
  let speedRpm = 0;
  let iq = 0;
  let posIntegral = 0;
  let lastPosError = 0;
  let speedIntegral = 0;
  let currentIntegral = 0;
  const data = [];
  for (let t = 0; t <= duration; t += dt) {
    const posError = params.targetPosition - position;
    posIntegral = clamp(posIntegral + posError * dt, -800, 800);
    const posDerivative = (posError - lastPosError) / dt;
    lastPosError = posError;
    const speedRefFromPosition = params.positionKp * posError + params.positionKi * posIntegral + params.positionKd * posDerivative;
    const speedRef = clamp(speedRefFromPosition, -Math.abs(params.targetSpeed), Math.abs(params.targetSpeed));
    const speedError = speedRef - speedRpm;
    speedIntegral = clamp(speedIntegral + speedError * dt, -1200, 1200);
    const iqRef = clamp(params.speedKp * speedError + params.speedKi * speedIntegral, -10, 10);
    const currentError = iqRef - iq;
    currentIntegral = clamp(currentIntegral + currentError * dt, -20, 20);
    const voltageCmd = clamp(params.currentKp * currentError + params.currentKi * currentIntegral, -24, 24);
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
  const data = useMemo(() => simulateTripleLoop(params), [params]);
  return (
    <Card
      title="三闭环级联响应"
      eyebrow="position → speed → current"
      density="compact"
      action={<FidelityBadge level="simplified" hint="位置/速度/电流三层级联是真实结构；电机用一阶 dq + 转矩常数 0.095 的简化模型，惯量/阻尼来自电机参数" />}
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="s" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="position" dot={false} stroke="#ffb84d" strokeWidth={1.8} name="位置" isAnimationActive={false} />
            <Line type="monotone" dataKey="targetPosition" dot={false} stroke="#9eb5cb" strokeDasharray="5 5" name="目标位置" isAnimationActive={false} />
            <Line type="monotone" dataKey="speedRpm" dot={false} stroke="#34d6ff" strokeWidth={1.8} name="速度" isAnimationActive={false} />
            <Line type="monotone" dataKey="iq" dot={false} stroke="#43f7b5" strokeWidth={1.6} name="Iq" isAnimationActive={false} />
            <Line type="monotone" dataKey="iqRef" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name="Iq参考" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const params = useSimulationStore((s) => s.controlLoop);
  const data = useMemo(() => simulateTripleLoop(params), [params]);
  const last = data[data.length - 1];
  const oscillationRisk = params.speedKp > 0.22 || params.positionKp > 8;
  return (
    <>
      <Card title="三层级联" eyebrow="loop hierarchy" density="compact">
        <div className="space-y-2">
          <LoopBlock title="位置环 PID" icon="position" desc="最外层，输出速度参考。不能急。" />
          <LoopBlock title="速度环 PI" icon="speed" desc="中间层，输出 Iq 参考。比电流环慢。" />
          <LoopBlock title="电流环 PI" icon="current" desc="最内层，与 PWM 同频，是稳定地基。" />
        </div>
      </Card>
      <Card title="末态指标" eyebrow="final state" density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">位置 </span><span className="text-ink-primary">{formatNumber(last.position, 1)}°</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">速度 </span><span className="text-ink-primary">{formatNumber(last.speedRpm, 1)} rpm</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">Iq </span><span className="text-ink-primary">{formatNumber(last.iq, 2)} A</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">转矩 </span><span className="text-ink-primary">{formatNumber(last.torque, 3)} Nm</span></div>
        </div>
      </Card>
      {oscillationRisk && (
        <Card tone="fault" density="compact">
          <p className="text-body leading-relaxed text-accent-fault">
            外环增益偏大，可能振荡。整定顺序：电流 → 速度 → 位置；每层都要比内层慢。
          </p>
        </Card>
      )}
    </>
  );
}

export function ControlLoopsModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="control-loops" />} />;
}
