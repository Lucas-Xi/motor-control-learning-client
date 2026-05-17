import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { PWMChart } from '../../components/charts/PWMChart';
import { Inverter3D } from '../../components/three/Inverter3D';
import { inverterAverageModel } from '../../simulation/math/inverterModel';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber, formatPercent } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { DeadTimeCompensationCard } from './DeadTimeCompensationCard';

function createVoltageSamples(uDc: number, dutyA: number, dutyB: number, dutyC: number, deadLoss: number) {
  return Array.from({ length: 160 }, (_, i) => {
    const t = i / 159;
    const pwm = (duty: number) => (t % 0.1) / 0.1 < duty ? 1 : 0;
    const edgeRipple = Math.sin(t * Math.PI * 20) * deadLoss * uDc * 0.25;
    const va = (pwm(dutyA) - 0.5) * uDc - edgeRipple * Math.sign(dutyA - 0.5);
    const vb = (pwm(dutyB) - 0.5) * uDc - edgeRipple * Math.sign(dutyB - 0.5);
    const vc = (pwm(dutyC) - 0.5) * uDc - edgeRipple * Math.sign(dutyC - 0.5);
    return { t: t * 100, va, vb, vc, vab: va - vb };
  });
}

function useOutput() {
  const inverter = useSimulationStore((s) => s.inverter);
  return useMemo(() => {
    const output = inverterAverageModel({
      uDc: inverter.uDc,
      dutyA: inverter.dutyA,
      dutyB: inverter.dutyB,
      dutyC: inverter.dutyC,
      deadTimeSec: inverter.deadTimeUs * 1e-6,
      pwmFrequency: inverter.pwmFrequency,
    });
    const samples = createVoltageSamples(inverter.uDc, inverter.dutyA, inverter.dutyB, inverter.dutyC, output.deadTimeDistortion);
    return { inverter, output, samples };
  }, [inverter]);
}

function Primary() {
  const { inverter, samples } = useOutput();
  return (
    <Card
      title="相电压 / 线电压波形"
      eyebrow="phase and line voltage"
      density="compact"
      action={<FidelityBadge level="simplified" hint="平均模型：占空比 → 相电压成立，但忽略了开关纹波；死区损失按频率近似估算" />}
    >
      <Inverter3D dutyA={inverter.dutyA} dutyB={inverter.dutyB} dutyC={inverter.dutyC} />
      <div className="mt-3 h-56">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="stepAfter" dataKey="va" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="Va" isAnimationActive={false} />
            <Line type="stepAfter" dataKey="vb" dot={false} stroke="#43f7b5" strokeWidth={1.6} name="Vb" isAnimationActive={false} />
            <Line type="stepAfter" dataKey="vc" dot={false} stroke="#ffb84d" strokeWidth={1.6} name="Vc" isAnimationActive={false} />
            <Line type="monotone" dataKey="vab" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name="Vab" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { inverter, output } = useOutput();
  return (
    <>
      <Card title="占空比" eyebrow="phase duty" density="compact">
        <PWMChart dutyA={inverter.dutyA} dutyB={inverter.dutyB} dutyC={inverter.dutyC} />
        <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">死区损失 </span><span className="text-ink-primary">{formatPercent(output.deadTimeDistortion)}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">Va </span><span className="text-ink-primary">{formatNumber(output.phaseA, 2)} V</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">Vb </span><span className="text-ink-primary">{formatNumber(output.phaseB, 2)} V</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">Vab </span><span className="text-ink-primary">{formatNumber(output.lineAB, 2)} V</span></div>
        </div>
      </Card>
      <Card title="STM32 桥级 Checklist" eyebrow="hardware checklist" density="compact">
        <ul className="space-y-1.5 text-body text-ink-secondary">
          <li>· TIM1/TIM8 互补 PWM + 死区 + 刹车 + 过流硬件保护。先 PWM、再母线、再电机。</li>
          <li>· 死区过大低速畸变啸叫；过小上下管直通风险。</li>
          <li>· 中心对齐 PWM 的 ADC 采样点放在中点，避开开关边沿。</li>
        </ul>
      </Card>
      <DeadTimeCompensationCard />
    </>
  );
}

export function InverterModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="inverter" />} />;
}
