import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateStartup, STATE_DESCRIPTIONS } from '../../simulation/math/startup';
import type { StartupState } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SerialCompareStartupCard } from './SerialCompareStartupCard';

const STATES: StartupState[] = ['idle', 'precharge', 'align', 'open-loop', 'hfi', 'bemf', 'fieldweak'];

function useStartupSamples() {
  const params = useSimulationStore((s) => s.startup);
  return useMemo(() => ({ params, samples: simulateStartup(params) }), [params]);
}

function StateMachineDiagram() {
  const { samples } = useStartupSamples();
  const time = useSimulationStore((s) => s.time);
  // 当前激活的 state：取仿真到当前 time 处的 state
  const idx = Math.min(samples.length - 1, Math.floor(time * 1000 / 10));
  const activeState = samples[idx]?.state ?? 'idle';

  return (
    <Card
      title="启动状态机"
      eyebrow="state diagram"
      density="compact"
      action={<FidelityBadge level="simplified" hint="时序仿真：转速一阶跟踪指令；状态切换条件按典型压缩机控制器设计" />}
    >
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {STATES.map((s, i) => {
          const meta = STATE_DESCRIPTIONS[s];
          const isActive = s === activeState;
          const isPast = STATES.indexOf(activeState) > i;
          return (
            <div key={s} className={`relative rounded-lg border p-3 transition-colors ${
              isActive
                ? 'border-accent-primary/60 bg-accent-primary/[0.10]'
                : isPast
                  ? 'border-accent-measure/30 bg-accent-measure/[0.04]'
                  : 'border-line-subtle bg-bg-base'
            }`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded text-caption font-medium ${
                  isActive ? 'bg-accent-primary/20 text-accent-primary' :
                  isPast ? 'bg-accent-measure/20 text-accent-measure' : 'bg-line-subtle text-ink-muted'
                }`}>{i}</span>
                <span className={`text-body font-medium ${isActive ? 'text-accent-primary' : 'text-ink-primary'}`}>
                  {meta.name}
                </span>
              </div>
              <p className="text-caption leading-relaxed text-ink-secondary">{meta.brief}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SpeedChart() {
  const { samples } = useStartupSamples();
  // 在转速曲线上标注每个状态切换点
  const transitions: Array<{ t: number; label: string }> = [];
  let lastState = samples[0]?.state;
  for (const s of samples) {
    if (s.state !== lastState) {
      transitions.push({ t: s.t, label: STATE_DESCRIPTIONS[s.state].name });
      lastState = s.state;
    }
  }
  return (
    <Card title="转速 / 电流时序" eyebrow="rpm & current" density="compact">
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis yAxisId="rpm" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <YAxis yAxisId="iq" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            {transitions.map((tr, i) => (
              <ReferenceLine key={i} yAxisId="rpm" x={tr.t} stroke="#5d7793" strokeDasharray="2 3"
                label={{ value: tr.label, fill: '#9eb5cb', fontSize: 9, position: 'top' }} />
            ))}
            <Line yAxisId="rpm" type="monotone" dataKey="rpmRef" dot={false} stroke="#9eb5cb" strokeDasharray="4 4" name="rpm 指令" isAnimationActive={false} />
            <Line yAxisId="rpm" type="monotone" dataKey="rpm" dot={false} stroke="#43f7b5" strokeWidth={2} name="rpm 实际" isAnimationActive={false} />
            <Line yAxisId="iq" type="monotone" dataKey="iqA" dot={false} stroke="#ffb84d" strokeWidth={1.5} name="Iq A" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { params } = useStartupSamples();
  return (
    <>
      <Card title="启动参数" eyebrow="startup constraints" density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">目标转速 </span>
            <span className="text-ink-primary">{formatNumber(params.targetRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">加速斜坡 </span>
            <span className="text-ink-primary">{formatNumber(params.accelRampRpmS, 0)} rpm/s</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">对齐时长 </span>
            <span className="text-ink-primary">{formatNumber(params.alignDurationMs, 0)} ms</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">HFI 切入 </span>
            <span className="text-ink-primary">{formatNumber(params.hfiHandoffRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">BEMF 切入 </span>
            <span className="text-ink-primary">{formatNumber(params.bemfHandoffRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">弱磁介入 </span>
            <span className="text-ink-primary">{formatNumber(params.fieldweakRpm, 0)} rpm</span>
          </div>
        </div>
      </Card>
      <Card title="反液击保护" eyebrow="anti-slugging" density="compact">
        <p className="text-body leading-relaxed text-ink-secondary">
          压缩机启动时如果转速突变，气缸内液态制冷剂可能被快速压缩 → <span className="text-accent-fault">液击</span> → 阀片 / 活塞损坏。
          斜坡 <span className="text-ink-primary">{formatNumber(params.accelRampRpmS, 0)} rpm/s</span> 是行业经验值（典型 300-800）。
          软启动期间 Iq 命令不能突变；速度环输出经过低通滤波再送电流环。
        </p>
      </Card>
      <Card title="状态切换规则" eyebrow="hand-off" density="compact">
        <ul className="space-y-1 text-caption text-ink-secondary">
          <li><span className="text-accent-primary">precharge</span>：母线电压稳定 ~200ms</li>
          <li><span className="text-accent-primary">align</span>：d 轴施加直流让转子归零，~800ms</li>
          <li><span className="text-accent-primary">open-loop</span>：V/f 拖动到 ~100 rpm</li>
          <li><span className="text-accent-primary">hfi</span>：HFI 解出角度，闭环到 ~500 rpm</li>
          <li><span className="text-accent-primary">bemf</span>：BEMF 信号足够大，平滑切换</li>
          <li><span className="text-accent-primary">fieldweak</span>：转速 &gt; 5000 rpm 时介入弱磁</li>
        </ul>
      </Card>
      <SerialCompareStartupCard />
    </>
  );
}

export function StartupStateMachineModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <StateMachineDiagram />
          <SpeedChart />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="startup-statemachine" />}
    />
  );
}
