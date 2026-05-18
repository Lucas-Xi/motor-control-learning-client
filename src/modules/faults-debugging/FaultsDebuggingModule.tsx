import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Stethoscope } from 'lucide-react';
import { useMemo } from 'react';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { faultCases } from '../../content/faultCases';
import { useSimulationStore } from '../../store/simulationStore';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { createFaultWaveform, isStatusOnlyFault } from '../../simulation/math/faultWaveforms';
import { BiquadFilterCard } from './BiquadFilterCard';
import { SerialFaultInjectionCard } from './SerialFaultInjectionCard';

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon: 'warn' | 'ok' }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <p className="mb-2 flex items-center gap-1.5 text-body font-medium text-ink-primary">
        {icon === 'warn' ? <AlertTriangle className="h-4 w-4 text-accent-warn" /> : <CheckCircle2 className="h-4 w-4 text-accent-measure" />}
        {title}
      </p>
      <ul className="space-y-1 text-caption leading-relaxed text-ink-secondary">
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function Primary() {
  const fault = useSimulationStore((s) => s.fault);
  const selected = faultCases[fault.faultType];
  const data = useMemo(() => createFaultWaveform(fault.faultType, fault.severity), [fault.faultType, fault.severity]);
  if (isStatusOnlyFault(fault.faultType)) {
    return (
      <Card
        title={`${selected.title}：状态位告警`}
        eyebrow="status-only fault"
        density="compact"
        tone="warn"
        action={<FidelityBadge level="illustrative" hint="此类故障由传感器/开关上报，不在电流或转速上留下可视特征" />}
      >
        <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-accent-warn" />
          <p className="text-body leading-relaxed text-ink-secondary">
            该故障属于<span className="text-accent-warn">压力 / 油位 / 温度等独立传感通道</span>触发的状态位告警，
            <br />
            主回路电流与转速在告警瞬间通常仍处于额定运行，<span className="text-accent-warn">不会出现可视电气波形特征</span>。
          </p>
          <p className="text-caption text-ink-muted">
            排查应直接查 GPIO 输入电平、I²C 传感器寄存器或 CAN 总线告警字段，而不是看示波器。
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card
      title={`${selected.title}：波形表现`}
      eyebrow="fault waveform signature"
      density="compact"
      action={<FidelityBadge level="illustrative" hint="按故障类型合成的特征示意：方向与真实物理一致，幅值/时刻为教学缩放" />}
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="ia" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="Ia" isAnimationActive={false} />
            <Line type="monotone" dataKey="ib" dot={false} stroke="#43f7b5" strokeWidth={1.6} name="Ib" isAnimationActive={false} />
            <Line type="monotone" dataKey="ic" dot={false} stroke="#ffb84d" strokeWidth={1.6} name="Ic" isAnimationActive={false} />
            <Line type="monotone" dataKey="speed" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name="speed" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const fault = useSimulationStore((s) => s.fault);
  const selected = faultCases[fault.faultType];
  return (
    <>
      <Card title="故障现象" eyebrow="symptom" density="compact" tone="fault">
        <div className="flex gap-2 text-body leading-relaxed text-accent-fault">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{selected.phenomenon}</p>
        </div>
      </Card>
      <Card title="STM32 对应关系" eyebrow="hardware mapping" density="compact">
        <p className="text-body leading-relaxed text-ink-secondary">{selected.stm32}</p>
      </Card>
      <ListBlock title="可能原因" items={selected.causes} icon="warn" />
      <ListBlock title="排查步骤" items={selected.steps} icon="ok" />
      <ListBlock title="解决建议" items={selected.fix} icon="ok" />
      <BiquadFilterCard />
      <SerialFaultInjectionCard />
    </>
  );
}

export function FaultsDebuggingModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="faults-debugging" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="faults-debugging" />}
    />
  );
}
