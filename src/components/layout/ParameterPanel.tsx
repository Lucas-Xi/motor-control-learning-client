import { RotateCcw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { experimentPresets } from '../../simulation/engine/presets';
import { parameterSchemas, type ParameterSchema, type SliderItem } from '../../content/parameterSchemas';
import { useSimulationStore } from '../../store/simulationStore';
import type { ModuleId } from '../../simulation/engine/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Slider } from '../ui/Slider';
import { Tabs } from '../ui/Tabs';
import { useI18n } from '../../i18n/useI18n';
import type { TKey } from '../../i18n/useI18n';

// 故障类型 → translations.ts 的 faults.* key 映射；走 useI18n 拿到当前语种字符串。
const FAULT_TYPES: ReadonlyArray<readonly [string, TKey]> = [
  ['over-current', 'faults.overCurrent'],
  ['phase-loss', 'faults.phaseLoss'],
  ['current-offset', 'faults.currentOffset'],
  ['phase-order', 'faults.phaseOrder'],
  ['encoder-angle', 'faults.encoderAngle'],
  ['speed-oscillation', 'faults.speedOscillation'],
  ['voltage-saturation', 'faults.voltageSaturation'],
  ['startup-fail', 'faults.startupFail'],
  ['liquid-slugging', 'faults.liquidSlugging'],
  ['locked-rotor', 'faults.lockedRotor'],
  ['dc-undervolt', 'faults.dcUndervolt'],
  ['over-temp', 'faults.overTemp'],
  ['vibration', 'faults.vibration'],
  ['oil-low', 'faults.oilLow'],
] as const;

/**
 * 渲染各模块特殊交互节点（按钮组、模式切换、极坐标联动等）。
 * 这些不属于通用滑块的部分单独走 customSlots key。
 */
function renderCustomSlot(slot: string): ReactNode {
  if (slot === 'clarke-mode') return <ClarkeModeToggle />;
  if (slot === 'pid-presets') return <PidPresets />;
  if (slot === 'svpwm-polar') return <SvpwmPolar />;
  if (slot === 'fault-types') return <FaultTypes />;
  if (slot === 'foc-presets') return <FocPresets />;
  if (slot === 'motor-presets') return <MotorPresets />;
  if (slot === 'refrigerant-picker') return <RefrigerantPicker />;
  if (slot === 'closed-loop-toggle') return <ClosedLoopToggle />;
  return null;
}

function RefrigerantPicker() {
  const refrigerant = useSimulationStore((s) => s.refrigeration.refrigerant);
  const update = useSimulationStore((s) => s.updateRefrigeration);
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-2 text-caption text-ink-muted">{t('parameters.refrigerantTitle')}</p>
      <div className="grid grid-cols-3 gap-2">
        {(['R32', 'R410A', 'R134a'] as const).map((r) => (
          <Button key={r} variant={refrigerant === r ? 'primary' : 'ghost'} onClick={() => update({ refrigerant: r })}>
            {r}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ClosedLoopToggle() {
  const closedLoop = useSimulationStore((s) => s.refrigeration.closedLoop);
  const update = useSimulationStore((s) => s.updateRefrigeration);
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <p className="mb-1 text-body font-medium text-ink-primary">{t('parameters.closedLoopTitle')}</p>
      <p className="mb-2 text-caption text-ink-muted">{t('parameters.closedLoopHint')}</p>
      <Button variant={closedLoop ? 'primary' : 'ghost'} onClick={() => update({ closedLoop: !closedLoop })}>
        {closedLoop ? t('parameters.closedLoopEnabled') : t('parameters.closedLoopEnable')}
      </Button>
    </div>
  );
}

function MotorPresets() {
  const update = useSimulationStore((s) => s.updateMotorBasics);
  const { t } = useI18n();
  return (
    <div>
      <p className="mb-2 text-caption text-ink-muted">{t('parameters.motorPresetsHint')}</p>
      <div className="grid grid-cols-3 gap-2">
        {/* 空调压缩机：~1-2kW、4 极对、IPM 凸极、典型工作 1500-7200 rpm */}
        <Button variant="ghost" onClick={() => update({
          polePairs: 4, ratedCurrent: 12, ratedSpeed: 7200,
          rs: 0.42, ldMh: 1.1, lqMh: 2.4, flux: 0.052,
          inertiaUm: 320, dampingUm: 120,
        })}>{t('parameters.motorPresetHvac')}</Button>
        {/* 冰箱压缩机：小功率、6 极对、低速运行 1500-3500 rpm，惯量小 */}
        <Button variant="ghost" onClick={() => update({
          polePairs: 6, ratedCurrent: 4, ratedSpeed: 3500,
          rs: 1.6, ldMh: 5.2, lqMh: 8.5, flux: 0.038,
          inertiaUm: 60, dampingUm: 30,
        })}>{t('parameters.motorPresetFridge')}</Button>
        {/* 工业制冷大功率压缩机：~10kW、4 极对、母线高、惯量大 */}
        <Button variant="ghost" onClick={() => update({
          polePairs: 4, ratedCurrent: 30, ratedSpeed: 6000,
          rs: 0.12, ldMh: 0.45, lqMh: 1.2, flux: 0.092,
          inertiaUm: 1200, dampingUm: 350,
        })}>{t('parameters.motorPresetIndustrial')}</Button>
      </div>
    </div>
  );
}

function FocPresets() {
  const update = useSimulationStore((s) => s.updateFoc);
  const { locale } = useI18n();
  // FOC 调参 preset 标签：通用术语，按 locale 切。不进 translations.ts（仅这一处用到）。
  const labels = locale === 'en-US'
    ? {
        slow: 'Slow (conservative)',
        typical: 'Compressor typical',
        overshoot: 'Aggressive / oscillation',
        thetaErr: 'Angle error',
        highSpeed: 'High speed 7200rpm',
        lowSpeed: 'Low speed heavy load',
      }
    : {
        slow: '慢响应（保守）',
        typical: '压缩机典型',
        overshoot: '过激振荡',
        thetaErr: '观测器角度误差',
        highSpeed: '高速 7200rpm',
        lowSpeed: '低速重载',
      };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="ghost" onClick={() => update({ iqRef: 8, kp: 0.5, ki: 50, thetaErrorDeg: 0, samplingDelaySamples: 1, electricalFreq: 100 })}>{labels.slow}</Button>
      <Button variant="ghost" onClick={() => update({ iqRef: 8, kp: 1.2, ki: 180, thetaErrorDeg: 0, samplingDelaySamples: 1, electricalFreq: 100 })}>{labels.typical}</Button>
      <Button variant="ghost" onClick={() => update({ iqRef: 8, kp: 3.5, ki: 900, thetaErrorDeg: 0, samplingDelaySamples: 2, electricalFreq: 100 })}>{labels.overshoot}</Button>
      <Button variant="ghost" onClick={() => update({ iqRef: 8, kp: 1.2, ki: 180, thetaErrorDeg: 15, samplingDelaySamples: 1, electricalFreq: 100 })}>{labels.thetaErr}</Button>
      <Button variant="ghost" onClick={() => update({ iqRef: 8, kp: 1.2, ki: 180, thetaErrorDeg: 0, samplingDelaySamples: 1, electricalFreq: 480 })}>{labels.highSpeed}</Button>
      <Button variant="ghost" onClick={() => update({ iqRef: 12, kp: 1.2, ki: 180, thetaErrorDeg: 0, samplingDelaySamples: 1, electricalFreq: 30 })}>{labels.lowSpeed}</Button>
    </div>
  );
}

function ClarkeModeToggle() {
  const balanced = useSimulationStore((s) => s.clarke.balanced);
  const update = useSimulationStore((s) => s.updateClarke);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant={balanced ? 'primary' : 'ghost'} onClick={() => update({ balanced: true })}>{t('parameters.chipBalanced')}</Button>
      <Button variant={!balanced ? 'primary' : 'ghost'} onClick={() => update({ balanced: false })}>{t('parameters.chipManualAbc')}</Button>
    </div>
  );
}

function PidPresets() {
  const update = useSimulationStore((s) => s.updatePid);
  const antiWindup = useSimulationStore((s) => s.pid.antiWindup);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant={antiWindup ? 'primary' : 'ghost'} onClick={() => update({ antiWindup: !antiWindup })}>
        {antiWindup ? t('parameters.chipAntiWindupOn') : t('parameters.chipAntiWindupOff')}
      </Button>
      <Button variant="ghost" onClick={() => update({ kp: 0.8, ki: 4, kd: 0, target: 1, limit: 18 })}>{t('parameters.chipSlowResponse')}</Button>
      <Button variant="ghost" onClick={() => update({ kp: 6.5, ki: 58, kd: 0.02, target: 1, limit: 24 })}>{t('parameters.chipOscillation')}</Button>
    </div>
  );
}

function SvpwmPolar() {
  const svpwm = useSimulationStore((s) => s.svpwm);
  const update = useSimulationStore((s) => s.updateSvpwm);
  const updateByPolar = (electricalDeg: number, modulation: number, uDc = svpwm.uDc) => {
    const angle = (electricalDeg * Math.PI) / 180;
    const magnitude = (modulation * uDc) / Math.sqrt(3);
    update({ electricalDeg, modulation, uDc, uAlpha: magnitude * Math.cos(angle), uBeta: magnitude * Math.sin(angle) });
  };
  return (
    <div className="space-y-3">
      <Slider label="母线 Udc" value={svpwm.uDc} min={60} max={600} step={5} unit=" V"
        onChange={(uDc) => updateByPolar(svpwm.electricalDeg, svpwm.modulation, uDc)} />
      <Slider label="电角度" value={svpwm.electricalDeg} min={0} max={360} step={1} unit="°"
        onChange={(deg) => updateByPolar(deg, svpwm.modulation)} />
      <Slider label="调制比" value={svpwm.modulation} min={0} max={1.15} step={0.01}
        hint="m=1 附近到达 SVPWM 线性区边界；继续增大表示过调制风险。"
        onChange={(m) => updateByPolar(svpwm.electricalDeg, m)} />
    </div>
  );
}

function FaultTypes() {
  const faultType = useSimulationStore((s) => s.fault.faultType);
  const update = useSimulationStore((s) => s.updateFault);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2">
      {FAULT_TYPES.map(([type, labelKey]) => (
        <Button
          key={type}
          variant={faultType === type ? 'primary' : 'ghost'}
          onClick={() => update({ faultType: type as typeof faultType })}
        >
          {t(labelKey)}
        </Button>
      ))}
    </div>
  );
}

