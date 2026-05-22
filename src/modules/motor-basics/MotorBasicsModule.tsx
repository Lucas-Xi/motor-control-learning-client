import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { Magnet, RotateCw, Settings } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { MotorAnatomy2D } from '../../components/charts/MotorAnatomy2D';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useSimulationStore } from '../../store/simulationStore';
import { electricalAngle } from '../../simulation/math/transforms';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { SaturationMapCard } from './SaturationMapCard';
import { CoggingTorqueCard } from './CoggingTorqueCard';

// 3D 视图独立 chunk（three.js 全家桶），首屏关键路径不受影响
const Motor3D = lazy(() => import('../../components/three/Motor3D').then((m) => ({ default: m.Motor3D })));

function AngleGauge({ label, valueDeg, color }: { label: string; valueDeg: number; color: string }) {
  const value = ((valueDeg % 360) + 360) % 360;
  return (
    <div className="rounded-xl border border-line-subtle bg-bg-base p-3">
      <p className="mb-1 text-caption text-ink-muted">{label}</p>
      <div className="h-32">
        <SafeResponsiveContainer>
          <RadialBarChart data={[{ value, fill: color }]} innerRadius="68%" outerRadius="98%" startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 360]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: '#1e2a3d' }} isAnimationActive={false} />
          </RadialBarChart>
        </SafeResponsiveContainer>
      </div>
      <p className="formula text-center text-xl font-bold" style={{ color }}>{formatNumber(value, 1)}°</p>
    </div>
  );
}

function ViewChip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-caption transition-colors ${
        active
          ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
          : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  );
}

function Primary() {
  const params = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  const { t } = useI18n();
  const [view, setView] = useState<'2d' | '3d'>('2d');
  return (
    <Card
      title={t('motorBasics.title')}
      eyebrow={t('motorBasics.eyebrow')}
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <div role="group" aria-label={t('motorBasics.viewSwitchAria')} className="flex items-center gap-1 rounded-full border border-line-subtle bg-bg-base p-0.5">
            <ViewChip active={view === '2d'} onClick={() => setView('2d')} label={t('motorBasics.view2D')}>{t('motorBasics.view2D')}</ViewChip>
            <ViewChip active={view === '3d'} onClick={() => setView('3d')} label={t('motorBasics.view3D')}>{t('motorBasics.view3D')}</ViewChip>
          </div>
          <FidelityBadge level="exact" hint="标准 12 槽 PMSM 结构示意；磁极数随极对数同步变化" />
        </div>
      }
    >
      {view === '2d' ? (
        <MotorAnatomy2D
          polePairs={params.polePairs}
          mechanicalDeg={params.mechanicalDeg}
          rpm={params.rpm}
        />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-[360px] items-center justify-center rounded-2xl border border-line-subtle bg-bg-base text-caption text-ink-muted">
              {t('motorBasics.rotorLoading')}
            </div>
          }
        >
          {/* 把机械角 + 转速 → 电角度传给 3D 视图；θ_e = (θm_live × p) */}
          <Motor3D
            thetaE={((((params.mechanicalDeg + (params.rpm / 60) * 360 * time) * Math.PI) / 180) * params.polePairs)}
            polePairs={params.polePairs}
            amplitude={params.ratedCurrent}
          />
        </Suspense>
      )}
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {view === '2d' ? t('motorBasics.note2D') : t('motorBasics.note3D')}
      </p>
    </Card>
  );
}

function Probe() {
  const params = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  const { t, locale } = useI18n();
  // 仪表盘跟随仿真时钟：暂停时静止；运行 / 单步把 time 推进，转子和数字一起前进。
  // 滑块的 mechanicalDeg 作为基准角，叠加 rpm × time 的旋转分量。
  const derived = useMemo(() => {
    const live = params.mechanicalDeg + (params.rpm / 60) * 360 * time;
    const mechanical = ((live % 360) + 360) % 360;
    const electrical = ((electricalAngle((mechanical * Math.PI) / 180, params.polePairs) * 180) / Math.PI % 360 + 360) % 360;
    return {
      mechanical,
      electrical,
      cycles: params.polePairs,
      freq: (params.rpm / 60) * params.polePairs,
      ratedTorque: 0.095 * params.ratedCurrent,
    };
  }, [params, time]);
  // 极对数描述行，按 locale 组织语法
  const polePairsLine = locale === 'en-US'
    ? `${params.polePairs} pole pairs: one mechanical revolution = ${derived.cycles} electrical revolutions, electrical frequency = ${formatNumber(derived.freq, 1)} Hz.`
    : `${params.polePairs} 极对：转子机械转 1 圈，电角度转 ${derived.cycles} 圈，电频率 ${formatNumber(derived.freq, 1)} Hz。`;
  return (
    <>
      <Card title={t('motorBasics.angleCardTitle')} eyebrow={t('motorBasics.angleCardEyebrow')} density="compact">
        <div className="grid grid-cols-2 gap-2">
          <AngleGauge label={t('motorBasics.angleMechanical')} valueDeg={derived.mechanical} color="#34d6ff" />
          <AngleGauge label={t('motorBasics.angleElectrical')} valueDeg={derived.electrical} color="#43f7b5" />
        </div>
        <p className="formula mt-3 rounded-lg border border-line-subtle bg-bg-base p-3 text-body text-accent-primary">θe = {derived.cycles} × θm</p>
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{polePairsLine}</p>
      </Card>
      <Card title={t('motorBasics.keyParamsTitle')} eyebrow={t('motorBasics.keyParamsEyebrow')} density="compact">
        <div className="space-y-2 text-body">
          <div className="flex items-start gap-2"><Magnet className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" /><span className="text-ink-secondary">{t('motorBasics.statorMagnet')}</span></div>
          <div className="flex items-start gap-2"><RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" /><span className="text-ink-secondary">{t('motorBasics.polePairLabel')}</span></div>
          <div className="flex items-start gap-2"><Settings className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" /><span className="text-ink-secondary">{t('motorBasics.ratedTorqueLabel')} = {formatNumber(derived.ratedTorque, 2)} Nm.</span></div>
        </div>
      </Card>
    </>
  );
}

export function MotorBasicsModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="motor-basics" />
          <Primary />
        </div>
      }
      probe={
        <>
          <Probe />
          {/* round-10 物理真实化：饱和电感 + 齿槽/BEMF 谐波 */}
          <SaturationMapCard />
          <CoggingTorqueCard />
        </>
      }
      concept={<ConceptNotes moduleId="motor-basics" />}
    />
  );
}
