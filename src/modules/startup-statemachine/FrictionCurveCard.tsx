import { useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, ReferenceArea, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import {
  compoundFriction,
  canOvercomeStatic,
  sampleFrictionParams,
  type FrictionParams,
} from '../../simulation/math/friction';
import { formatNumber } from '../../utils/format';

type PresetKey = keyof typeof sampleFrictionParams;

const PRESET_META: Record<PresetKey, { labelKey: TKey; tagKey: TKey; color: string }> = {
  hitachi15HP: {
    labelKey: 'startupStateMachine.frictionPresetHitachiLabel',
    tagKey: 'startupStateMachine.frictionPresetHitachiTag',
    color: '#34d6ff',
  },
  servo: {
    labelKey: 'startupStateMachine.frictionPresetServoLabel',
    tagKey: 'startupStateMachine.frictionPresetServoTag',
    color: '#43f7b5',
  },
  agedCompressor: {
    labelKey: 'startupStateMachine.frictionPresetAgedLabel',
    tagKey: 'startupStateMachine.frictionPresetAgedTag',
    color: '#fb7185',
  },
};

const OMEGA_MAX = 30;  // rad/s ≈ 286 rpm，覆盖启动早期最关键的低速段
const N_POINTS = 121;

/**
 * Stribeck + Coulomb + 黏性复合摩擦曲线对比卡。
 *
 * 把 friction.ts 的纯数学接到 UI：3 个预设并排画 T_friction(ω)，
 * 让学员直接看见低速 0-10 rad/s 区间的"摩擦谷"——
 * 这就是为什么压缩机启动那一瞬间需要克服 T_static 而不是 T_coulomb，
 * 也是"启动卡死再突然窜出"现象的物理根因。
 *
 * 拖动驱动力矩滑块时：
 *   - 当前选中预设的"能否克服静摩擦"用 canOvercomeStatic 实时判定
 *   - T_static 横线 + Coulomb 横线给出明确视觉参考
 */
export function FrictionCurveCard() {
  const { t } = useI18n();
  const [activePreset, setActivePreset] = useState<PresetKey>('hitachi15HP');
  const [Tdrive, setTdrive] = useState(0.20);  // N·m，初始略大于 hitachi 静摩擦

  const presets = Object.keys(sampleFrictionParams) as PresetKey[];

  // 采样曲线：x = ω (0..OMEGA_MAX)，每个预设一条
  const chartData = useMemo(() => {
    const arr: Array<Record<string, number>> = [];
    for (let i = 0; i < N_POINTS; i += 1) {
      const omega = (i / (N_POINTS - 1)) * OMEGA_MAX;
      const row: Record<string, number> = { omega };
      for (const k of presets) {
        row[k] = compoundFriction(omega, sampleFrictionParams[k]);
      }
      arr.push(row);
    }
    return arr;
    // presets 是常量字面量，仅初次构造一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active: FrictionParams = sampleFrictionParams[activePreset];
  const overcome = canOvercomeStatic(Tdrive, active);
  const driveVsStatic = Tdrive / active.Tstatic;

  return (
    <Card
      title={t('startupStateMachine.frictionTitle')}
      eyebrow="friction model · low-speed reality"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('startupStateMachine.frictionFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('startupStateMachine.frictionIntroLead')}
        <span className="formula">T = B·ω</span>
        {t('startupStateMachine.frictionIntroMid1')}
        <span className="text-accent-fault">{t('startupStateMachine.frictionStaticTerm')}</span>
        {t('startupStateMachine.frictionIntroMid2')}
        <span className="text-accent-warn"> Coulomb T_c</span>
        {t('startupStateMachine.frictionIntroMid3')}
        <span className="text-accent-primary">{t('startupStateMachine.frictionViscousTerm')}</span>
        {t('startupStateMachine.frictionIntroMid4')}
        <span className="formula">0 &lt; ω &lt; ω_stribeck ≈ 5-10 rad/s</span>
        {t('startupStateMachine.frictionIntroMid5')}
        <span className="text-accent-fault">{t('startupStateMachine.frictionValleyTerm')}</span>
        {t('startupStateMachine.frictionIntroTail')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-caption">
        <span className="text-ink-muted">{t('startupStateMachine.frictionHighlightLabel')}</span>
        {presets.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setActivePreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              activePreset === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {t(PRESET_META[k].labelKey)}
          </button>
        ))}
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 18, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="omega"
              type="number"
              domain={[0, OMEGA_MAX]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'ω (rad/s)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'T_friction (N·m)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 40 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `ω = ${Number(v).toFixed(1)} rad/s`}
              formatter={(v, n) => [`${Number(v).toFixed(3)} N·m`, t(PRESET_META[String(n) as PresetKey]?.labelKey ?? 'startupStateMachine.frictionHighlightLabel')]}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            {/* Stribeck 谷阴影：0 → ω_stribeck of active preset */}
            <ReferenceArea x1={0} x2={active.omegaStribeck} y1={0} y2={active.Tstatic} fill="#fb7185" fillOpacity={0.06} />
            {/* T_static / T_coulomb 参考横线 */}
            <ReferenceLine y={active.Tstatic} stroke="#fb7185" strokeDasharray="3 3"
              label={{ value: `T_static = ${active.Tstatic.toFixed(3)}`, fill: '#fb7185', fontSize: 9, position: 'insideTopRight' }} />
            <ReferenceLine y={active.Tcoulomb} stroke="#ffb84d" strokeDasharray="3 3"
              label={{ value: `T_c = ${active.Tcoulomb.toFixed(3)}`, fill: '#ffb84d', fontSize: 9, position: 'insideTopRight' }} />
            <ReferenceLine y={Tdrive} stroke="#7dd3fc" strokeWidth={1.5}
              label={{ value: t('startupStateMachine.frictionDriveLine').replace('{v}', Tdrive.toFixed(2)), fill: '#7dd3fc', fontSize: 9, position: 'insideBottomRight' }} />
            {presets.map((k) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={PRESET_META[k].color}
                strokeWidth={k === activePreset ? 2.4 : 1.2}
                strokeOpacity={k === activePreset ? 1 : 0.55}
                dot={false}
                isAnimationActive={false}
                name={t(PRESET_META[k].labelKey)}
              />
            ))}
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('startupStateMachine.frictionDriveTorque')}</span>
            <span className="formula text-ink-primary">{formatNumber(Tdrive, 3)} N·m</span>
          </span>
          <input
            type="range"
            value={Tdrive}
            min={0}
            max={0.5}
            step={0.005}
            onChange={(e) => setTdrive(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="motor drive torque"
            aria-valuemin={0}
            aria-valuemax={0.5}
            aria-valuenow={Tdrive}
            aria-valuetext={`${Tdrive.toFixed(3)} Nm`}
          />
        </label>
        <div className={`rounded-lg border p-2 ${
          overcome
            ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
            : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault'
        }`}>
          <div className="flex items-center gap-1.5 text-caption">
            {overcome
              ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>
              {overcome
                ? t('startupStateMachine.frictionOvercomeOk')
                : t('startupStateMachine.frictionOvercomeStuck')}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug opacity-90">
            {t('startupStateMachine.frictionRatioLead')}
            <span className="formula">{formatNumber(driveVsStatic, 2)}×</span>
            {t('startupStateMachine.frictionRatioTail')}
            {overcome
              ? ` ${t('startupStateMachine.frictionOvercomeNote')}`
              : ` ${t('startupStateMachine.frictionStuckNote')}`}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        {presets.map((k) => {
          const p = sampleFrictionParams[k];
          const isActive = k === activePreset;
          return (
            <div
              key={k}
              className={`rounded-lg border px-2 py-1.5 ${
                isActive
                  ? 'border-accent-primary/50 bg-accent-primary/[0.06]'
                  : 'border-line-subtle bg-bg-base'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRESET_META[k].color }} />
                <span className="text-ink-primary font-medium">{t(PRESET_META[k].labelKey)}</span>
              </div>
              <div className="text-ink-muted leading-relaxed">
                T_s = <span className="formula text-accent-fault">{p.Tstatic.toFixed(3)}</span> ·
                T_c = <span className="formula text-accent-warn">{p.Tcoulomb.toFixed(3)}</span> N·m
                <br />
                ω_s = <span className="formula text-ink-primary">{p.omegaStribeck.toFixed(0)}</span> rad/s ·
                B = <span className="formula text-ink-primary">{p.B.toExponential(1)}</span>
                <div className="mt-0.5 text-[10px] opacity-75">{t(PRESET_META[k].tagKey)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
