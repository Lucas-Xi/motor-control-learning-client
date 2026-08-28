import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import {
  createComplianceState,
  maxSpeedLoopBandwidth,
  resonanceFrequencies,
  sampleComplianceParams,
  stepCompliance,
  type ComplianceParams,
} from '../../simulation/math/mechanicalCompliance';
import { formatNumber } from '../../utils/format';

type Preset = keyof typeof sampleComplianceParams;

/**
 * 机械刚性 + 共振 + Backlash 双质量传动卡：展示阶跃响应的相对运动振荡 + 共振/反共振频率
 * + 速度环 Kp 上限提示。学员把"皮带传动调高 Kp 就啸叫"的现象量化看清楚。
 */
export function MechanicalResonanceCard() {
  const { t } = useI18n();

  const [preset, setPreset] = useState<Preset>('industrialFanBelt');
  const [TemStep, setTemStep] = useState(0.5);
  const [Ds, setDs] = useState(sampleComplianceParams.industrialFanBelt.Ds);

  const params = useMemo<ComplianceParams>(
    () => ({ ...sampleComplianceParams[preset], Ds }),
    [preset, Ds],
  );

  // 阶跃响应：跑 30 ms，看 ω_motor − ω_load 的 AC 振荡
  const response = useMemo(() => {
    let st = createComplianceState();
    const out: Array<{ t_ms: number; dOmega: number; omegaMotor: number; omegaLoad: number }> = [];
    const dt = 1e-5;
    const N = 3000;
    for (let k = 0; k < N; k += 1) {
      st = stepCompliance({ Tem: TemStep, TloadExt: 0, dt, params, state: st });
      if (k % 3 === 0) {
        out.push({
          t_ms: Number((k * dt * 1000).toFixed(2)),
          dOmega: Number((st.omegaMotor - st.omegaLoad).toFixed(4)),
          omegaMotor: Number(st.omegaMotor.toFixed(3)),
          omegaLoad: Number(st.omegaLoad.toFixed(3)),
        });
      }
    }
    return out;
  }, [params, TemStep]);

  const freqs = useMemo(() => resonanceFrequencies(params), [params]);
  const kpMax = useMemo(() => maxSpeedLoopBandwidth(params), [params]);

  // 提取阶跃响应的峰值振幅作为"共振激发"指标
  const peakRipple = useMemo(() => {
    let max = 0;
    for (const p of response) if (Math.abs(p.dOmega) > max) max = Math.abs(p.dOmega);
    return max;
  }, [response]);

  // 阻尼比近似（用 D / D_critical）
  const dCrit = useMemo(() => 2 * Math.sqrt(params.Ks * (params.Jmotor * params.Jload) / (params.Jmotor + params.Jload)), [params]);
  const zeta = params.Ds / Math.max(1e-9, dCrit);

  const dampingTone = zeta < 0.1 ? 'fault' : zeta < 0.3 ? 'warn' : 'measure';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  const PRESETS: Array<{ id: Preset; labelKey: 'controlLoops.mechResPresetDirect' | 'controlLoops.mechResPresetBelt' | 'controlLoops.mechResPresetJoint' | 'controlLoops.mechResPresetAged' }> = [
    { id: 'directDriveCompressor', labelKey: 'controlLoops.mechResPresetDirect' },
    { id: 'industrialFanBelt', labelKey: 'controlLoops.mechResPresetBelt' },
    { id: 'roboticJoint', labelKey: 'controlLoops.mechResPresetJoint' },
    { id: 'agedDrive', labelKey: 'controlLoops.mechResPresetAged' },
  ];

  return (
    <Card
      title={t('controlLoops.mechResTitle')}
      eyebrow={t('controlLoops.mechResEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint={t('controlLoops.mechResFidelityHint')} />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">{t('controlLoops.mechResIntro')}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPreset(p.id);
              setDs(sampleComplianceParams[p.id].Ds);
            }}
            aria-pressed={preset === p.id}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              preset === p.id
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.mechResTemStep')}</span>
            <span className="formula text-ink-primary">{formatNumber(TemStep, 2)}</span>
          </span>
          <input type="range" value={TemStep} min={0.05} max={5} step={0.05}
            onChange={(e) => setTemStep(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="step torque"
            aria-valuemin={0.05} aria-valuemax={5} aria-valuenow={TemStep} aria-valuetext={`${TemStep} Nm`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.mechResDamping')}</span>
            <span className="formula text-ink-primary">{formatNumber(Ds, 3)}</span>
          </span>
          <input type="range" value={Ds} min={0.01} max={Math.max(5, dCrit)} step={0.01}
            onChange={(e) => setDs(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="damping"
            aria-valuemin={0.01} aria-valuemax={Math.max(5, dCrit)} aria-valuenow={Ds} aria-valuetext={`${Ds}`}
          />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">f_res</p>
          <p className="formula text-body text-accent-primary">{formatNumber(freqs.resonanceHz, 0)} Hz</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">f_antires</p>
          <p className="formula text-body text-accent-measure">{formatNumber(freqs.antiResonanceHz, 0)} Hz</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.mechResKpBw')}</p>
          <p className="formula text-body text-accent-warn">{formatNumber(kpMax, 0)} Hz</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(dampingTone)}`}>
          <p className="text-caption opacity-80">ζ damping</p>
          <p className="formula text-body">{formatNumber(zeta * 100, 1)} %</p>
        </div>
      </div>

      <div className="mb-3 h-44">
        <SafeResponsiveContainer>
          <LineChart data={response} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" rad/s" />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#5d7793" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="dOmega" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('controlLoops.mechResSeriesDOmega')} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="text-caption leading-relaxed text-ink-secondary">
        {t('controlLoops.mechResNoteA')} <span className="formula text-accent-primary">{formatNumber(freqs.resonanceHz, 0)} Hz</span>
        {t('controlLoops.mechResNoteB')} <span className="formula text-accent-warn">{formatNumber(kpMax, 0)} Hz</span>
        {t('controlLoops.mechResNoteC')} <span className="formula">{formatNumber(peakRipple, 2)} rad/s</span>
        {t('controlLoops.mechResNoteD')}
      </p>
    </Card>
  );
}
