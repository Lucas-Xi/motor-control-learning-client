import { PWMChart } from '../../components/charts/PWMChart';
import { SpaceVectorHexagon } from '../../components/charts/SpaceVectorHexagon';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { calculateSvpwm, compareSpwmUtilization } from '../../simulation/math/svpwm';
import { useSimulationStore } from '../../store/simulationStore';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { formatNumber, formatPercent } from '../../utils/format';
import { SvpwmMinMaxCard } from './SvpwmMinMaxCard';

function TimingBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total <= 0 ? 0 : (value / total) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-caption">
        <span className="text-ink-secondary">{label}</span>
        <span className="formula text-ink-primary">{formatNumber(value * 1e6, 2)} μs</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line-subtle">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
    </div>
  );
}

function useResult() {
  const svpwm = useSimulationStore((s) => s.svpwm);
  return { svpwm, result: calculateSvpwm({ uAlpha: svpwm.uAlpha, uBeta: svpwm.uBeta, uDc: svpwm.uDc }) };
}

function Primary() {
  const { svpwm, result } = useResult();
  const updateSvpwm = useSimulationStore((s) => s.updateSvpwm);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <FidelityBadge level="exact" hint="扇区判断 + T1/T2/T0 时间分配 + 占空比都是精确算法" />
      </div>
      <SpaceVectorHexagon
        uAlpha={svpwm.uAlpha}
        uBeta={svpwm.uBeta}
        uDc={svpwm.uDc}
        result={result}
        onVectorChange={(uAlpha, uBeta) => {
          const electricalDeg = ((Math.atan2(uBeta, uAlpha) * 180) / Math.PI + 360) % 360;
          const modulation = (Math.sqrt(3) * Math.hypot(uAlpha, uBeta)) / Math.max(1, svpwm.uDc);
          updateSvpwm({ uAlpha, uBeta, electricalDeg, modulation });
        }}
      />
    </div>
  );
}

function Probe() {
  const { svpwm, result } = useResult();
  const compare = compareSpwmUtilization(result.vectorMagnitude, svpwm.uDc);
  const ts = result.t1 + result.t2 + result.t0;
  return (
    <>
      <Card title="T1 / T2 / T0 时间分配" eyebrow="switching period" density="compact">
        <div className="space-y-3">
          <TimingBar label="T1 第一矢量" value={result.t1} total={ts} color="var(--accent-primary)" />
          <TimingBar label="T2 第二矢量" value={result.t2} total={ts} color="var(--accent-measure)" />
          <TimingBar label="T0 零矢量" value={result.t0} total={ts} color="var(--accent-warn)" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">扇区 </span><span className="text-ink-primary">{result.sector}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">m </span><span className="text-ink-primary">{formatNumber(result.modulationIndex, 3)}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">SVPWM 利用率 </span><span className="text-ink-primary">{formatPercent(compare.svpwm)}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">SPWM </span><span className="text-ink-primary">{formatPercent(compare.spwm)}</span></div>
        </div>
      </Card>
      <Card title="三相 PWM 占空比" eyebrow="duty compare" density="compact">
        <PWMChart dutyA={result.dutyA} dutyB={result.dutyB} dutyC={result.dutyC} />
      </Card>
      {result.saturated && (
        <Card tone="fault" density="compact">
          <p className="text-body leading-relaxed text-accent-fault">
            目标电压矢量已超 SVPWM 线性区，真实电机会出现电流环输出撞限。可提高母线、降低目标转速，或注入负 Id 进入弱磁。
          </p>
        </Card>
      )}
      <SvpwmMinMaxCard />
    </>
  );
}

export function SVPWMModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="svpwm" />} />;
}
