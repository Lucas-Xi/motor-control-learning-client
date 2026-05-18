import { SimulationEngine } from '../../simulation/engine/SimulationEngine';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { RotorFrame2D } from '../../components/charts/RotorFrame2D';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useI18n } from '../../i18n/useI18n';

function Primary() {
  const park = useSimulationStore((s) => s.park);
  const snapshot = SimulationEngine.parkSnapshot(park);
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex justify-end px-1">
        <FidelityBadge level="exact" hint={t('parkTransform.fidelityHint')} />
      </div>
      <RotorFrame2D
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
        thetaRad={snapshot.theta}
        id={snapshot.dq.d}
        iq={snapshot.dq.q}
      />
      <p className="px-1 text-caption leading-relaxed text-ink-secondary">{t('parkTransform.primaryNote')}</p>
    </div>
  );
}

function Probe() {
  const park = useSimulationStore((s) => s.park);
  const updatePark = useSimulationStore((s) => s.updatePark);
  const snapshot = SimulationEngine.parkSnapshot(park);
  const { t } = useI18n();
  return (
    <>
      <Card title={t('parkTransform.projectionTitle')} eyebrow={t('parkTransform.projectionEyebrow')} density="compact">
        <VectorPlane
          alpha={snapshot.alphaBeta.alpha}
          beta={snapshot.alphaBeta.beta}
          theta={snapshot.theta}
          d={snapshot.dq.d}
          q={snapshot.dq.q}
          showDqAxes
          title={t('parkTransform.vectorPlaneHint')}
          max={8}
          onVectorChange={(iAlpha, iBeta) => updatePark({ iAlpha, iBeta })}
        />
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{t('parkTransform.projectionNote')}</p>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Iα', snapshot.alphaBeta.alpha, '#34d6ff'],
          ['Iβ', snapshot.alphaBeta.beta, '#34d6ff'],
          [t('parkTransform.labelIdFlux'), snapshot.dq.d, '#43f7b5'],
          [t('parkTransform.labelIqTorque'), snapshot.dq.q, '#ff5c7a'],
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