/** 由 schema 数据生成参数卡 */
function SchemaCard({ schema, moduleId }: { schema: ParameterSchema; moduleId: ModuleId }) {
  const slice = useSimulationStore((s) => (s as unknown as Record<string, Record<string, number | boolean | string>>)[schema.sliceKey]);
  const update = useSimulationStore((s) => (s as unknown as Record<string, (patch: Record<string, unknown>) => void>)[schema.updateKey]);

  // Clarke 模块按 balanced 切换显示哪几个滑块
  const visibleSliders = useMemo(() => {
    if (moduleId === 'clarke-transform') {
      const balanced = (slice as { balanced: boolean }).balanced;
      return schema.sliders.filter((item) =>
        balanced ? ['amplitude', 'phaseDeg'].includes(item.key) : ['ia', 'ib', 'ic'].includes(item.key),
      );
    }
    return schema.sliders;
  }, [moduleId, schema.sliders, slice]);

  if (schema.sliders.length === 0 && !schema.customSlots) return null;

  return (
    <Card title={schema.title} eyebrow={schema.eyebrow} density="compact">
      <div className="space-y-3">
        {schema.customSlots?.map((slot) => <div key={slot}>{renderCustomSlot(slot)}</div>)}
        {visibleSliders.map((item: SliderItem) => (
          <Slider
            key={item.key}
            label={item.label}
            value={Number(slice[item.key] ?? 0)}
            min={item.min}
            max={item.max}
            step={item.step}
            unit={item.unit}
            hint={item.hint}
            onChange={(value) => update({ [item.key]: value })}
          />
        ))}
      </div>
    </Card>
  );
}

