import { PWMChart } from '../../components/charts/PWMChart';
import { SpaceVectorHexagon } from '../../components/charts/SpaceVectorHexagon';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { calculateSvpwm, compareSpwmUtilization } from '../../simulation/math/svpwm';
import { useSimulationStore } from '../../store/simulationStore';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { formatNumber, formatPercent } from '../../utils/format';
import { useI18n } from '../../i18n/useI18n';
import { SvpwmMinMaxCard } from './SvpwmMinMaxCard';
import { SerialCompareSvpwmCard } from './SerialCompareSvpwmCard';

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
  const { t } = useI18n();
  const updateSvpwm = useSimulationStore((s) => s.updateSvpwm);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <FidelityBadge level="exact" hint={t('svpwm.fidelityHint')} />
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
  const { t } = useI18n();
  const compare = compareSpwmUtilization(result.vectorMagnitude, svpwm.uDc);
  const ts = result.t1 + result.t2 + result.t0;
  return (
    <>
      <Card title={t('svpwm.timingTitle')} eyebrow={t('svpwm.timingEyebrow')} density="compact">
        <div className="space-y-3">
          <TimingBar label={t('svpwm.t1Label')} value={result.t1} total={ts} color="var(--accent-primary)" />
          <TimingBar label={t('svpwm.t2Label')} value={result.t2} total={ts} color="var(--accent-measure)" />
          <TimingBar label={t('svpwm.t0Label')} value={result.t0} total={ts} color="var(--accent-warn)" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('svpwm.sectorLabel')} </span><span className="text-ink-primary">{result.sector}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('svpwm.modulationLabel')} </span><span className="text-ink-primary">{formatNumber(result.modulationIndex, 3)}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('svpwm.svpwmUtilLabel')} </span><span className="text-ink-primary">{formatPercent(compare.svpwm)}</span></div>
          <div className="rounded border border-line-subtle bg-bg-base p-2"><span className="text-ink-muted">{t('svpwm.spwmLabel')} </span><span className="text-ink-primary">{formatPercent(compare.spwm)}</span></div>
        </div>
      </Card>
      <Card title={t('svpwm.dutyTitle')} eyebrow={t('svpwm.dutyEyebrow')} density="compact">
        <PWMChart dutyA={result.dutyA} dutyB={result.dutyB} dutyC={result.dutyC} />
      </Card>
      {result.saturated && (
        <Card tone="fault" density="compact">
          <p className="text-body leading-relaxed text-accent-fault">{t('svpwm.saturationWarn')}</p>
        </Card>
      )}
      <SvpwmMinMaxCard />
      <SerialCompareSvpwmCard />
    </>
  );
}

export function SVPWMModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="svpwm" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="svpwm" />}
    />
  );
}
