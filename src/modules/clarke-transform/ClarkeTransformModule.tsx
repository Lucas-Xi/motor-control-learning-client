import { SimulationEngine } from '../../simulation/engine/SimulationEngine';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';

function Primary() {
  const clarke = useSimulationStore((s) => s.clarke);
  const updateClarke = useSimulationStore((s) => s.updateClarke);
  const snapshot = SimulationEngine.clarkeSnapshot(clarke);
  const handleVectorChange = (alpha: number, beta: number) => {
    updateClarke({
      balanced: false,
      ia: alpha,
      ib: -0.5 * alpha + (Math.sqrt(3) / 2) * beta,
      ic: -0.5 * alpha - (Math.sqrt(3) / 2) * beta,
    });
  };
  return (
    <Card
      title="αβ 矢量平面"
      eyebrow="clarke output"
      density="compact"
      action={<FidelityBadge level="exact" hint="Clarke 是精确矩阵变换，输出与教科书一致" />}
    >
      <VectorPlane
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
        title="拖拽白点直接改变 αβ"
        max={8}
        onVectorChange={handleVectorChange}
      />
    </Card>
  );
}

function Probe() {
  const clarke = useSimulationStore((s) => s.clarke);
  const snapshot = SimulationEngine.clarkeSnapshot(clarke);
  return (
    <>
      <Card title="abc 三相输入" eyebrow="phase currents" density="compact">
        <div className="space-y-1.5">
          {[
            ['Ia', snapshot.abc.ia, '#34d6ff'],
            ['Ib', snapshot.abc.ib, '#43f7b5'],
            ['Ic', snapshot.abc.ic, '#ffb84d'],
            ['I0', snapshot.alphaBeta.zero ?? 0, '#ff5c7a'],
          ].map(([name, value, color]) => (
            <div key={name as string} className="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-base px-3 py-1.5">
              <span className="text-body" style={{ color: color as string }}>{name}</span>
              <span className="formula text-body text-ink-primary">{formatNumber(value as number, 3)} A</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="变换矩阵" eyebrow="abc → αβ0" density="compact">
        <pre className="formula whitespace-pre rounded-lg border border-line-subtle bg-bg-base p-3 text-caption leading-relaxed text-accent-primary">{`[ Iα ]   [ 1     0      0 ] [ Ia ]
[ Iβ ] = [ 1/√3 2/√3   0 ] [ Ib ]
[ I0 ]   [ 1/3  1/3  1/3 ] [ Ic ]`}</pre>
      </Card>
    </>
  );
}

export function ClarkeTransformModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="clarke-transform" />} />;
}
