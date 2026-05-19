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
import { useI18n } from '../../i18n/useI18n';
import { SerialCompareThreePhaseCard } from './SerialCompareThreePhaseCard';

function useSnapshot() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const time = useSimulationStore((s) => s.time);
  return useMemo(() => SimulationEngine.threePhaseSnapshot(threePhase, time), [threePhase, time]);
}

function Primary() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const snapshot = useSnapshot();
  const { t } = useI18n();
  return (
    <Card
      title={t('threePhase.primaryTitle')}
      eyebrow={t('threePhase.primaryEyebrow')}
      density="compact"
      action={<FidelityBadge level="exact" hint={t('threePhase.fidelityHint')} />}
    >
      <StatorField2D
        ia={snapshot.abc.ia}
        ib={snapshot.abc.ib}
        ic={snapshot.abc.ic}
        amplitude={threePhase.amplitude}
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
      />
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{t('threePhase.primaryNote')}</p>
    </Card>
  );
}

function Probe() {
  const threePhase = useSimulationStore((s) => s.threePhase);
  const updateThreePhase = useSimulationStore((s) => s.updateThreePhase);
  const time = useSimulationStore((s) => s.time);
  const snapshot = useSnapshot();
  const { t } = useI18n();
  const handleVectorChange = useCallback((alpha: number, beta: number) => {
    const amplitude = Math.min(12, Math.hypot(alpha, beta));
    const phaseDeg = (Math.atan2(beta, alpha) * 180) / Math.PI - threePhase.frequency * time * 360;
    updateThreePhase({ amplitude, phaseDeg: ((phaseDeg + 180) % 360) - 180 });
  }, [threePhase.frequency, time, updateThreePhase]);
  return (
    <>
      <Card title={t('threePhase.alphaBetaTitle')} eyebrow={t('threePhase.alphaBetaEyebrow')} density="compact">
        <VectorPlane alpha={snapshot.alphaBeta.alpha} beta={snapshot.alphaBeta.beta} title={t('threePhase.vectorPlaneHint')} onVectorChange={handleVectorChange} />
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{t('threePhase.alphaBetaNote')}</p>
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
      <SerialCompareThreePhaseCard />
    </>
  );
}

export function ThreePhaseModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="three-phase" />} />;
}
