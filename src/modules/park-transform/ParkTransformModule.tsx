import { SimulationEngine } from '../../simulation/engine/SimulationEngine';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { RotorFrame2D } from '../../components/charts/RotorFrame2D';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';

function Primary() {
  const park = useSimulationStore((s) => s.park);
  const snapshot = SimulationEngine.parkSnapshot(park);
  return (
    <div className="space-y-2">
      <div className="flex justify-end px-1">
        <FidelityBadge level="exact" hint="Park 是精确旋转矩阵变换 Id/Iq 来自数学公式" />
      </div>
      <RotorFrame2D
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
        thetaRad={snapshot.theta}
        id={snapshot.dq.d}
        iq={snapshot.dq.q}
      />
      <p className="px-1 text-caption leading-relaxed text-ink-secondary">
        转子带 N/S 极，d 轴沿 N 极方向（绿）、q 轴领先 90°（红）；蓝色箭头是 αβ 静止坐标里的电流矢量。
        Park 把它分别投影到 d 轴 → Id（绿色实线段）和 q 轴 → Iq（红色实线段）。
        当 θ 跟住转子时，两个分量都是直流量。
      </p>
    </div>
  );
}

function Probe() {
  const park = useSimulationStore((s) => s.park);
  const updatePark = useSimulationStore((s) => s.updatePark);
  const snapshot = SimulationEngine.parkSnapshot(park);
  return (
    <>
      <Card title="αβ → dq 数学投影" eyebrow="park projection" density="compact">
        <VectorPlane
          alpha={snapshot.alphaBeta.alpha}
          beta={snapshot.alphaBeta.beta}
          theta={snapshot.theta}
          d={snapshot.dq.d}
          q={snapshot.dq.q}
          showDqAxes
          title="拖白点改 αβ"
          max={8}
          onVectorChange={(iAlpha, iBeta) => updatePark({ iAlpha, iBeta })}
        />
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
          这边和左边是同一组数据的另一种画法：保留 αβ 网格不动，叠加旋转的 d/q 轴。
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Iα', snapshot.alphaBeta.alpha, '#34d6ff'],
          ['Iβ', snapshot.alphaBeta.beta, '#34d6ff'],
          ['Id 磁链', snapshot.dq.d, '#43f7b5'],
          ['Iq 转矩', snapshot.dq.q, '#ff5c7a'],
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

export function ParkTransformModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="park-transform" />} />;
}
