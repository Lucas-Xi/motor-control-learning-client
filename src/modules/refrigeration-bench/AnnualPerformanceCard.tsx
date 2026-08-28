import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { MapPin } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import {
  CLIMATES,
  calculateAPF,
  type ApfResult,
  type ClimateZone,
} from '../../simulation/math/annualPerformance';

// 4 个城市按钮顺序与 lucide MapPin 风格一致
const ZONE_ORDER: ClimateZone[] = ['beijing', 'shanghai', 'guangzhou', 'harbin'];

const ZONE_LABEL: Record<ClimateZone, TKey> = {
  beijing: 'refrigerationBench.annualZoneBeijing',
  shanghai: 'refrigerationBench.annualZoneShanghai',
  guangzhou: 'refrigerationBench.annualZoneGuangzhou',
  harbin: 'refrigerationBench.annualZoneHarbin',
};

// rating 键为 simulation 侧类型联合字面量（'一级' 等），仅作查表键，不直接渲染
const RATING_META: Record<ApfResult['rating'], { color: string; glyph: string; key: TKey }> = {
  '一级': { color: 'text-accent-measure', glyph: '★★★', key: 'refrigerationBench.ratingGrade1' },
  '二级': { color: 'text-accent-primary', glyph: '★★', key: 'refrigerationBench.ratingGrade2' },
  '三级': { color: 'text-accent-warn', glyph: '★', key: 'refrigerationBench.ratingGrade3' },
  '低于三级': { color: 'text-accent-fault', glyph: '⚠', key: 'refrigerationBench.ratingBelowGrade3' },
};

/**
 * 在制冷-室外温度区间内做绿(低温)→橙(高温)的渐变。
 */
