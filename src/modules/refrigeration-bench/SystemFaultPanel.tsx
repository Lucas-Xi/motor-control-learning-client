import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchCycle } from './useBenchCycle';
import {
  FAULT_LIBRARY,
  applySystemFault,
  type SystemFaultType,
} from '../../simulation/math/systemFaults';
import { formatNumber } from '../../utils/format';

/** 故障按钮顺序：none + 7 个故障 = 2×4 网格 */
const FAULT_ORDER: SystemFaultType[] = [
  'none',
  'refrigerant-leak',
  'condenser-fouling',
  'evaporator-frost',
  'eev-stuck-closed',
  'eev-stuck-open',
  'non-condensable-gas',
  'oil-circulation-low',
];

/** 把符号化的偏差量染色：对该指标"变好/变坏"的方向做语义着色。 */
function deltaColor(metric: 'Ps' | 'Pd' | 'Td' | 'SH' | 'cop', delta: number): string {
  // cop 越高越好；其他过高均偏向故障表现
  const bad = metric === 'cop' ? delta < -0.05 : Math.abs(delta) > epsilon(metric);
  if (Math.abs(delta) < epsilon(metric) * 0.5) return 'text-ink-muted';
  return bad ? 'text-accent-fault' : 'text-accent-measure';
}

function epsilon(metric: 'Ps' | 'Pd' | 'Td' | 'SH' | 'cop'): number {
  switch (metric) {
    case 'Ps':
    case 'Pd':
      return 0.02; // MPa
    case 'Td':
      return 1.5; // °C
    case 'SH':
      return 0.5; // K
    case 'cop':
      return 0.05;
  }
}

