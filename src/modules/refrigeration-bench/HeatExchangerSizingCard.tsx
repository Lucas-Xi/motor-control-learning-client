import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchHxStore } from '../../store/benchHxStore';
import { useI18n } from '../../i18n/useI18n';
import {
  heatExchangerExchange,
  inverseSaturationTemp,
  sampleHeatExchangers,
} from '../../simulation/math/heatExchanger';
import { formatNumber } from '../../utils/format';

type HxKind = 'condenser' | 'evaporator';

/**
 * 换热器选型 ε-NTU 卡片：让学员调 UA + 风量看 Tc/Te 实际偏离设计值多少，
 * 解释"夏季高温 Tc 飙 / 冬季化霜"现象。
 */
export function HeatExchangerSizingCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [kind, setKind] = useState<HxKind>('condenser');
  // 默认参数走 1.5HP 家用空调样本
  const sample = kind === 'condenser' ? sampleHeatExchangers.homeCond15HP : sampleHeatExchangers.homeEvap15HP;
  const [uaKWperK, setUa] = useState(sample.uaKWperK);
  const [airFlow, setAirFlow] = useState(sample.airFlowM3perS);
  const [qRequired, setQRequired] = useState(kind === 'condenser' ? 4 : 3);
  // 接入主台架：开关 + 自动写到 store
  const hxStore = useBenchHxStore();
  const hxEnabled = hxStore.enabled;

  const TairIn = kind === 'condenser' ? (refrig.ambientOutdoorC ?? 35) : (refrig.ambientIndoorC ?? 27);
  const Tref = kind === 'condenser' ? (refrig.Tc ?? 45) : (refrig.Te ?? 7);

  const params = useMemo(
    () => ({ kind, uaKWperK, airFlowM3perS: airFlow }),
    [kind, uaKWperK, airFlow],
  );

  // 当前工况实际换热量
  const current = useMemo(
    () => heatExchangerExchange({ TrefC: Tref, TairInC: TairIn, params }),
    [Tref, TairIn, params],
  );

  // 反求：为了散/吸 q_required 需要的 Tref 实际值
  const inverse = useMemo(
    () => inverseSaturationTemp(qRequired, TairIn, params),
    [qRequired, TairIn, params],
  );

  // 扫描风量 0.1..1.5 m³/s，看 q 和 ε 变化
  const sweep = useMemo(() => {
    const N = 24;
    const fMin = 0.05;
    const fMax = kind === 'condenser' ? 1.5 : 0.8;
    return Array.from({ length: N + 1 }, (_, k) => {
      const f = fMin + ((fMax - fMin) * k) / N;
      const r = heatExchangerExchange({
        TrefC: Tref,
        TairInC: TairIn,
        params: { kind, uaKWperK, airFlowM3perS: f },
      });
      return {
        flow_m3s: Number(f.toFixed(3)),
        q_kW: Number(r.qActualKW.toFixed(3)),
        eps_pct: Number((r.epsilon * 100).toFixed(1)),
      };
    });
  }, [kind, Tref, TairIn, uaKWperK]);

  // 偏离百分比（实际 Tref 与"理想假设"的偏差）
  const drift = inverse.feasible ? Math.abs(inverse.TrefC - Tref) : 99;
  const driftTone = drift < 3 ? 'measure' : drift < 8 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'ε-NTU Heat Exchanger Sizing' : '换热器 ε-NTU 选型校核'}
      eyebrow={isEn ? 'why Tc actually drifts' : 'Tc/Te 为啥总跑'}
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={hxEnabled}
            onClick={() => {
              hxStore.setEnabled(!hxEnabled);
              // 开启时把当前卡片本地参数同步给主台架
              if (!hxEnabled) {
                if (kind === 'condenser') {
                  hxStore.setUaCond(uaKWperK);
                  hxStore.setAirFlowCond(airFlow);
                } else {
                  hxStore.setUaEvap(uaKWperK);
                  hxStore.setAirFlowEvap(airFlow);
                }
              }
            }}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              hxEnabled
                ? 'border-accent-measure/60 bg-accent-measure/10 text-accent-measure'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {hxEnabled ? (isEn ? 'Applied to bench' : '已应用到主台架') : (isEn ? 'Apply to bench' : '应用到主台架')}
          </button>
          <FidelityBadge
            level="physical"
            hint={
              isEn
                ? 'Effectiveness-NTU method for fin-and-tube HX; ε = 1 − exp(−NTU) for phase-change side. Forces Tc/Te to honor real area + airflow.'
                : '翅片管 ε-NTU 方法；相变侧 ε = 1 − exp(−NTU)。让 Tc/Te 真正受换热面积 + 风量约束。'
            }
          />
        </div>
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'vaporCycle assumes the heat exchanger can hit any Tc/Te. Reality: limited UA × airflow caps the heat throughput. Drag UA, airflow, and required Q to see how the design point drifts under summer/winter conditions. Click "Apply to bench" to make the main KPIs honor these constraints.'
          : 'vaporCycle 默认换热器能"任意"达到 Tc/Te。真实：UA × 风量限定了热量传输。拖 UA / 风量 / 所需 Q，看夏季高温 / 冬季工况下设计点怎么漂。点"应用到主台架"让主 KPI 端到端尊重换热器约束。'}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['condenser', 'evaporator'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setKind(t)}
            aria-pressed={kind === t}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              kind === t
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {t === 'condenser' ? (isEn ? 'Condenser' : '冷凝器') : (isEn ? 'Evaporator' : '蒸发器')}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>UA (kW/K)</span>
            <span className="formula text-ink-primary">{formatNumber(uaKWperK, 2)}</span>
          </span>
          <input type="range" value={uaKWperK} min={0.2} max={4} step={0.05}
            onChange={(e) => {
              const v = Number(e.target.value);
              setUa(v);
              if (hxEnabled) {
                if (kind === 'condenser') hxStore.setUaCond(v);
                else hxStore.setUaEvap(v);
              }
            }}
            className="simulation-slider w-full"
            aria-label="UA"
            aria-valuemin={0.2} aria-valuemax={4} aria-valuenow={uaKWperK} aria-valuetext={`${uaKWperK} kW/K`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'Airflow' : '风量'}</span>
            <span className="formula text-ink-primary">{formatNumber(airFlow, 2)} m³/s</span>
          </span>
          <input type="range" value={airFlow} min={0.05} max={1.5} step={0.02}
            onChange={(e) => {
              const v = Number(e.target.value);
              setAirFlow(v);
              if (hxEnabled) {
                if (kind === 'condenser') hxStore.setAirFlowCond(v);
                else hxStore.setAirFlowEvap(v);
              }
            }}
            className="simulation-slider w-full"
            aria-label="airflow"
            aria-valuemin={0.05} aria-valuemax={1.5} aria-valuenow={airFlow} aria-valuetext={`${airFlow} m³/s`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'Required Q' : '所需 Q'}</span>
            <span className="formula text-ink-primary">{formatNumber(qRequired, 2)} kW</span>
          </span>
          <input type="range" value={qRequired} min={0.5} max={8} step={0.1}
            onChange={(e) => setQRequired(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="required heat"
            aria-valuemin={0.5} aria-valuemax={8} aria-valuenow={qRequired} aria-valuetext={`${qRequired} kW`}
          />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">NTU</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.ntu, 2)}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">ε</p>
          <p className="formula text-body text-accent-measure">{formatNumber(current.epsilon * 100, 1)} %</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">Q@design</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.qActualKW, 2)} kW</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(driftTone)}`}>
          <p className="text-caption opacity-80">{isEn ? 'Tref drift' : 'Tref 漂移'}</p>
          <p className="formula text-body">
            {inverse.feasible ? `${formatNumber(drift, 1)} K` : (isEn ? 'over!' : '超界!')}
          </p>
        </div>
      </div>

      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={sweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="flow_m3s" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" m³/s" />
            <YAxis yAxisId="left" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" kW" />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#43f7b5', fontSize: 11 }} unit=" %" domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              x={airFlow}
              stroke="#9eb5cb"
              strokeDasharray="2 4"
              label={{ value: 'op', fill: '#9eb5cb', fontSize: 10, position: 'top' }}
              yAxisId="left"
            />
            <Line yAxisId="left" type="monotone" dataKey="q_kW" stroke="#34d6ff" strokeWidth={1.8} dot={false} isAnimationActive={false} name={isEn ? 'Q (kW)' : '换热量 Q (kW)'} />
            <Line yAxisId="right" type="monotone" dataKey="eps_pct" stroke="#43f7b5" strokeWidth={1.4} dot={false} isAnimationActive={false} name={isEn ? 'ε (%)' : '效能 ε (%)'} strokeDasharray="4 3" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? `Required ${formatNumber(qRequired, 1)} kW with current UA & airflow needs Tref = ${inverse.feasible ? formatNumber(inverse.TrefC, 1) : '>limit'} °C (your input: ${formatNumber(Tref, 1)} °C). The gap = ${formatNumber(drift, 1)} K is what summer heat or HX fouling looks like in your design.`
          : `当前 UA + 风量下要散 ${formatNumber(qRequired, 1)} kW 需要 Tref = ${inverse.feasible ? formatNumber(inverse.TrefC, 1) : '>上限'} °C（你输入的 ${formatNumber(Tref, 1)} °C）。漂移 ${formatNumber(drift, 1)} K 就是夏季高温 / 换热器结垢在设计里的样子。`}
      </p>
    </Card>
  );
}