function coolColor(T: number, lo: number, hi: number): string {
  const t = Math.max(0, Math.min(1, (T - lo) / Math.max(1, hi - lo)));
  // 绿 (#43f7b5) → 橙 (#ffb84d)
  const r = Math.round(0x43 + (0xff - 0x43) * t);
  const g = Math.round(0xf7 + (0xb8 - 0xf7) * t);
  const b = Math.round(0xb5 + (0x4d - 0xb5) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 在制热-室外温度区间内做橙(暖)→红(极冷)的渐变。
 */
function heatColor(T: number, lo: number, hi: number): string {
  const t = Math.max(0, Math.min(1, (hi - T) / Math.max(1, hi - lo)));
  // 橙 (#ffb84d) → 红 (#ff5c7a)
  const r = Math.round(0xff + (0xff - 0xff) * t);
  const g = Math.round(0xb8 + (0x5c - 0xb8) * t);
  const b = Math.round(0x4d + (0x7a - 0x4d) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 全年能效 APF 卡片：
 *   - 顶部：4 城市 chip 切换；
 *   - 中部：APF 大字 + 等级；
 *   - 中部：制冷 / 制热 / 全年三段能耗分柱条形展示（用 div 比例条，不引入新的 chart）；
 *   - 中下：BarChart 显示每个 bin 的 COP（制冷绿橙渐变、制热橙红渐变）；
 *   - 底部：一句话教学洞察（"标定 COP 高 vs APF 低"）。
 *
 * 数据流：useSimulationStore 切片读 refrigeration + motorBasics → 组装 ApfParams → useMemo(calculateAPF)
 */
export function AnnualPerformanceCard() {
  const { t } = useI18n();
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const [zone, setZone] = useState<ClimateZone>('shanghai');

  const result = useMemo<ApfResult>(() => calculateAPF({
    refrigerant: refrig.refrigerant,
    zone,
    partLoadCurveCoeff: 0.85,
    isentropicEff: refrig.isentropicEff,
    displacementCc: refrig.displacementCc,
    clearanceRatio: refrig.clearanceRatio,
    ratedRpm: motor.ratedSpeed > 1000 ? motor.ratedSpeed * 0.5 : 3600,
  }), [refrig.refrigerant, refrig.isentropicEff, refrig.displacementCc, refrig.clearanceRatio, motor.ratedSpeed, zone]);

  // 三段能耗在条形图上的相对比例
  const totalE = Math.max(1e-3, result.annualEnergy_kWh);
  // 用制冷耗电 + 制热耗电直接拆出来——简单按比例：cooling_kWh / cop_avg_cool 的实际算法略微相对，
  // 这里直接用 total - 某半段做近似，但更准确做法是分别累加。
  // 为简洁，此处用 cool/heat 总热量近似比例（学习目的）。
  const coolingShare = result.annualCooling_kWh > 0
    ? result.annualCooling_kWh / (result.annualCooling_kWh + result.annualHeating_kWh)
    : 0;
  const heatingShare = 1 - coolingShare;

  // 制冷季 / 制热季耗电（按制冷量 ÷ 全年平均能效拆分；近似但教学够用）
  const apfSafe = result.apf > 1e-3 ? result.apf : 1;
  const coolE = result.annualCooling_kWh / apfSafe;
  const heatE = result.annualHeating_kWh / apfSafe;
  const maxBar = Math.max(coolE, heatE, totalE);

  // chart 数据（按 mode 分两段排序：制冷低→高，制热低→高）
  const chartData = useMemo(() => {
    const climate = CLIMATES[zone];
    const coolLo = climate.cooling[0]?.T ?? 24;
    const coolHi = climate.cooling[climate.cooling.length - 1]?.T ?? 38;
    const heatLo = climate.heating[0]?.T ?? -25;
    const heatHi = climate.heating[climate.heating.length - 1]?.T ?? 7;
    return result.copByBin
      .slice()
      .sort((a, b) => {
        if (a.mode === b.mode) return a.T - b.T;
        return a.mode === 'cool' ? -1 : 1;
      })
      .map((bin) => ({
        label: `${bin.T}°C`,
        cop: Number(bin.cop.toFixed(2)),
        mode: bin.mode,
        fill: bin.mode === 'cool'
          ? coolColor(bin.T, coolLo, coolHi)
          : heatColor(bin.T, heatLo, heatHi),
      }));
  }, [result.copByBin, zone]);

  return (
    <Card density="compact" title={t('refrigerationBench.annualTitle')} eyebrow="annual performance factor">
      {/* 4 城市 chip */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('refrigerationBench.annualZoneAriaLabel')}>
        {ZONE_ORDER.map((z) => {
          const active = z === zone;
          return (
            <button
              key={z}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setZone(z)}
              className={[
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-caption transition-colors',
                active
                  ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                  : 'border-line-subtle text-ink-muted hover:border-accent-primary/40 hover:text-ink-primary',
              ].join(' ')}
            >
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {t(ZONE_LABEL[z])}
            </button>
          );
        })}
      </div>

      {/* APF 大字 + 等级 */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-caption uppercase tracking-[0.18em] text-ink-muted">APF</div>
          <div className="font-display text-[40px] leading-none text-ink-primary">
            {result.apf.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('refrigerationBench.ratingGradeLabel')}</div>
          <div className={`font-display text-title ${RATING_META[result.rating].color}`}>
            <span aria-hidden="true" className="mr-1">{RATING_META[result.rating].glyph}</span>
            {t(RATING_META[result.rating].key)}
          </div>
        </div>
      </div>

      {/* 三段能耗分柱条形 */}
      <div className="mb-3 grid grid-cols-3 gap-2 text-caption">
        <EnergyBar label={t('refrigerationBench.annualCoolingEnergy')} value={coolE} max={maxBar} color="bg-accent-measure/70" share={coolingShare} />
        <EnergyBar label={t('refrigerationBench.annualHeatingEnergy')} value={heatE} max={maxBar} color="bg-accent-warn/70" share={heatingShare} />
        <EnergyBar label={t('refrigerationBench.annualTotalEnergy')} value={totalE} max={maxBar} color="bg-accent-primary/70" />
      </div>

      {/* 各 bin COP 柱状图 */}
      <div className="h-32">
        <SafeResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="label" tick={{ fill: '#9eb5cb', fontSize: 9 }} interval={0} angle={-30} dy={6} height={28} />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} domain={[0, 'dataMax + 1']} />
            <Tooltip
              cursor={{ fill: 'rgba(52,214,255,0.08)' }}
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              formatter={(value: unknown) => [`COP=${Number(value).toFixed(2)}`, t('refrigerationBench.annualCopLabel')]}
            />
            <Bar dataKey="cop" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      {/* 教学洞察 */}
      <p className="mt-2 text-caption text-ink-muted leading-relaxed">
        {t('refrigerationBench.annualInsightPrefix')}<span className="font-mono text-accent-warn">{result.designCop.toFixed(2)}</span>
        {' '}{t('refrigerationBench.annualInsightBut')}<span className="font-mono text-accent-measure">{result.apf.toFixed(2)}</span>
        {result.apf >= result.designCop
          ? t('refrigerationBench.annualInsightApfHigher')
          : t('refrigerationBench.annualInsightApfLower')}
      </p>
    </Card>
  );
}

interface EnergyBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  share?: number;
}

function EnergyBar({ label, value, max, color, share }: EnergyBarProps) {
  const pct = Math.max(2, (value / Math.max(1e-3, max)) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-ink-muted">
        <span>{label}</span>
        {share !== undefined && (
          <span className="text-[10px] opacity-70">{(share * 100).toFixed(0)}%</span>
        )}
      </div>
      <div className="relative h-12 rounded-md bg-bg-raised overflow-hidden border border-line-subtle">
        <div
          className={`absolute bottom-0 left-0 right-0 ${color} transition-all duration-300`}
          style={{ height: `${pct}%` }}
        />
        <div className="absolute inset-x-0 bottom-1 text-center font-mono text-[11px] text-ink-primary">
          {value < 100 ? value.toFixed(1) : value.toFixed(0)}
        </div>
      </div>
      <div className="mt-0.5 text-center text-[10px] text-ink-muted">kWh</div>
    </div>
  );
}