function formatDelta(value: number, digits: number, unit: string): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatNumber(value, digits)}${unit}`;
}

/** 偏差方向：颜色 + 形状 + sr-only 三通道（色盲/打印友好） */
function DeltaCell({ metric, delta, digits, unit }: { metric: 'Ps' | 'Pd' | 'Td' | 'SH' | 'cop'; delta: number; digits: number; unit: string }) {
  const cls = deltaColor(metric, delta);
  const isNeutral = Math.abs(delta) < epsilon(metric) * 0.5;
  // cop 越高越好；其他过高均偏向故障表现
  const bad = metric === 'cop' ? delta < -0.05 : Math.abs(delta) > epsilon(metric);
  const Icon = isNeutral ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const sr = isNeutral ? '基本无变化' : bad ? '异常偏差' : '正向偏差';
  return (
    <td className={`px-2 py-1.5 text-right font-mono ${cls}`}>
      <span className="inline-flex items-center justify-end gap-1">
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{sr}：</span>
        {formatDelta(delta, digits, unit)}
      </span>
    </td>
  );
}

/**
 * 系统侧故障注入面板。
 *
 * - 状态本地化：type / severity 用 useState 管理，不进 simulationStore
 * - 数据源：从 store 读 refrigeration + motorBasics 切片，调 simulateCycle 拿 baseline
 *   再用 applySystemFault 得到扰动后的 perturbed
 * - 表格：正常 / 故障 / 偏差 三列，5 行（P_s / P_d / T_d / SH / COP）
 * - SH = 吸气温度 T1 - 蒸发温度 Te（refrigeration.Te）
 */
export function SystemFaultPanel() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const baseline = useBenchCycle();

  const [type, setType] = useState<SystemFaultType>('none');
  const [severity, setSeverity] = useState(0.5);

  const fault = useMemo(
    () => applySystemFault({ type, severity, baseline }),
    [type, severity, baseline],
  );

  const baselineSH = baseline.states[0].T - refrig.Te;
  const faultSH = fault.result.states[0].T - refrig.Te;

  const rows: Array<{
    key: 'Ps' | 'Pd' | 'Td' | 'SH' | 'cop';
    label: string;
    unit: string;
    digits: number;
    base: number;
    cur: number;
    delta: number;
  }> = [
    {
      key: 'Ps',
      label: '吸气压力 P_s',
      unit: ' MPa',
      digits: 3,
      base: baseline.states[0].P,
      cur: fault.result.states[0].P,
      delta: fault.deltas.Ps,
    },
    {
      key: 'Pd',
      label: '排气压力 P_d',
      unit: ' MPa',
      digits: 3,
      base: baseline.states[1].P,
      cur: fault.result.states[1].P,
      delta: fault.deltas.Pd,
    },
    {
      key: 'Td',
      label: '排气温度 T_d',
      unit: ' °C',
      digits: 1,
      base: baseline.Tdischarge,
      cur: fault.result.Tdischarge,
      delta: fault.deltas.Td,
    },
    {
      key: 'SH',
      label: '吸气过热度 SH',
      unit: ' K',
      digits: 1,
      base: baselineSH,
      cur: faultSH,
      delta: faultSH - baselineSH,
    },
    {
      key: 'cop',
      label: '能效比 COP',
      unit: '',
      digits: 2,
      base: baseline.cop,
      cur: fault.result.cop,
      delta: fault.deltas.cop,
    },
  ];

  const isFault = type !== 'none';

  return (
    <Card
      title="系统故障注入"
      eyebrow="system-side fault simulator"
      density="compact"
      tone={isFault ? 'fault' : 'default'}
    >
      {/* 8 个故障按钮 2x4 */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="选择注入故障类型">
        {FAULT_ORDER.map((id) => {
          const def = FAULT_LIBRARY[id];
          const active = type === id;
          const isNone = id === 'none';
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${def.label}：${def.signature}`}
              onClick={() => setType(id)}
              title={def.signature}
              className={[
                'rounded-lg border px-2 py-1.5 text-caption transition-colors',
                active
                  ? isNone
                    ? 'border-accent-measure bg-accent-measure/10 text-accent-measure'
                    : 'border-accent-fault bg-accent-fault/10 text-accent-fault'
                  : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong hover:text-ink-primary',
              ].join(' ')}
            >
              <div className="text-left font-medium leading-tight">{def.label}</div>
            </button>
          );
        })}
      </div>

      {/* 严重度滑块（none 时禁用风格仍允许调，无副作用） */}
      <div className="mb-3">
        <Slider
          label={isFault ? '故障严重度' : '严重度（无故障）'}
          value={severity}
          min={0}
          max={1}
          step={0.05}
          unit=""
          onChange={setSeverity}
        />
      </div>

      {/* 症状大字提示 */}
      <div
        className={[
          'mb-3 rounded-lg border px-3 py-2',
          isFault
            ? 'border-accent-fault/40 bg-accent-fault/5'
            : 'border-accent-measure/30 bg-accent-measure/5',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          {isFault && <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-fault" />}
          <p
            className={[
              'text-body font-medium leading-snug',
              isFault ? 'text-accent-fault' : 'text-accent-measure',
            ].join(' ')}
          >
            {fault.signature}
          </p>
        </div>
      </div>

      {/* 排查步骤 */}
      <div className="mb-3 rounded-lg border border-line-subtle bg-bg-base p-2.5">
        <div className="mb-1.5 text-caption uppercase tracking-[0.18em] text-ink-muted">
          {isFault ? '排查步骤' : '巡检建议'}
        </div>
        <ol className="ml-4 list-decimal space-y-1 text-caption leading-relaxed text-ink-secondary">
          {fault.diagnostic.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>

      {/* 对比表格 */}
      <div className="overflow-hidden rounded-lg border border-line-subtle">
        <table className="w-full border-collapse text-caption">
          <thead>
            <tr className="bg-bg-base text-ink-muted">
              <th className="px-2 py-1.5 text-left font-normal">指标</th>
              <th className="px-2 py-1.5 text-right font-normal">正常</th>
              <th className="px-2 py-1.5 text-right font-normal">故障</th>
              <th className="px-2 py-1.5 text-right font-normal">偏差</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line-subtle">
                <td className="px-2 py-1.5 text-ink-secondary">{row.label}</td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-primary">
                  {formatNumber(row.base, row.digits)}
                  {row.unit}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-ink-primary">
                  {formatNumber(row.cur, row.digits)}
                  {row.unit}
                </td>
                <DeltaCell metric={row.key} delta={row.delta} digits={row.digits} unit={row.unit} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        系统侧故障不会立刻出现电气波形畸变，但会让 P_s / P_d / T_d / SH 走出
        典型异常组合，是现场维修最先看的"四表"。配合 12 号「故障与调试」的
        电气类故障一起练，可形成完整的故障树思维。
      </p>
    </Card>
  );
}
