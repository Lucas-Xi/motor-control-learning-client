import { lazy, Suspense, useEffect, useMemo } from 'react';
import { AlertTriangle, Cpu, Snowflake, Thermometer, Wind, Zap } from 'lucide-react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { useSimulationStore } from '../../store/simulationStore';
import { PhDiagram } from '../../components/charts/PhDiagram';
import { SystemSchematic } from '../../components/charts/SystemSchematic';
import { simulateCycle, torqueToIq } from '../../simulation/math/vaporCycle';
import { hLiqSat, hVapSat, tSat } from '../../simulation/math/refrigerantProps';
import { formatNumber } from '../../utils/format';
import { useI18n } from '../../i18n/useI18n';
import type { TKey } from '../../i18n/useI18n';

/**
 * 16 号制冷台架的 4 张分析卡片（年度性能 / 化霜 / 部分负载 / 四象限）
 * 全部位于 probe 列下方，远离首屏 above-the-fold。各自带 recharts BarChart /
 * ComposedChart / Sparkline，体积 ~10-15KB raw 一张。
 * lazy() 之后只在浏览器空闲或用户向下滚动时才解析、不阻塞主视图首挂。
 */
const SeasonalCopCard = lazy(() =>
  import('./SeasonalCopCard').then((m) => ({ default: m.SeasonalCopCard })),
);
const DefrostCycleCard = lazy(() =>
  import('./DefrostCycleCard').then((m) => ({ default: m.DefrostCycleCard })),
);
const PartLoadEfficiencyCard = lazy(() =>
  import('./PartLoadEfficiencyCard').then((m) => ({ default: m.PartLoadEfficiencyCard })),
);
const FourQuadrantCard = lazy(() =>
  import('./FourQuadrantCard').then((m) => ({ default: m.FourQuadrantCard })),
);
const SerialCompareRefrigerationCard = lazy(() =>
  import('./SerialCompareRefrigerationCard').then((m) => ({ default: m.SerialCompareRefrigerationCard })),
);
const WagnerVsAntoineCard = lazy(() =>
  import('./WagnerVsAntoineCard').then((m) => ({ default: m.WagnerVsAntoineCard })),
);
const HeatExchangerSizingCard = lazy(() =>
  import('./HeatExchangerSizingCard').then((m) => ({ default: m.HeatExchangerSizingCard })),
);
const TwoStageCycleCard = lazy(() =>
  import('./TwoStageCycleCard').then((m) => ({ default: m.TwoStageCycleCard })),
);

function ProbeCardFallback({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-surface px-4 py-6 text-caption text-ink-muted">
      {label} · {/* loading */}
      <span className="opacity-70">…</span>
    </div>
  );
}

// 制冷剂气相比热（与 refrigerantProps 中的 cpVapor 保持一致）
const CP_V: Record<string, number> = { R32: 1.05, R410A: 0.97, R134a: 1.02 };
const CP_L: Record<string, number> = { R32: 2.28, R410A: 1.78, R134a: 1.50 };

