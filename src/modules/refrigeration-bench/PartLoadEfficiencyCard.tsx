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
import { Activity, Gauge, TrendingUp } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { simulatePartLoad } from '../../simulation/math/seasonalPerformance';
import { formatNumber } from '../../utils/format';

/**
 * 变频部分负载效率曲线卡片：定频 vs 变频对比。
 *
 * X 轴：负载率 PLR 0.1..1.2
 * Y 轴左：COP（两条线：定频 / 变频）
 * Y 轴右：压缩机转速（两条线：定频锁定 / 变频跟随）
 *
 * 产线工程师视角：解释变频空调省电的真正原因——不是单点 COP 高，而是整年部分负荷下 COP 都更高。
 */
export function PartLoadEfficiencyCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const [minRpm, setMinRpm] = useState(1200);
  const [cyclingPenaltyPlr, setCyclingPenalty] = useState(0.45);
  const [variableSpeedRatio, setVariableSpeedRatio] = useState(3.0);

  const ratedRpm = motor.ratedSpeed > 1000 ? motor.ratedSpeed * 0.5 : 3600;

  const result = useMemo(
    () => simulatePartLoad({
      refrigerant: refrig.refrigerant,
      isentropicEff: refrig.isentropicEff,
      displacementCc: refrig.displacementCc,
      clearanceRatio: refrig.clearanceRatio,
      ratedRpm,
      minRpm,
      cyclingPenaltyPlr,
      variableSpeedRatio,
    }),
    [refrig.refrigerant, refrig.isentropicEff, refrig.displacementCc, refrig.clearanceRatio, ratedRpm, minRpm, cyclingPenaltyPlr, variableSpeedRatio],
  );

  const chartData = useMemo(
    () => result.samples.map((s) => ({
      plr: Math.round(s.plr * 100),
      copFixed: Number(s.copFixed.toFixed(2)),
      copInverter: Number(s.copInverter.toFixed(2)),
      rpmFixed: Math.round(s.rpmFixed),
      rpmInverter: Math.round(s.rpmInverter),
    })),
    [result.samples],
  );

  return (
    <Card density="compact" title="变频部分负载效率" eyebrow="part-load efficiency">
      {/* 顶部 KPI */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <KpiSmall
          label="定频平均 COP"
          value={formatNumber(result.avgCopFixed, 2)}
          icon={<Gauge className="h-3 w-3" />}
          color="text-accent-warn"
        />
        <KpiSmall
          label="变频平均 COP"
          value={formatNumber(result.avgCopInverter, 2)}
          icon={<Activity className="h-3 w-3" />}
          color="text-accent-measure"
        />
        <KpiSmall
          label="整年提升"
          value={`+${formatNumber(result.improvementPercent, 1)}%`}
          icon={<TrendingUp className="h-3 w-3" />}
          color={result.improvementPercent > 25 ? 'text-accent-measure' : result.improvementPercent > 10 ? 'text-accent-primary' : 'text-accent-warn'}
        />
      </div>

      {/* 滑块控件 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <AriaSlider
          label="电机最小转速 N_min"
          unit=" rpm"
          value={minRpm}
          min={300}
          max={3000}
          step={100}
          onChange={setMinRpm}
        />
        <AriaSlider
          label="启停滞环 PLR 阈"
          unit=""
          digits={2}
          value={cyclingPenaltyPlr}
          min={0.1}
          max={0.8}
          step={0.05}
          onChange={setCyclingPenalty}
        />
        <AriaSlider
          label="调速比 N_max/N_min"
          unit="×"
          digits={1}
          value={variableSpeedRatio}
          min={1.5}
          max={8}
          step={0.5}
          onChange={setVariableSpeedRatio}
        />
      </div>

      {/* 双折线对比 */}
      <div className="h-48">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="plr"
              type="number"
              domain={[0, 120]}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              label={{ value: 'PLR (%)', position: 'insideBottom', offset: -2, fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              yAxisId="cop"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 'dataMax + 1']}
              label={{ value: 'COP', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              yAxisId="rpm"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, ratedRpm * 1.2]}
              tickFormatter={(v) => `${Math.round(Number(v) / 100) / 10}k`}
              label={{ value: 'rpm', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `PLR = ${v}%`}
              formatter={((value: unknown, name: unknown) => {
                const n = String(name ?? '');
                if (n === '定频 COP' || n === '变频 COP') return [`${Number(value).toFixed(2)}`, n];
                return [`${value} rpm`, n];
              }) as never}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceArea
              yAxisId="cop"
              x1={0}
              x2={cyclingPenaltyPlr * 100}
              fill="#ff5c7a"
              fillOpacity={0.06}
              stroke="#ff5c7a"
              strokeOpacity={0.3}
              strokeDasharray="2 4"
              label={{ value: '启停损失区', fill: '#ff5c7a', fontSize: 9, position: 'insideTop' }}
            />
            <Line
              yAxisId="cop"
              type="monotone"
              dataKey="copFixed"
              stroke="#ffb84d"
              strokeWidth={1.8}
              dot={{ r: 2, fill: '#ffb84d' }}
              name="定频 COP"
              isAnimationActive={false}
            />
            <Line
              yAxisId="cop"
              type="monotone"
              dataKey="copInverter"
              stroke="#43f7b5"
              strokeWidth={1.8}
              dot={{ r: 2, fill: '#43f7b5' }}
              name="变频 COP"
              isAnimationActive={false}
            />
            <Line
              yAxisId="rpm"
              type="monotone"
              dataKey="rpmFixed"
              stroke="#ff8a4d"
              strokeWidth={1.2}
              strokeDasharray="4 4"
              dot={false}
              name="定频 rpm"
              isAnimationActive={false}
            />
            <Line
              yAxisId="rpm"
              type="monotone"
              dataKey="rpmInverter"
              stroke="#34d6ff"
              strokeWidth={1.2}
              strokeDasharray="4 4"
              dot={false}
              name="变频 rpm"
              isAnimationActive={false}
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        粉色阴影是定频"启停频繁区"：PLR&lt;
        <span className="font-mono text-accent-fault">{(cyclingPenaltyPlr * 100).toFixed(0)}%</span>{' '}
        时定频靠开关达到部分负荷，启动损失把 COP 打到 50% 以下；
        变频靠 N_min~N_max 之间连续调速，PLR 越低 COP 反而越高（压比下降 + 容积效率提升）。
      </p>
    </Card>
  );
}

function KpiSmall({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
      <div className="text-caption text-ink-muted flex items-center gap-1">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={`font-mono ${color}`} style={{ fontSize: '16px', lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

interface AriaSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  digits?: number;
  onChange: (v: number) => void;
}

function AriaSlider({ label, value, min, max, step = 1, unit = '', digits, onChange }: AriaSliderProps) {
  const d = digits ?? (step < 1 ? 2 : 0);
  const text = `${value.toFixed(d)}${unit}`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-body text-ink-secondary">{label}</span>
        <span className="formula text-ink-primary">{text}</span>
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
        aria-valuetext={text}
      />
    </div>
  );
}
