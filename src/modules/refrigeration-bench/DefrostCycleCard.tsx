import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Cloud, Flame, Snowflake } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateDefrost, type DefrostMode, type DefrostTrigger } from '../../simulation/math/seasonalPerformance';
import { formatNumber } from '../../utils/format';

/**
 * 化霜启动 + 霜层模型卡片。
 *
 * 工况：室外 -5°C 70%RH，蒸发器表面霜层逐渐累积；
 *   - 时序曲线：30 分钟运行 → 4 分钟化霜（COP 跌到 0.6）
 *   - 触发策略：温差阈 (ΔT > 阈值K) vs 时间阈 (累计制热时间 > 阈值min)
 *   - 化霜模式：反向循环 (吸室内热融霜) vs 电加热 (纯电耗)
 *
 * 产线工程师视角：北方冬天空调"化霜中"屏显的来源 + 等效 COP 折损。
 */
export function DefrostCycleCard() {
  const [outdoorC, setOutdoorC] = useState(-5);
  const [rh, setRh] = useState(0.7);
  const [frostRate, setFrostRate] = useState(3.5);
  const [trigger, setTrigger] = useState<DefrostTrigger>('temp-diff');
  const [tempDiffK, setTempDiffK] = useState(4);
  const [timeMin, setTimeMin] = useState(40);
  const [mode, setMode] = useState<DefrostMode>('reverse-cycle');

  const result = useMemo(
    () => simulateDefrost({
      outdoorC, rh,
      frostRateMmPerHour: frostRate,
      trigger,
      tempDiffThresholdK: tempDiffK,
      timeThresholdMin: timeMin,
      mode,
      totalMin: 90,
      dtSec: 10,
      steadyCop: 3.2,
    }),
    [outdoorC, rh, frostRate, trigger, tempDiffK, timeMin, mode],
  );

  // 计算化霜段在时间轴上的位置（给 ReferenceArea 用）
  const defrostRanges = useMemo(() => {
    const ranges: Array<{ x1: number; x2: number }> = [];
    let inDef = false;
    let start = 0;
    for (const s of result.samples) {
      if (s.state === 'defrost' && !inDef) {
        inDef = true;
        start = s.tMin;
      } else if (s.state === 'heat' && inDef) {
        inDef = false;
        ranges.push({ x1: start, x2: s.tMin });
      }
    }
    if (inDef) ranges.push({ x1: start, x2: result.samples[result.samples.length - 1].tMin });
    return ranges;
  }, [result.samples]);

  return (
    <Card density="compact" title="化霜启动 + 霜层模型" eyebrow="defrost cycle">
      {/* 顶部 KPI */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <KpiSmall
          label="首次化霜"
          value={result.firstDefrostMin === null ? '未触发' : `${formatNumber(result.firstDefrostMin, 0)} min`}
          icon={<Snowflake className="h-3 w-3" />}
          color="text-accent-primary"
        />
        <KpiSmall
          label="化霜次数 / 90min"
          value={String(result.defrostCount)}
          icon={<Cloud className="h-3 w-3" />}
          color={result.defrostCount > 3 ? 'text-accent-fault' : result.defrostCount > 1 ? 'text-accent-warn' : 'text-accent-measure'}
        />
        <KpiSmall
          label="等效 COP"
          value={formatNumber(result.effectiveCop, 2)}
          icon={<Flame className="h-3 w-3" />}
          color={result.effectiveCop > 2.5 ? 'text-accent-measure' : result.effectiveCop > 1.8 ? 'text-accent-warn' : 'text-accent-fault'}
        />
      </div>

      {/* 控制条：模式 + 触发策略 */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <SegmentedControl
          label="化霜模式"
          value={mode}
          options={[
            { value: 'reverse-cycle', label: '反向循环' },
            { value: 'electric-heat', label: '电加热' },
          ]}
          onChange={(v) => setMode(v as DefrostMode)}
        />
        <SegmentedControl
          label="触发策略"
          value={trigger}
          options={[
            { value: 'temp-diff', label: '温差阈' },
            { value: 'time', label: '时间阈' },
          ]}
          onChange={(v) => setTrigger(v as DefrostTrigger)}
        />
      </div>

      {/* 滑块区 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AriaSlider
          label="室外温度"
          unit=" °C"
          value={outdoorC}
          min={-15}
          max={5}
          step={1}
          onChange={setOutdoorC}
        />
        <AriaSlider
          label="相对湿度 RH"
          unit=""
          digits={2}
          value={rh}
          min={0.2}
          max={0.98}
          step={0.02}
          onChange={setRh}
        />
        <AriaSlider
          label="霜层增厚速率"
          unit=" mm/h"
          digits={1}
          value={frostRate}
          min={0.5}
          max={8}
          step={0.5}
          onChange={setFrostRate}
        />
        {trigger === 'temp-diff' ? (
          <AriaSlider
            label="温差触发阈值"
            unit=" K"
            value={tempDiffK}
            min={1}
            max={10}
            step={0.5}
            digits={1}
            onChange={setTempDiffK}
          />
        ) : (
          <AriaSlider
            label="时间触发阈值"
            unit=" min"
            value={timeMin}
            min={10}
            max={120}
            step={5}
            onChange={setTimeMin}
          />
        )}
      </div>

      {/* 时序曲线：双 Y 轴，左 frostMm 区域+折线，右 cop 折线 */}
      <div className="h-44">
        <SafeResponsiveContainer>
          <ComposedChart data={result.samples} margin={{ top: 6, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMin"
              type="number"
              domain={[0, 90]}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              tickFormatter={(v) => `${Math.round(Number(v))}m`}
            />
            <YAxis
              yAxisId="frost"
              tick={{ fill: '#34d6ff', fontSize: 10 }}
              domain={[0, 'dataMax + 1']}
              label={{ value: 'frost mm', angle: -90, position: 'insideLeft', fill: '#34d6ff', fontSize: 10 }}
            />
            <YAxis
              yAxisId="cop"
              orientation="right"
              tick={{ fill: '#43f7b5', fontSize: 10 }}
              domain={[0, 4]}
              label={{ value: 'COP', angle: 90, position: 'insideRight', fill: '#43f7b5', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(1)} min`}
              formatter={((value: unknown, name: unknown) => {
                const n = String(name ?? '');
                if (n === '霜层 (mm)') return [`${Number(value).toFixed(2)} mm`, '霜层'];
                if (n === 'COP') return [`${Number(value).toFixed(2)}`, 'COP'];
                return [value, n];
              }) as never}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            {defrostRanges.map((r, i) => (
              <ReferenceArea
                key={i}
                yAxisId="frost"
                x1={r.x1}
                x2={r.x2}
                fill="#ff5c7a"
                fillOpacity={0.12}
                stroke="#ff5c7a"
                strokeOpacity={0.4}
                strokeDasharray="2 4"
              />
            ))}
            <Area
              yAxisId="frost"
              type="monotone"
              dataKey="frostMm"
              stroke="#34d6ff"
              fill="#34d6ff"
              fillOpacity={0.18}
              strokeWidth={1.5}
              name="霜层 (mm)"
              isAnimationActive={false}
              dot={false}
            />
            <Line
              yAxisId="cop"
              type="stepAfter"
              dataKey="cop"
              stroke="#43f7b5"
              strokeWidth={1.6}
              dot={false}
              name="COP"
              isAnimationActive={false}
            />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>

      {/* 教学洞察 */}
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        粉色阴影区是化霜段：
        {mode === 'reverse-cycle'
          ? '四通阀反向，从室内吸热融霜（COP→0.6），用户能感到冷风。'
          : '电加热融霜（COP→0），整机变成电热水器。'}
        {' '}产线工程师对策：调低 RH 工况下的化霜触发阈、增设光伏式霜层光学传感器。
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

interface SegmentedControlProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}

function SegmentedControl({ label, value, options, onChange }: SegmentedControlProps) {
  return (
    <div>
      <div className="mb-1 text-caption text-ink-muted">{label}</div>
      <div className="flex rounded-md border border-line-subtle bg-bg-base p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={[
                'flex-1 rounded px-2 py-1 text-caption transition-colors',
                active
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'text-ink-muted hover:text-ink-primary',
              ].join(' ')}
            >
              {o.label}
            </button>
          );
        })}
      </div>
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
