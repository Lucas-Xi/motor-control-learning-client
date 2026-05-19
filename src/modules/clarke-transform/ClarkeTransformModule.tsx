import { SimulationEngine } from '../../simulation/engine/SimulationEngine';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { VectorPlane } from '../../components/charts/VectorPlane';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useI18n } from '../../i18n/useI18n';
import { SerialCompareClarkeCard } from './SerialCompareClarkeCard';

function Primary() {
  const clarke = useSimulationStore((s) => s.clarke);
  const updateClarke = useSimulationStore((s) => s.updateClarke);
  const snapshot = SimulationEngine.clarkeSnapshot(clarke);
  const { t } = useI18n();
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
      title={t('clarkeTransform.primaryTitle')}
      eyebrow={t('clarkeTransform.primaryEyebrow')}
      density="compact"
      action={<FidelityBadge level="exact" hint={t('clarkeTransform.fidelityHint')} />}
    >
      <VectorPlane
        alpha={snapshot.alphaBeta.alpha}
        beta={snapshot.alphaBeta.beta}
        title={t('clarkeTransform.vectorPlaneHint')}
        max={8}
        onVectorChange={handleVectorChange}
      />
    </Card>
  );
}

function Probe() {
  const clarke = useSimulationStore((s) => s.clarke);
  const snapshot = SimulationEngine.clarkeSnapshot(clarke);
  const { t } = useI18n();
  return (
    <>
      <Card title={t('clarkeTransform.abcTitle')} eyebrow={t('clarkeTransform.abcEyebrow')} density="compact">
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
      <Card title={t('clarkeTransform.matrixTitle')} eyebrow={t('clarkeTransform.matrixEyebrow')} density="compact">
        <pre className="formula whitespace-pre rounded-lg border border-line-subtle bg-bg-base p-3 text-caption leading-relaxed text-accent-primary">{`[ Iα ]   [ 1     0      0 ] [ Ia ]
[ Iβ ] = [ 1/√3 2/√3   0 ] [ Ib ]
[ I0 ]   [ 1/3  1/3  1/3 ] [ Ic ]`}</pre>
      </Card>
      <SerialCompareClarkeCard />
    </>
  );
}

export function ClarkeTransformModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="clarke-transform" />} />;
}
