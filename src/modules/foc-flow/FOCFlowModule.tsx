import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Cpu, RotateCw } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { Tabs } from '../../components/ui/Tabs';
import { PWMChart } from '../../components/charts/PWMChart';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { Inverter3D } from '../../components/three/Inverter3D';
import { FocCurrentLoopChart } from '../../components/charts/FocCurrentLoopChart';
import { createFocFlowSnapshot, type FOCStep } from '../../simulation/engine/focFlow';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { motionEase } from '../../utils/motion';

// 3D αβ-dq 矢量空间：lazy 加载，避免把 three 拖进首屏关键路径
const RotorFluxScene = lazy(() => import('../../components/three/RotorFluxScene').then((m) => ({ default: m.RotorFluxScene })));

function VectorSpace3DCard({
  alpha,
  beta,
  d,
  q,
  theta,
  enabled,
  onToggle,
}: {
  alpha: number;
  beta: number;
  d: number;
  q: number;
  theta: number;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      title="3D 矢量空间"
      eyebrow="αβ stationary · dq rotating"
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={enabled}
            aria-label={enabled ? '关闭 3D 矢量空间视图' : '开启 3D 矢量空间视图'}
            onClick={onToggle}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              enabled
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong hover:text-ink-primary'
            }`}
          >
            {enabled ? '已开启 3D' : '开启 3D'}
          </button>
          <FidelityBadge level="exact" hint="同一组 (Iα, Iβ, Id, Iq, θ_e) 三种几何呈现：αβ 平面合成磁通 + 旋转 dq 坐标轴" />
        </div>
      }
    >
      <p className="mb-2 text-caption leading-relaxed text-ink-secondary">
        把"三相 → 合成磁通矢量"立起来看：mint 箭头是 αβ 静止平面上的合成电流矢量，下方旋转的 mint / 粉色十字是 dq 坐标轴。
        矢量长度反映 |I|，方向 = atan2(Iβ, Iα)。把 dq 轴对准合成矢量时 Iq 最大、Id≈0，正是 id=0 控制要做的事。
      </p>
      {enabled ? (
        <Suspense
          fallback={
            <div className="flex h-[320px] items-center justify-center rounded-2xl border border-line-subtle bg-bg-base text-caption text-ink-muted">
              正在加载 3D 矢量空间…
            </div>
          }
        >
          <RotorFluxScene theta={theta} id={d} iq={q} iAlpha={alpha} iBeta={beta} />
        </Suspense>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line-subtle bg-bg-base text-center text-caption text-ink-muted">
          <p>3D 立体视图默认关闭（按需加载 three.js）</p>
          <p>点击右上"开启 3D"加载</p>
        </div>
      )}
    </Card>
  );
}

function StepNode({ step, active, done, pulsing, onClick }: { step: FOCStep; active: boolean; done: boolean; pulsing: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full rounded-xl border p-3 text-left transition-colors ${
        active
          ? 'border-accent-primary/60 bg-accent-primary/10'
          : done
            ? 'border-accent-measure/30 bg-accent-measure/[0.05]'
            : 'border-line-subtle bg-bg-base hover:border-line-strong'
      }`}
    >
      {active && pulsing && (
        <motion.span
          className="absolute -top-px left-3 h-px w-12 bg-gradient-to-r from-accent-primary via-accent-measure to-transparent"
          initial={{ x: -12, opacity: 0.3 }}
          animate={{ x: [0, 24, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: motionEase.pulse }}
        />
      )}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h3 className="text-body font-medium text-ink-primary">{step.title}</h3>
        {done ? <CheckCircle2 className="h-4 w-4 text-accent-measure" /> : <Cpu className="h-4 w-4 text-accent-primary" />}
      </div>
      <p className="formula rounded bg-bg-surface px-2 py-1 text-caption text-accent-primary">{step.formula}</p>
      <p className="mt-1.5 text-caption leading-relaxed text-ink-secondary">{step.note}</p>
    </button>
  );
}

function ProbeRow({ entries }: { entries: Record<string, number | string> }) {
  return (
    <div className="space-y-1">
      {Object.entries(entries).map(([key, value]) => (
        <div key={key} className="flex items-center justify-between rounded border border-line-subtle bg-bg-base px-2.5 py-1.5">
          <span className="text-caption text-ink-muted">{key}</span>
          <span className="formula text-body text-ink-primary">{value}</span>
        </div>
      ))}
    </div>
  );
}