function PhPanel() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const update = useSimulationStore((s) => s.updateRefrigeration);
  const { t } = useI18n();

  // 拖动 [1]：屏幕坐标 (h, P) → (Te 由 P 反推, SH 由 h 反推)
  // 拖动 [3]：(h, P) → (Tc 由 P 反推, SC 由 h 反推)
  const handleDrag = (idx: 1 | 3, h: number, P: number) => {
    const r = refrig.refrigerant;
    if (idx === 1) {
      const Te = Math.max(-30, Math.min(18, tSat(P, r)));
      const hVap = hVapSat(Te, r);
      const SH = Math.max(0, Math.min(15, (h - hVap) / CP_V[r]));
      update({ Te: Number(Te.toFixed(1)), superheatK: Number(SH.toFixed(1)) });
    } else {
      const Tc = Math.max(25, Math.min(65, tSat(P, r)));
      const hLiq = hLiqSat(Tc, r);
      const SC = Math.max(0, Math.min(12, (hLiq - h) / CP_L[r]));
      update({ Tc: Number(Tc.toFixed(1)), subcoolK: Number(SC.toFixed(1)) });
    }
  };

  const result = useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te,
    Tc: refrig.Tc,
    superheatK: refrig.superheatK,
    subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc,
    clearanceRatio: refrig.clearanceRatio,
    rpm: motor.rpm > 100 ? motor.rpm : 3000,
    isentropicEff: refrig.isentropicEff,
    eevOpening: refrig.eevOpening,
  }), [refrig, motor.rpm]);

  return (
    <Card
      title={t('refrigerationBench.phTitle')}
      eyebrow={t('refrigerationBench.phEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint="基于 Antoine + 多变压缩 + 容积效率的简化物性模型，趋势与真实制冷剂一致；精度 ±5% 左右，不替代 CoolProp/REFPROP" />}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingTop: `${(380 / 640) * 100}%` }}>
        <div className="absolute inset-0">
          <PhDiagram refrigerant={refrig.refrigerant} states={result.states} onPointDrag={handleDrag} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-caption text-ink-muted sm:grid-cols-4">
        {result.states.map((s) => (
          <div key={s.index} className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
            <div className="text-ink-primary">
              <span className="text-accent-fault">[{s.index}]</span> {s.label}
            </div>
            <div>P = <span className="text-accent-primary">{formatNumber(s.P, 3)}</span> MPa</div>
            <div>T = <span className="text-accent-primary">{formatNumber(s.T, 1)}</span> °C</div>
            <div>h = <span className="text-accent-primary">{formatNumber(s.h, 1)}</span> kJ/kg</div>
          </div>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <div className="mt-2 rounded-lg border border-accent-warn/40 bg-accent-warn/5 p-2 text-caption text-accent-warn">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {result.warnings.join(' · ')}
        </div>
      )}
    </Card>
  );
}

function SchematicPanel() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  const { t } = useI18n();

  const result = useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te, Tc: refrig.Tc,
    superheatK: refrig.superheatK, subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc, clearanceRatio: refrig.clearanceRatio,
    rpm: motor.rpm > 100 ? motor.rpm : 3000,
    isentropicEff: refrig.isentropicEff, eevOpening: refrig.eevOpening,
  }), [refrig, motor.rpm]);

  // 沿循环流动的相位（0..4）：每个 rps 走完一段
  const flowPhase = (time * (motor.rpm / 60) * 0.4) % 4;

  return (
    <Card title={t('refrigerationBench.schematicTitle')} eyebrow={t('refrigerationBench.schematicEyebrow')} density="compact">
      <div className="relative w-full overflow-hidden" style={{ paddingTop: `${(380 / 640) * 100}%` }}>
        <div className="absolute inset-0">
          <SystemSchematic
          states={result.states}
          rpm={motor.rpm}
          T_e={refrig.Te}
          T_c={refrig.Tc}
          T_outdoor={refrig.ambientOutdoorC}
          T_indoor={refrig.ambientIndoorC}
          eevOpening={refrig.eevOpening}
          flowPhase={flowPhase}
        />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-caption sm:grid-cols-4">
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted flex items-center gap-1"><Snowflake className="h-3 w-3" />{t('refrigerationBench.capacity')}</div>
          <div className="text-accent-measure font-medium">{formatNumber(result.Qc, 2)} kW</div>
        </div>
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted flex items-center gap-1"><Zap className="h-3 w-3" />{t('refrigerationBench.inputPower')}</div>
          <div className="text-accent-warn font-medium">{formatNumber(result.Wcomp, 2)} kW</div>
        </div>
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted flex items-center gap-1"><Thermometer className="h-3 w-3" />{t('refrigerationBench.cop')}</div>
          <div className={`font-medium ${result.cop > 3 ? 'text-accent-measure' : result.cop > 2 ? 'text-accent-warn' : 'text-accent-fault'}`}>
            {formatNumber(result.cop, 2)}
          </div>
        </div>
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
          <div className="text-ink-muted flex items-center gap-1"><Wind className="h-3 w-3" />{t('refrigerationBench.massFlow')}</div>
          <div className="text-accent-primary font-medium">{(result.massFlow * 1000).toFixed(1)} g/s</div>
        </div>
      </div>
    </Card>
  );
}