function PresetGrid({ moduleId }: { moduleId: ModuleId }) {
  const apply = useSimulationStore((s) => s.applyExperimentPreset);
  const { t } = useI18n();
  const items = useMemo(() => {
    const filtered = experimentPresets.filter((p) => p.moduleId === moduleId);
    return filtered.length ? filtered : experimentPresets.slice(0, 4);
  }, [moduleId]);
  return (
    <Card title={t('shell.presetCardTitle')} eyebrow={t('shell.presetCardEyebrow')} density="compact">
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => apply(item.id)}
            className="w-full rounded-lg border border-line-subtle bg-bg-base p-2.5 text-left transition-colors hover:border-accent-measure/40 hover:bg-accent-measure/[0.04]"
          >
            <p className="text-body font-medium text-ink-primary">{item.title}</p>
            <p className="mt-0.5 text-caption leading-relaxed text-ink-muted">{item.description}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function ParameterPanel() {
  const activeModule = useSimulationStore((s) => s.activeModule);
  const resetActiveParams = useSimulationStore((s) => s.resetActiveParams);
  const [tab, setTab] = useState<'params' | 'presets'>('params');
  const schema = parameterSchemas[activeModule];
  const { t, locale } = useI18n();

  return (
    <aside className="scrollbar-thin min-h-0 space-y-3 overflow-auto rounded-2xl border border-line-subtle bg-bg-surface p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('shell.paramPanelEyebrow')}</p>
          <h2 className="font-display text-title text-ink-primary">{t('shell.paramPanelTitle')}</h2>
        </div>
        <Button onClick={resetActiveParams}><RotateCcw className="h-4 w-4" />{t('shell.paramReset')}</Button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'params', label: t('shell.paramTabParams') },
          { value: 'presets', label: t('shell.paramTabPresets') },
        ]}
      />
      {/* schema.title / item.label / preset.title 仍来自 parameterSchemas（中文）。
          在 en-US locale 下加 "translation pending" 小字提示，避免被误以为是漏 i18n。 */}
      {locale === 'en-US' && (
        <p className="rounded-md border border-line-subtle/60 bg-bg-base px-2 py-1 text-[10px] text-ink-muted">
          {t('common.translationPending')}
        </p>
      )}
      {tab === 'params' && schema && <SchemaCard schema={schema} moduleId={activeModule} />}
      {tab === 'presets' && <PresetGrid moduleId={activeModule} />}
    </aside>
  );
}
