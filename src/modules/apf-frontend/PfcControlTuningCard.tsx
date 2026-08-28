import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulatePfcCycle } from '../../simulation/math/boostPfc';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { usePersistentState } from '../../utils/usePersistentState';

/**
 * 双环整定卡：
 *   - 滑块直接改 Kpv/Kiv/Kpi/Kii（写回 store.apf，主图同步刷新）
 *   - 触发一次"负载从 50% 阶跃到 100%"，画 Udc(t)，标注跌落与恢复时间
 *
 * 提示：
 *   - 电流环带宽 ≈ Kpi · ω_unit ≈ 1/(2π) · Kpi/L（粗估，需结合 PWM 频率上限）
 *   - 电压环带宽 << 100 Hz（二次纹波频率），否则环路把纹波当扰动放大
 */

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, unit = '', hint, onChange }: SliderRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-body text-ink-secondary">{label}</span>
        <span className="formula text-ink-primary">
          {formatNumber(value, step < 1 ? 3 : 1)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="simulation-slider w-full"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatNumber(value, step < 1 ? 3 : 1)}${unit}`}
      />
      {hint && <p className="mt-1 text-caption leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

export function PfcControlTuningCard() {
  const { t } = useI18n();
  const apf = useSimulationStore((s) => s.apf);
  const updateApf = useSimulationStore((s) => s.updateApf);
  const [showStep, setShowStep] = usePersistentState('apf.showStep', true);

  // 跑一次"带阶跃"的仿真专门给本卡看
  const stepResp = useMemo(
    () =>
      simulatePfcCycle({
        Vac_rms: apf.vAcRms,
        Vdc_ref: apf.udcRef,
        L_mH: apf.boostInductanceMh,
        C_uF: apf.boostCapacitanceUf,
        load_W: Math.max(50, apf.udcRef * apf.loadCurrent),
        Kpv: apf.voltageKp,
        Kiv: apf.voltageKi,
        Kpi: apf.currentKp,
        Kii: apf.currentKi,
        load_step: true,
        total_sec: 0.12,
      }),
    [apf],
  );

  const data = useMemo(
    () => stepResp.t_ms.map((t, i) => ({ t, Udc: stepResp.Udc[i] })),
    [stepResp],
  );

  // 估算跌落：阶跃后最低值距 Udc_ref 的偏差
  const drop = useMemo(() => {
    const half = Math.floor(stepResp.t_ms.length / 2);
    let minU = stepResp.Udc[half] ?? apf.udcRef;
    for (let i = half; i < stepResp.Udc.length; i += 1) if (stepResp.Udc[i] < minU) minU = stepResp.Udc[i];
    return apf.udcRef - minU;
  }, [stepResp, apf.udcRef]);

  // 工程经验值的状态指示
  const settlingTone = stepResp.settling_ms === 0
    ? 'warn'
    : stepResp.settling_ms < 40
    ? 'measure'
    : stepResp.settling_ms < 80
    ? 'warn'
    : 'fault';
  const dropTone = drop < apf.udcRef * 0.05 ? 'measure' : drop < apf.udcRef * 0.1 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('apfFrontend.tuningCardTitle')}
      eyebrow="loop tuning"
      density="compact"
      action={
        <div className="flex items-center gap-2 text-caption">
          <span className={`rounded-md border px-2 py-0.5 font-medium ${toneClass(dropTone)}`}>
            <span className="sr-only">{t('apfFrontend.tuningDropSr')}</span>ΔUdc {formatNumber(drop, 1)} V
          </span>
          <span className={`rounded-md border px-2 py-0.5 font-medium ${toneClass(settlingTone)}`}>
            {t('apfFrontend.tuningRecoveryLabel')}
            {stepResp.settling_ms > 0 ? `${formatNumber(stepResp.settling_ms, 0)} ms` : t('apfFrontend.tuningNotSettled')}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-caption uppercase tracking-[0.18em] text-accent-primary">{t('apfFrontend.tuningInnerLoop')}</p>
          <SliderRow
            label={t('apfFrontend.tuningKpiLabel')}
            value={apf.currentKp}
            min={0}
            max={0.4}
            step={0.005}
            hint={t('apfFrontend.tuningKpiHint')}
            onChange={(v) => updateApf({ currentKp: v })}
          />
          <SliderRow
            label={t('apfFrontend.tuningKiiLabel')}
            value={apf.currentKi}
            min={0}
            max={600}
            step={5}
            hint={t('apfFrontend.tuningKiiHint')}
            onChange={(v) => updateApf({ currentKi: v })}
          />
        </div>
        <div className="space-y-3">
          <p className="text-caption uppercase tracking-[0.18em] text-accent-measure">{t('apfFrontend.tuningOuterLoop')}</p>
          <SliderRow
            label={t('apfFrontend.tuningKpvLabel')}
            value={apf.voltageKp}
            min={0}
            max={3}
            step={0.05}
            hint={t('apfFrontend.tuningKpvHint')}
            onChange={(v) => updateApf({ voltageKp: v })}
          />
          <SliderRow
            label={t('apfFrontend.tuningKivLabel')}
            value={apf.voltageKi}
            min={0}
            max={40}
            step={0.5}
            hint={t('apfFrontend.tuningKivHint')}
            onChange={(v) => updateApf({ voltageKi: v })}
          />
        </div>
      </div>

      {showStep && (
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-caption text-ink-muted">{t('apfFrontend.tuningStepLabel')}</span>
            <button
              type="button"
              onClick={() => setShowStep(false)}
              className="text-caption text-ink-muted hover:text-ink-primary"
            >
              {t('apfFrontend.tuningCollapseStep')}
            </button>
          </div>
          <div className="h-40">
            <SafeResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
                <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
                <YAxis
                  tick={{ fill: '#9eb5cb', fontSize: 11 }}
                  domain={[apf.udcRef - 60, apf.udcRef + 20]}
                />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <ReferenceLine y={apf.udcRef} stroke="#9eb5cb" strokeDasharray="4 4" label={{ value: 'Udc_ref', fill: '#9eb5cb', fontSize: 10 }} />
            <ReferenceLine x={60} stroke="#ffb84d" strokeDasharray="2 4" label={{ value: t('apfFrontend.tuningStepMarker'), fill: '#ffb84d', fontSize: 10 }} />
            <Line type="monotone" dataKey="Udc" dot={false} stroke="#43f7b5" strokeWidth={1.8} isAnimationActive={false} name="Udc V" />
          </LineChart>
        </SafeResponsiveContainer>
          </div>
        </div>
      )}
      {!showStep && (
        <button
          type="button"
          onClick={() => setShowStep(true)}
          className="mt-3 w-full rounded border border-line-subtle bg-bg-base py-1.5 text-caption text-ink-secondary hover:text-ink-primary"
        >
          {t('apfFrontend.tuningExpandStep')}
        </button>
      )}

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {t('apfFrontend.tuningRulePrefix')}<span className="text-accent-primary">Kpi ≈ 2π·L·f_BW</span>
        {t('apfFrontend.tuningRuleKpiNote')}<span className="text-accent-measure">{t('apfFrontend.tuningRuleKpvSpan')}</span>
        {t('apfFrontend.tuningRuleSuffix')}
      </p>
    </Card>
  );
}
