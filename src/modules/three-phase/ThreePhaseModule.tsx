import { useCallback, useMemo } from 'react';
import { SimulationEngine } from '../../simulation/engine/SimulationEngine';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { StatorField2D } from '../../components/charts/StatorField2D';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';

function useSnapshot() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const time = useSimulationStore((s) => s.time);
  return useMemo(() => SimulationEngine.threePhaseSnapshot(threePhase, time), [threePhase, time]);
}

function Primary() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const snapshot = useSnapshot();
  return (
    <Card
      title="三相定子截面与合成磁场"
      eyebrow="stator cross-section"
      density="compact"
      action={<FidelityBadge level="exact" hint="三相 sin 生成 + Clarke 投影是精确数学，幅值/相位/谐波/不平衡都按公式注入" />}
    >
      <StatorField2D
        ia={snapshot.abc.ia}
        ib={snapshot.abc.ib}
        ic={snapshot.abc.ic}
        amplitude={threePhase.amplitude}
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
      />
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        A / B / C 三相绕组放在 120° 等分位置；圆点 ⊙ 表示电流流出纸面，⊗ 流入；亮度对应 |I|。中心绿色箭头是三相电流合成的旋转磁场矢量；尾巴的浅绿点是它走过的轨迹。
      </p>
    </Card>
  );
}

function Probe() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const updateThreePhase = useSimulationStore((s) => s.updateThreePhase);
  const time = useSimulationStore((s) => s.time);
  const snapshot = useSnapshot();
  const handleVectorChange = useCallback((alpha: number, beta: number) => {
    const amplitude = Math.min(12, Math.hypot(alpha, beta));
    const phaseDeg = (Math.atan2(beta, alpha) * 180) / Math.PI - threePhase.frequency * time * 360;
    updateThreePhase({ amplitude, phaseDeg: ((phaseDeg + 180) % 360) - 180 });
  }, [threePhase.frequency, time, updateThreePhase]);
  return (
    <>
      <Card title="αβ 静止坐标矢量" eyebrow="clarke output" density="compact">
        <VectorPlane alpha={snapshot.alphaBeta.alpha} beta={snapshot.alphaBeta.beta} title="拖白点直接改 αβ" onVectorChange={handleVectorChange} />
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
          Clarke 把 abc 三相投影成 (α, β)。运行时这个箭头与左侧定子箭头方向一致，但坐标系是静止的——观察它如何沿单位圆旋转。
        </p>
      </Card>
      <div className="grid grid-cols-4 gap-2">
        {[
          ['Ia', snapshot.abc.ia, '#34d6ff'],
          ['Ib', snapshot.abc.ib, '#43f7b5'],
          ['Ic', snapshot.abc.ic, '#ffb84d'],
          ['|Iαβ|', snapshot.magnitude, '#e7f3ff'],
        ].map(([name, value, color]) => (
          <div key={name as string} className="rounded-lg border border-line-subtle bg-bg-base p-2">
            <p className="text-caption text-ink-muted">{name}</p>
            <p className="formula font-medium" style={{ color: color as string }}>{formatNumber(value as number, 2)} A</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function ThreePhaseModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="three-phase" />} />;
}
