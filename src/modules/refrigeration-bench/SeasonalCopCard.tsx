import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, Gauge } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import {
  calculateSeasonalPerformance,
  type SeasonalResult,
} from '../../simulation/math/seasonalPerformance';
import { formatNumber } from '../../utils/format';

// rating 键为 simulation 侧类型联合字面量（'一级' 等），仅作查表键，不直接渲染
const RATING_META: Record<SeasonalResult['rating'], { color: string; glyph: string; key: TKey }> = {
  '一级': { color: 'text-accent-measure', glyph: '★★★', key: 'refrigerationBench.ratingGrade1' },
  '二级': { color: 'text-accent-primary', glyph: '★★', key: 'refrigerationBench.ratingGrade2' },
  '三级': { color: 'text-accent-warn', glyph: '★', key: 'refrigerationBench.ratingGrade3' },
  '低于三级': { color: 'text-accent-fault', glyph: '⚠', key: 'refrigerationBench.ratingBelowGrade3' },
};

/**
 * SEER / SCOP 季节能效卡片。
 *
 * X 轴：室外干球温度 -10..45°C （11+ 个 bin）
 * Y 轴左：COP（柱状，制冷绿橙、制热橙红）
 * Y 轴右：累计加权权重 hours/year（折线）
 * 卡顶：SEER 大字 + SCOP + APF + 能效等级
 *
 * 产线工程师视角：变频空调铭牌上的 SEER 不是测一个点，而是按 EU EN 14825/中国 GB 21455 在 11 个温度 bin 上做加权。
 */
export function SeasonalCopCard() {
  const { t } = useI18n();
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const [partLoadBoost, setPartLoadBoost] = useState(0.18);
  const [minRpm, setMinRpm] = useState(1200);

  const ratedRpm = motor.ratedSpeed > 1000 ? motor.ratedSpeed * 0.5 : 3600;

  const result = useMemo(
    () => calculateSeasonalPerformance({
      refrigerant: refrig.refrigerant,
      isentropicEff: refrig.isentropicEff,
      displacementCc: refrig.displacementCc,
      clearanceRatio: refrig.clearanceRatio,
      ratedRpm,
      minRpm,
      partLoadBoost,
    }),
    [refrig.refrigerant, refrig.isentropicEff, refrig.displacementCc, refrig.clearanceRatio, ratedRpm, minRpm, partLoadBoost],
  );

  // 渲染数据：cool / heat 各 bin 按温度排序
  const chartData = useMemo(
    () => result.bins.map((b) => ({
      label: `${b.T}°C`,
      cop: Number(b.cop.toFixed(2)),
      hours: b.hours,
      mode: b.mode,
      fill: b.mode === 'cool'
        ? gradColor(b.T, 15, 45, '#43f7b5', '#ffb84d')
        : gradColor(b.T, -10, 18, '#ff5c7a', '#ffb84d'),
    })),
    [result.bins],
  );

  return (
    <Card density="compact" title={t('refrigerationBench.seasonalTitle')} eyebrow="seasonal performance">
      {/* 顶部：SEER + SCOP + APF + Rating */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <MetricLarge label="SEER" value={result.seer} unit="" color="text-accent-measure" />
        <MetricLarge label="SCOP" value={result.scop} unit="" color="text-accent-warn" />
        <MetricLarge label="APF" value={result.apf} unit="" color="text-accent-primary" />
        <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-2">
          <div className="text-caption text-ink-muted flex items-center gap-1">
            <Award className="h-3 w-3" aria-hidden="true" />
            <span>{t('refrigerationBench.ratingGradeLabel')}</span>
          </div>
          <div className={`font-display text-title leading-tight ${RATING_META[result.rating].color}`}>
            <span aria-hidden="true" className="mr-1">{RATING_META[result.rating].glyph}</span>
            {t(RATING_META[result.rating].key)}
          </div>
        </div>
      </div>

      {/* 滑块：变频电机最小转速 + 部分负荷增益 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AriaSlider
          label={t('refrigerationBench.seasonalMinRpmLabel')}
          unit=" rpm"
          value={minRpm}
          min={600}
          max={3000}
          step={100}
          onChange={setMinRpm}
          hint={t('refrigerationBench.seasonalMinRpmHint')}
        />
        <AriaSlider
          label={t('refrigerationBench.seasonalPlBoostLabel')}
          unit=""
          value={partLoadBoost}
          min={0.05}
          max={0.3}
          step={0.01}
          digits={2}
          onChange={setPartLoadBoost}
          hint={t('refrigerationBench.seasonalPlBoostHint')}
        />
      </div>

      {/* COP × 温度柱状图 + hours 折线 */}
      <div className="h-44">
        <SafeResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#9eb5cb', fontSize: 9 }}
              interval={0}
              angle={-30}
              dy={6}
              height={28}
            />
            <YAxis
              yAxisId="cop"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              domain={[0, 'dataMax + 1']}
              label={{ value: 'COP', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              yAxisId="hours"
              orientation="right"
              tick={{ fill: '#ff8a4d', fontSize: 9 }}
              domain={[0, 'dataMax + 100']}
              label={{ value: 'h/year', angle: 90, position: 'insideRight', fill: '#ff8a4d', fontSize: 10 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(52,214,255,0.08)' }}
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              formatter={((value: unknown, name: unknown) => {
                const n = String(name ?? '');
                if (n === 'COP') return [`${Number(value).toFixed(2)}`, 'COP'];
                if (n === 'h/year') return [`${Number(value).toFixed(0)} h`, t('refrigerationBench.seasonalWeightLabel')];
                return [value, n];
              }) as never}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <Bar yAxisId="cop" dataKey="cop" name="COP" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
            <Line
              yAxisId="hours"
              type="monotone"
              dataKey="hours"
              stroke="#ff8a4d"
              strokeWidth={1.4}
              dot={{ r: 2, fill: '#ff8a4d' }}
              name="h/year"
              isAnimationActive={false}
            />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>

      {/* 教学洞察 */}
      <div className="mt-2 flex items-start gap-2 rounded-md border border-line-subtle bg-bg-base px-2 py-1.5 text-caption text-ink-muted leading-relaxed">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-accent-primary" aria-hidden="true" />
        <span>
          {t('refrigerationBench.seasonalInsightA')}<span className="font-mono text-accent-warn">{formatNumber(result.designCop, 2)}</span>
          {' '}{t('refrigerationBench.seasonalInsightB')}<span className="font-mono text-accent-measure">{formatNumber(result.seer, 2)}</span>
          {t('refrigerationBench.seasonalInsightC')}
        </span>
      </div>
    </Card>
  );
}

function MetricLarge({ label, value, unit, color }: { label: string; value: number; unit?: string; color: string }) {
  return (
    <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-2">
      <div className="text-caption uppercase tracking-[0.14em] text-ink-muted">{label}</div>
      <div className={`font-display leading-none ${color}`} style={{ fontSize: '22px' }}>
        {formatNumber(value, 2)}
        {unit && <span className="text-caption ml-1">{unit}</span>}
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
  hint?: string;
  onChange: (v: number) => void;
}

/** 带完整 aria 五件套的滑块 (label / valuemin / valuemax / valuenow / valuetext)。 */
function AriaSlider({ label, value, min, max, step = 1, unit = '', digits, hint, onChange }: AriaSliderProps) {
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
      {hint && <p className="mt-1 text-caption leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

/** 在 [lo, hi] 区间从 colorA → colorB 做线性插值（RGB 6-digit hex 输入） */
function gradColor(v: number, lo: number, hi: number, colorA: string, colorB: string): string {
  const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bb = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bb})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