function useSnapshot() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const park = useSimulationStore((s) => s.park);
  const pid = useSimulationStore((s) => s.pid);
  const time = useSimulationStore((s) => s.time);
  return useMemo(() => createFocFlowSnapshot(threePhase, park, pid, time), [threePhase, park, pid, time]);
}

function CurrentLoopView() {
  const foc = useSimulationStore((s) => s.foc);
  return (
    <Card
      title="电流环阶跃响应"
      eyebrow="closed-loop tracking"
      density="compact"
      action={<FidelityBadge level="physical" hint="完整 PMSM dq 微分方程 + PI + 限幅 + 角度误差 + 采样延迟，是工程级仿真" />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        给电流环一个 Iq 阶跃指令，观察实际 Iq 跟踪、Id 串扰、超调与稳态误差。改右侧 Kp/Ki 看响应；改 Δθ 看角度误差导致的 dq 串扰；改 ω 看高速时的交叉耦合。
      </p>
      <FocCurrentLoopChart params={foc} />
    </Card>
  );
}

function PipelineView({
  manualStepIndex,
  setManualStepIndex,
}: {
  manualStepIndex: number | null;
  setManualStepIndex: (i: number | null) => void;
}) {
  const running = useSimulationStore((s) => s.running);
  const snapshot = useSnapshot();
  const locked = manualStepIndex !== null;
  const displayIndex = manualStepIndex ?? snapshot.activeIndex;
  return (
    <Card
      title="单周期 FOC 数据流"
      eyebrow="pwm interrupt pipeline"
      density="compact"
      action={<FidelityBadge level="exact" hint="单周期快照展示 abc → Clarke → Park → PI → 反 Park → SVPWM 每一步的精确数值" />}
    >
      <div className="mb-2 flex items-center justify-between rounded-lg border border-line-subtle bg-bg-base px-3 py-1.5 text-caption text-ink-muted">
        <span>点击步骤可锁定探针；运行态自动流动</span>
        {locked && (
          <button
            onClick={() => setManualStepIndex(null)}
            className="rounded border border-accent-measure/40 px-2 py-0.5 text-accent-measure transition-colors hover:bg-accent-measure/10"
          >
            恢复跟随
          </button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.steps.map((step, index) => (
          <div key={step.id} className="relative">
            <StepNode
              step={step}
              active={index === displayIndex}
              done={!locked && running ? index < snapshot.activeIndex : index < displayIndex}
              pulsing={!locked && running}
              onClick={() => setManualStepIndex(index)}
            />
            {index < snapshot.steps.length - 1 && index % 3 < 2 && (
              <ArrowRight className="absolute -right-2 top-1/2 hidden h-3 w-3 -translate-y-1/2 text-line-strong xl:block" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Probe({ manualStepIndex, view }: { manualStepIndex: number | null; view: 'pipeline' | 'loop' }) {
  const running = useSimulationStore((s) => s.running);
  const park = useSimulationStore((s) => s.park);
  const snapshot = useSnapshot();
  const locked = manualStepIndex !== null;
  const displayIndex = manualStepIndex ?? snapshot.activeIndex;
  const activeStep = snapshot.steps[displayIndex];
  // 3D 矢量空间默认关闭：避免首屏 mount three.js 触发 Chromium GL_CLOSE_PATH_NV 警告，
  // 同时让 first-meaningful-paint 更快；用户点开关后才 lazy 加载 three chunk。
  const [show3D, setShow3D] = useState(false);
  if (view === 'pipeline') {
    return (
      <>
        <Card title="当前步骤探针" eyebrow="input / output" density="compact">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-accent-primary/30 bg-accent-primary/[0.06] px-3 py-2">
            <RotateCw className={`h-4 w-4 text-accent-primary ${running && !locked ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }} />
            <div>
              <p className="text-body font-medium text-ink-primary">{activeStep.title}</p>
              <p className="text-caption leading-relaxed text-ink-secondary">{activeStep.note}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-caption text-ink-muted">输入</p>
              <ProbeRow entries={activeStep.input} />
            </div>
            <div>
              <p className="mb-1 text-caption text-ink-muted">输出</p>
              <ProbeRow entries={activeStep.output} />
            </div>
          </div>
        </Card>
        <Card title="αβ / dq 矢量" eyebrow="vector state" density="compact">
          <VectorPlane
            alpha={snapshot.alphaBeta.alpha}
            beta={snapshot.alphaBeta.beta}
            d={snapshot.dq.d}
            q={snapshot.dq.q}
            theta={(park.thetaDeg * Math.PI) / 180}
            showDqAxes
            title="电流矢量与 dq 投影"
            max={10}
          />
        </Card>
        <div className="grid gap-2 md:grid-cols-2">
          <Card title="SVPWM 输出" eyebrow="duty" density="compact">
            <PWMChart dutyA={snapshot.svpwm.dutyA} dutyB={snapshot.svpwm.dutyB} dutyC={snapshot.svpwm.dutyC} />
            <p className="formula mt-2 text-caption text-ink-secondary">扇区 {snapshot.svpwm.sector} · m={formatNumber(snapshot.svpwm.modulationIndex, 3)} · 饱和 {snapshot.svpwm.saturated ? '是' : '否'}</p>
          </Card>
          <Card title="逆变器桥臂" eyebrow="power stage" density="compact">
            <Inverter3D dutyA={snapshot.svpwm.dutyA} dutyB={snapshot.svpwm.dutyB} dutyC={snapshot.svpwm.dutyC} />
          </Card>
        </div>
        <VectorSpace3DCard
          alpha={snapshot.alphaBeta.alpha}
          beta={snapshot.alphaBeta.beta}
          d={snapshot.dq.d}
          q={snapshot.dq.q}
          theta={(park.thetaDeg * Math.PI) / 180}
          enabled={show3D}
          onToggle={() => setShow3D((v) => !v)}
        />
      </>
    );
  }
  // 'loop' 视图：把闭环响应右侧空间留给"调参提示"+"αβ/dq"
  return (
    <>
      <Card title="调参建议" eyebrow="tuning hints" density="compact">
        <ul className="space-y-2 text-body leading-relaxed text-ink-secondary">
          <li><span className="text-ink-primary">Kp 太低</span>：上升时间长，Iq 慢慢爬。</li>
          <li><span className="text-ink-primary">Kp 太高</span>：超调或振荡，电流环放大采样延迟。</li>
          <li><span className="text-ink-primary">Ki 太低</span>：稳态误差消除慢；Ki 太高则可能撞限幅形成积分饱和。</li>
          <li><span className="text-ink-primary">Δθ ≠ 0</span>：Iq 阶跃会拉到 Id 上形成串扰，电流相位偏离 q 轴。</li>
          <li><span className="text-ink-primary">ω 大</span>：dq 之间交叉耦合强（vd 含 -ωLq·iq），需要解耦前馈。</li>
          <li><span className="text-ink-primary">采样延迟多</span>：等效相位滞后，相同 Kp 更易振荡。</li>
        </ul>
      </Card>
      <Card title="αβ / dq 矢量（瞬态快照）" eyebrow="snapshot" density="compact">
        <VectorPlane
          alpha={snapshot.alphaBeta.alpha}
          beta={snapshot.alphaBeta.beta}
          d={snapshot.dq.d}
          q={snapshot.dq.q}
          theta={(park.thetaDeg * Math.PI) / 180}
          showDqAxes
          title="电流矢量与 dq 投影"
          max={10}
        />
      </Card>
      <VectorSpace3DCard
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
        d={snapshot.dq.d}
        q={snapshot.dq.q}
        theta={(park.thetaDeg * Math.PI) / 180}
        enabled={show3D}
        onToggle={() => setShow3D((v) => !v)}
      />
    </>
  );
}

export function FOCFlowModule() {
  const [manualStepIndex, setManualStepIndex] = useState<number | null>(null);
  const [view, setView] = useState<'pipeline' | 'loop'>('loop');
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <Tabs
            value={view}
            onChange={setView}
            options={[
              { value: 'loop', label: '电流环响应' },
              { value: 'pipeline', label: '数据流水线' },
            ]}
          />
          {view === 'loop' ? (
            <CurrentLoopView />
          ) : (
            <PipelineView manualStepIndex={manualStepIndex} setManualStepIndex={setManualStepIndex} />
          )}
        </div>
      }
      probe={<Probe manualStepIndex={manualStepIndex} view={view} />}
      concept={<ConceptNotes moduleId="foc-flow" />}
    />
  );
}
