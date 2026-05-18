import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRightLeft, Droplets, Flame, Snowflake, Wind } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  QUADRANT_TRANSITIONS,
  simulateQuadrantTransient,
  type QuadrantMode,
} from '../../simulation/math/seasonalPerformance';
import { formatNumber } from '../../utils/format';

/**
 * 四象限工况状态机卡片。
 *
 *   - 圆盘可视化：制冷 / 制热 / 除湿 / 化霜 4 个象限
 *   - 当前模式高亮，悬浮显示切换条件
 *   - 切换瞬态：四通阀 0.5s 内 Pd/Ps 反向 + EEV 重新对齐 1s
 *
 * 产线工程师视角：用户按下"模式切换"那 1-2 秒"咔哒"声 + 排气压力瞬态超调的来源。
 */
export function FourQuadrantCard() {
  const [from, setFrom] = useState<QuadrantMode>('cooling');
  const [to, setTo] = useState<QuadrantMode>('heating');

  // 4 个稳态典型工况
  const MODE_STEADY: Record<QuadrantMode, { Pd: number; Ps: number; eev: number }> = {
    cooling: { Pd: 2.85, Ps: 0.92, eev: 0.55 },
    heating: { Pd: 2.55, Ps: 0.45, eev: 0.70 },
    defrost: { Pd: 1.20, Ps: 0.30, eev: 0.85 },
    dehumid: { Pd: 2.40, Ps: 0.80, eev: 0.35 },
  };

  const steadyFrom = MODE_STEADY[from];
  const steadyTo = MODE_STEADY[to];
  const trans = QUADRANT_TRANSITIONS[`${from}->${to}`];

  const samples = useMemo(
    () => simulateQuadrantTransient({
      from, to,
      PdOld: steadyFrom.Pd, PsOld: steadyFrom.Ps, eevOld: steadyFrom.eev,
      PdNew: steadyTo.Pd, PsNew: steadyTo.Ps, eevNew: steadyTo.eev,
    }),
    [from, to, steadyFrom, steadyTo],
  );

  const chartData = useMemo(
    () => samples.map((s) => ({
      t: s.tSec,
      Pd: Number(s.Pd.toFixed(3)),
      Ps: Number(s.Ps.toFixed(3)),
      eev: Number((s.eev * 100).toFixed(1)),
    })),
    [samples],
  );

  // 阀切换和 EEV 对齐区间
  const valveRegion = useMemo(() => {
    const dur = trans?.durationSec ?? 0.5;
    return { x1: 0.2, x2: 0.2 + dur };
  }, [trans]);
  const eevRegion = useMemo(() => ({ x1: valveRegion.x2, x2: valveRegion.x2 + 1.0 }), [valveRegion.x2]);

  const peakPd = Math.max(...samples.map((s) => s.Pd));
  const overshoot = peakPd - steadyTo.Pd;

  return (
    <Card density="compact" title="四象限工况状态机" eyebrow="4-quadrant mode machine">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 圆盘可视化 */}
        <div>
          <QuadrantWheel current={to} previous={from} />
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-caption">
            <ModeButton
              mode="cooling"
              label="制冷"
              icon={<Snowflake className="h-3 w-3" />}
              active={to === 'cooling'}
              onClick={() => { setFrom(to); setTo('cooling'); }}
            />
            <ModeButton
              mode="heating"
              label="制热"
              icon={<Flame className="h-3 w-3" />}
              active={to === 'heating'}
              onClick={() => { setFrom(to); setTo('heating'); }}
            />
            <ModeButton
              mode="dehumid"
              label="除湿"
              icon={<Droplets className="h-3 w-3" />}
              active={to === 'dehumid'}
              onClick={() => { setFrom(to); setTo('dehumid'); }}
            />
            <ModeButton
              mode="defrost"
              label="化霜"
              icon={<Wind className="h-3 w-3" />}
              active={to === 'defrost'}
              onClick={() => { setFrom(to); setTo('defrost'); }}
            />
          </div>
        </div>

        {/* 切换条件 + 瞬态指标 */}
        <div className="space-y-2">
          <div className="rounded-md border border-line-subtle bg-bg-base p-2 text-caption">
            <div className="mb-1 flex items-center gap-1.5 text-ink-muted">
              <ArrowRightLeft className="h-3 w-3 text-accent-primary" aria-hidden="true" />
              <span>切换路径</span>
            </div>
            <div className="font-mono text-body text-ink-primary">
              {LABEL[from]} → {LABEL[to]}
            </div>
          </div>

          <TransitionRow label="阀切换持续" value={`${(trans?.durationSec ?? 0).toFixed(2)} s`} />
          <TransitionRow
            label="四通阀切换"
            value={trans?.fourWayValveSwitch ? '是（咔哒）' : '否'}
            color={trans?.fourWayValveSwitch ? 'text-accent-warn' : 'text-accent-measure'}
          />
          <TransitionRow
            label="EEV 步进 Δ"
            value={`${(((trans?.eevTargetDelta ?? 0) * 100)).toFixed(0)} %`}
            color={Math.abs(trans?.eevTargetDelta ?? 0) > 0.3 ? 'text-accent-warn' : 'text-accent-primary'}
          />
          <TransitionRow
            label="P_d 峰值过冲"
            value={`+${formatNumber(overshoot, 3)} MPa`}
            color={overshoot > 0.3 ? 'text-accent-fault' : overshoot > 0.1 ? 'text-accent-warn' : 'text-accent-measure'}
          />
        </div>
      </div>

      {/* 瞬态曲线：Pd / Ps / EEV */}
      <div className="mt-3 h-44">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, 2.5]}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}s`}
            />
            <YAxis
              yAxisId="P"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 'dataMax + 0.2']}
              label={{ value: 'MPa', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              yAxisId="eev"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 100]}
              label={{ value: 'EEV %', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
              formatter={((value: unknown, name: unknown) => {
                const n = String(name ?? '');
                if (n === 'EEV') return [`${Number(value).toFixed(1)}%`, n];
                return [`${Number(value).toFixed(3)} MPa`, n];
              }) as never}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceArea yAxisId="P" x1={valveRegion.x1} x2={valveRegion.x2} fill="#ff5c7a" fillOpacity={0.08} stroke="#ff5c7a" strokeOpacity={0.3} strokeDasharray="2 4" />
            <ReferenceArea yAxisId="P" x1={eevRegion.x1} x2={eevRegion.x2} fill="#ffb84d" fillOpacity={0.06} stroke="#ffb84d" strokeOpacity={0.3} strokeDasharray="2 4" />
            <Line yAxisId="P" type="monotone" dataKey="Pd" stroke="#ff5c7a" strokeWidth={1.8} dot={false} name="P_d 排气" isAnimationActive={false} />
            <Line yAxisId="P" type="monotone" dataKey="Ps" stroke="#34d6ff" strokeWidth={1.8} dot={false} name="P_s 吸气" isAnimationActive={false} />
            <Line yAxisId="eev" type="monotone" dataKey="eev" stroke="#ffb84d" strokeWidth={1.4} strokeDasharray="4 4" dot={false} name="EEV" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        粉色区是四通阀切换段（~0.5s，物理"咔哒"声来源），Pd 在阀切换瞬间过冲到{' '}
        <span className="font-mono text-accent-fault">{formatNumber(peakPd, 2)} MPa</span>，
        随后橙色区是 EEV 重新对齐（~1.0s）；
        快速反复切换时这两段瞬态会叠加，是产品验收需要避免的工况。
      </p>
    </Card>
  );
}

const LABEL: Record<QuadrantMode, string> = {
  cooling: '制冷',
  heating: '制热',
  dehumid: '除湿',
  defrost: '化霜',
};

const COLOR: Record<QuadrantMode, string> = {
  cooling: '#34d6ff',
  heating: '#ff8a4d',
  dehumid: '#43f7b5',
  defrost: '#ff5c7a',
};

const QUADRANT_POS: Record<QuadrantMode, { x: number; y: number }> = {
  cooling: { x: 0.71, y: -0.71 },   // 右上 (-45°)
  heating: { x: -0.71, y: -0.71 },  // 左上 (-135°)
  defrost: { x: -0.71, y: 0.71 },   // 左下 (135°)
  dehumid: { x: 0.71, y: 0.71 },    // 右下 (45°)
};

function QuadrantWheel({ current, previous }: { current: QuadrantMode; previous: QuadrantMode }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label={`当前模式 ${LABEL[current]}，前一模式 ${LABEL[previous]}`}>
      {/* 4 个象限扇形 */}
      {(['cooling', 'heating', 'defrost', 'dehumid'] as const).map((m, i) => {
        // 每个扇形 90°，cooling 右上 (-90..0), heating 左上 (180..270), defrost 左下 (90..180), dehumid 右下 (0..90)
        const startAngles: Record<QuadrantMode, number> = { cooling: -90, heating: 180, defrost: 90, dehumid: 0 };
        const a0 = (startAngles[m] * Math.PI) / 180;
        const a1 = a0 + Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const active = m === current;
        const prev = m === previous && m !== current;
        return (
          <g key={m}>
            <path
              d={`M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`}
              fill={COLOR[m]}
              fillOpacity={active ? 0.32 : prev ? 0.16 : 0.06}
              stroke={COLOR[m]}
              strokeOpacity={active ? 0.9 : 0.3}
              strokeWidth={active ? 2 : 1}
            />
            {/* 标签 */}
            <text
              x={cx + QUADRANT_POS[m].x * (r * 0.65)}
              y={cy + QUADRANT_POS[m].y * (r * 0.65)}
              fill={active ? COLOR[m] : '#9eb5cb'}
              fontSize={active ? 14 : 11}
              fontWeight={active ? 700 : 400}
              textAnchor="middle"
              dominantBaseline="central"
              key={`label-${i}`}
            >
              {LABEL[m]}
            </text>
          </g>
        );
      })}
      {/* 中心 hub */}
      <circle cx={cx} cy={cy} r={14} fill="#0d1929" stroke="#1e2a3d" />
      <text x={cx} y={cy} fill="#e7f3ff" fontSize={9} textAnchor="middle" dominantBaseline="central">
        {LABEL[current]}
      </text>
      {/* 切换箭头 */}
      {previous !== current && (
        <line
          x1={cx + QUADRANT_POS[previous].x * (r * 0.85)}
          y1={cy + QUADRANT_POS[previous].y * (r * 0.85)}
          x2={cx + QUADRANT_POS[current].x * (r * 0.85)}
          y2={cy + QUADRANT_POS[current].y * (r * 0.85)}
          stroke="#ffb84d"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          markerEnd="url(#arrow)"
        />
      )}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb84d" />
        </marker>
      </defs>
    </svg>
  );
}

interface ModeButtonProps {
  mode: QuadrantMode;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}

function ModeButton({ mode, label, icon, active, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ borderColor: active ? COLOR[mode] : undefined }}
      className={[
        'flex items-center justify-center gap-1 rounded-md border bg-bg-base px-2 py-1.5 transition-colors',
        active ? 'text-ink-primary' : 'border-line-subtle text-ink-muted hover:text-ink-primary',
      ].join(' ')}
    >
      <span style={{ color: COLOR[mode] }}>{icon}</span>
      {label}
    </button>
  );
}

function TransitionRow({ label, value, color = 'text-accent-primary' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-caption">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