function MetricsProbe() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const updateFoc = useSimulationStore((s) => s.updateFoc);
  const focIqRef = useSimulationStore((s) => s.foc.iqRef);
  const { t } = useI18n();

  const result = useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te, Tc: refrig.Tc,
    superheatK: refrig.superheatK, subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc, clearanceRatio: refrig.clearanceRatio,
    rpm: motor.rpm > 100 ? motor.rpm : 3000,
    isentropicEff: refrig.isentropicEff, eevOpening: refrig.eevOpening,
  }), [refrig, motor.rpm]);

  const requiredIq = useMemo(() => torqueToIq(result.torqueLoad, motor.polePairs, motor.flux), [result.torqueLoad, motor.polePairs, motor.flux]);

  // 闭环耦合：把循环算出的所需 Iq 写回 FOC 模块的 iqRef
  useEffect(() => {
    if (refrig.closedLoop) {
      const target = Math.max(-25, Math.min(25, requiredIq));
      if (Math.abs(target - focIqRef) > 0.05) {
        updateFoc({ iqRef: target });
      }
    }
  }, [refrig.closedLoop, requiredIq, focIqRef, updateFoc]);

  return (
    <>
      <Card title={t('refrigerationBench.metricsTitle')} eyebrow={t('refrigerationBench.metricsEyebrow')} density="compact" tone={result.cop < 2 ? 'warn' : 'default'}>
        <div className="space-y-1 text-body">
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.suctionPressure')}</span>
            <span className="font-mono text-accent-primary">{formatNumber(result.states[0].P, 3)} MPa</span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.dischargePressure')}</span>
            <span className="font-mono text-accent-warn">{formatNumber(result.states[1].P, 3)} MPa</span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.pressureRatio')}</span>
            <span className={`font-mono ${result.pressureRatio > 4 ? 'text-accent-fault' : 'text-accent-measure'}`}>
              {formatNumber(result.pressureRatio, 2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.dischargeTemp')}</span>
            <span className={`font-mono ${result.Tdischarge > 110 ? 'text-accent-fault' : 'text-accent-warn'}`}>
              {formatNumber(result.Tdischarge, 1)} °C
            </span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.volEff')}</span>
            <span className={`font-mono ${result.volumetricEff < 0.6 ? 'text-accent-warn' : 'text-accent-measure'}`}>
              {(result.volumetricEff * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.specWork')}</span>
            <span className="font-mono text-accent-primary">{formatNumber(result.workSpec, 1)} kJ/kg</span>
          </div>
        </div>
      </Card>

      <Card title={t('refrigerationBench.motorCouplingTitle')} eyebrow={t('refrigerationBench.motorCouplingEyebrow')} density="compact" tone={refrig.closedLoop ? 'measure' : 'default'}>
        <div className="space-y-1 text-body">
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.loadTorque')}</span>
            <span className="font-mono text-accent-warn">{formatNumber(result.torqueLoad, 3)} N·m</span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.requiredIq')}</span>
            <span className={`font-mono ${Math.abs(requiredIq) > motor.ratedCurrent ? 'text-accent-fault' : 'text-accent-measure'}`}>
              {formatNumber(requiredIq, 2)} A
            </span>
          </div>
          <div className="flex items-center justify-between text-caption text-ink-muted">
            <span>{t('refrigerationBench.percentOfRated')}</span>
            <span className="font-mono text-accent-primary">{((Math.abs(requiredIq) / motor.ratedCurrent) * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-2 text-caption text-ink-secondary">
          <Cpu className="mr-1 inline h-3.5 w-3.5 text-accent-primary" />
          {refrig.closedLoop
            ? t('refrigerationBench.closedLoopOn')
            : `${t('refrigerationBench.closedLoopOffPrefix')}${formatNumber(focIqRef, 1)}${t('refrigerationBench.closedLoopOffInfix')}${formatNumber(requiredIq, 1)}${t('refrigerationBench.closedLoopOffSuffix')}`}
        </div>
      </Card>
    </>
  );
}

export function RefrigerationBenchModule() {
  const { t } = useI18n();
  return (
    <ModuleLayout
      primary={<><PhPanel /><SchematicPanel /></>}
      probe={<>
        <MetricsProbe />
        <ScenarioPresets />
        <Suspense fallback={<ProbeCardFallback label={t('refrigerationBench.seasonalCop')} />}>
          <SeasonalCopCard />
        </Suspense>
        <Suspense fallback={<ProbeCardFallback label={t('refrigerationBench.defrost')} />}>
          <DefrostCycleCard />
        </Suspense>
        <Suspense fallback={<ProbeCardFallback label={t('refrigerationBench.partLoad')} />}>
          <PartLoadEfficiencyCard />
        </Suspense>
        <Suspense fallback={<ProbeCardFallback label={t('refrigerationBench.quadrant')} />}>
          <FourQuadrantCard />
        </Suspense>
        <Suspense fallback={<ProbeCardFallback label="实测对照" />}>
          <SerialCompareRefrigerationCard />
        </Suspense>
        {/* round-11 物理真实化：Wagner vs Antoine + 容积效率 3D */}
        <Suspense fallback={<ProbeCardFallback label="Wagner / η_v" />}>
          <WagnerVsAntoineCard />
        </Suspense>
        {/* round-13 物理真实化：ε-NTU 换热器选型 */}
        <Suspense fallback={<ProbeCardFallback label="ε-NTU HX" />}>
          <HeatExchangerSizingCard />
        </Suspense>
        {/* round-15 接入 UI：单级 vs 两级压缩 + 闪发分离 */}
        <Suspense fallback={<ProbeCardFallback label="两级压缩" />}>
          <TwoStageCycleCard />
        </Suspense>
      </>}
      concept={<ConceptNotes moduleId="refrigeration-bench" />}
    />
  );
}

interface Scenario {
  labelKey: TKey;
  hint: string;
  patch: Partial<Parameters<ReturnType<typeof useSimulationStore.getState>['updateRefrigeration']>[0]>;
}

const SCENARIOS: Scenario[] = [
  { labelKey: 'refrigerationBench.sceneSummerTypical', hint: '室外 35℃ / 室内 27℃，T_c=45 T_e=7，COP 5+', patch: { refrigerant: 'R32', Te: 7, Tc: 45, superheatK: 5, subcoolK: 3, ambientOutdoorC: 35, ambientIndoorC: 27, eevOpening: 0.55 } },
  { labelKey: 'refrigerationBench.sceneSummerHot', hint: '室外 42℃ 下 T_c 抬到 55℃，压比飙升、排气接近红线', patch: { refrigerant: 'R32', Te: 5, Tc: 55, superheatK: 8, subcoolK: 2, ambientOutdoorC: 42, ambientIndoorC: 27, eevOpening: 0.7 } },
  { labelKey: 'refrigerationBench.sceneExtreme', hint: '室外 48℃ + 大温差，逼近压缩机包线', patch: { refrigerant: 'R410A', Te: 3, Tc: 60, superheatK: 10, subcoolK: 1, ambientOutdoorC: 48, ambientIndoorC: 30, eevOpening: 0.85 } },
  { labelKey: 'refrigerationBench.sceneDehumidify', hint: '小温差低负载，T_e=10 T_c=38，EEV 关小', patch: { refrigerant: 'R32', Te: 10, Tc: 38, superheatK: 4, subcoolK: 4, ambientOutdoorC: 28, ambientIndoorC: 26, eevOpening: 0.4 } },
  { labelKey: 'refrigerationBench.sceneCommFrozen', hint: 'R-134a 冷冻应用 T_e=-25℃，单位功巨大', patch: { refrigerant: 'R134a', Te: -25, Tc: 40, superheatK: 6, subcoolK: 3, ambientOutdoorC: 25, ambientIndoorC: -18, eevOpening: 0.4, displacementCc: 12 } },
  { labelKey: 'refrigerationBench.sceneSlug', hint: '过热度=0、EEV 过开 → 实际系统会触发液击保护', patch: { superheatK: 0, eevOpening: 0.95 } },
];

function ScenarioPresets() {
  const update = useSimulationStore((s) => s.updateRefrigeration);
  const { t } = useI18n();
  return (
    <Card title={t('refrigerationBench.scenariosTitle')} eyebrow={t('refrigerationBench.scenariosEyebrow')} density="compact">
      <p className="mb-3 text-caption text-ink-muted">{t('refrigerationBench.scenariosHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {SCENARIOS.map((s) => (
          <Button
            key={s.labelKey}
            variant="ghost"
            onClick={() => update(s.patch)}
            title={s.hint}
            className="!py-2 text-left"
          >
            <div className="flex flex-col items-start leading-tight">
              <span className="text-body font-medium">{t(s.labelKey)}</span>
              <span className="text-caption text-ink-muted truncate w-full">{s.hint}</span>
            </div>
          </Button>
        ))}
      </div>
    </Card>
  );
}
