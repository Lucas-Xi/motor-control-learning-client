import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, Stethoscope } from 'lucide-react';
import { useMemo } from 'react';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { faultCases } from '../../content/faultCases';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { createFaultWaveform, isStatusOnlyFault } from '../../simulation/math/faultWaveforms';
import { BiquadFilterCard } from './BiquadFilterCard';
import { SerialFaultInjectionCard } from './SerialFaultInjectionCard';

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon: 'warn' | 'ok' }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <p className="mb-2 flex items-center gap-1.5 text-body font-medium text-ink-primary">
        {icon === 'warn' ? <AlertTriangle className="h-4 w-4 text-accent-warn" /> : <CheckCircle2 className="h-4 w-4 text-accent-measure" />}
        {title}
      </p>
      <ul className="space-y-1 text-caption leading-relaxed text-ink-secondary">
        {items.map((item) => <li key={item}>· {item}</li>)}
      </ul>
    </div>
  );
}

function Primary() {
  const { t, locale } = useI18n();
  const showEn = locale === 'en-US';
  const fault = useSimulationStore((s) => s.fault);
  const selected = faultCases[fault.faultType];
  const title = showEn ? (selected.titleEn ?? selected.title) : selected.title;
  const data = useMemo(() => createFaultWaveform(fault.faultType, fault.severity), [fault.faultType, fault.severity]);
  if (isStatusOnlyFault(fault.faultType)) {
    return (
      <Card
        title={`${title}${t('faultsDebugging.titleColon')}${t('faultsDebugging.titleSuffixStatus')}`}
        eyebrow={t('faultsDebugging.statusOnlyEyebrow')}
        density="compact"
        tone="warn"
        action={<FidelityBadge level="illustrative" hint={t('faultsDebugging.statusOnlyFidelityHint')} />}
      >
        <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-accent-warn" />
          <p className="text-body leading-relaxed text-ink-secondary">
            {t('faultsDebugging.statusOnlyDescTopLead')}
            <span className="text-accent-warn">{t('faultsDebugging.statusOnlyDescChannels')}</span>
            {t('faultsDebugging.statusOnlyDescTopMid')}
            <br />
            {t('faultsDebugging.statusOnlyDescBottomLead')}
            <span className="text-accent-warn">{t('faultsDebugging.statusOnlyDescNoSignature')}</span>
          </p>
          <p className="text-caption text-ink-muted">
            {t('faultsDebugging.statusOnlyAdvice')}
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card
      title={`${title}${t('faultsDebugging.titleColon')}${t('faultsDebugging.titleSuffixWave')}`}
      eyebrow={t('faultsDebugging.waveformEyebrow')}
      density="compact"
      action={<FidelityBadge level="illustrative" hint={t('faultsDebugging.waveformFidelityHint')} />}
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="ia" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="Ia" isAnimationActive={false} />
            <Line type="monotone" dataKey="ib" dot={false} stroke="#43f7b5" strokeWidth={1.6} name="Ib" isAnimationActive={false} />
            <Line type="monotone" dataKey="ic" dot={false} stroke="#ffb84d" strokeWidth={1.6} name="Ic" isAnimationActive={false} />
            <Line type="monotone" dataKey="speed" dot={false} stroke="#ff5c7a" strokeWidth={1.2} name="speed" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { t, locale } = useI18n();
  const showEn = locale === 'en-US';
  const fault = useSimulationStore((s) => s.fault);
  const selected = faultCases[fault.faultType];
  const phenomenon = showEn ? (selected.phenomenonEn ?? selected.phenomenon) : selected.phenomenon;
  const stm32 = showEn ? (selected.stm32En ?? selected.stm32) : selected.stm32;
  const causes = showEn && selected.causesEn ? selected.causesEn : selected.causes;
  const steps = showEn && selected.stepsEn ? selected.stepsEn : selected.steps;
  const fix = showEn && selected.fixEn ? selected.fixEn : selected.fix;
  return (
    <>
      <Card title={t('faultsDebugging.phenomenonTitle')} eyebrow={t('faultsDebugging.phenomenonEyebrow')} density="compact" tone="fault">
        <div className="flex gap-2 text-body leading-relaxed text-accent-fault">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{phenomenon}</p>
        </div>
      </Card>
      <Card title={t('faultsDebugging.stm32MapTitle')} eyebrow={t('faultsDebugging.stm32MapEyebrow')} density="compact">
        <p className="text-body leading-relaxed text-ink-secondary">{stm32}</p>
      </Card>
      <ListBlock title={t('faultsDebugging.causesTitle')} items={causes} icon="warn" />
      <ListBlock title={t('faultsDebugging.stepsTitle')} items={steps} icon="ok" />
      <ListBlock title={t('faultsDebugging.fixTitle')} items={fix} icon="ok" />
      <BiquadFilterCard />
      <SerialFaultInjectionCard />
    </>
  );
}

export function FaultsDebuggingModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="faults-debugging" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="faults-debugging" />}
    />
  );
}
