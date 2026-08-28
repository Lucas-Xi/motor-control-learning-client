import { useMemo, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { useAssemblyProgressStore, type AssemblyHistoryEntry } from '../../store/assemblyProgressStore';
import { compressorBundles } from '../../content/compressorLibrary';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
  runAssembly,
  type AssemblyResult,
} from '../../content/assemblyLibraries';
import { useI18n } from '../../i18n/useI18n';

/**
 * 历史会话两两对比（Phase C）。
 *
 * 与 AssemblyWorkshop 内部 history tab 的 CompareTwoHistory 区别：
 *  - 那个只显示 4 个数值 KPI delta（COP / Td / fault / warn）
 *  - 这个把两条 history 完整拍开成"左右两列 × 6 slot + 4 KPI"的并排表，
 *    并通过 runAssembly 把 Pd（pressureRatio）和 Iq（requiredIqA）重新算出来显示
 *
 * 挂在 assembly-workshop 模块下方，与 ProjectExporter 平行。
 * 当 history 不足 2 条时显示提示卡，不渲染对比表。
 *
 * 视觉令牌：accent.primary（变化项）/ accent.measure（A 列）/ accent.warn（B 列）/ accent.fault（变差）。
 */

interface SlotLookup {
  compressor: string;
  inverter: string;
  strategy: string;
  load: string;
  pfc: string;
  separator: string;
}

function lookupSlotNames(slotIds: AssemblyHistoryEntry['slotIds']): SlotLookup {
  const bundle = compressorBundles.find((b) => b.id === slotIds.compressorBundleId);
  const inv = inverterPlatforms.find((i) => i.ipmPartNo === slotIds.inverterPartNo);
  const strat = controlStrategies.find((s) => s.id === slotIds.strategyId);
  const load = loadConditions.find((l) => l.id === slotIds.loadId);
  const pfc = pfcPlatforms.find((p) => p.id === slotIds.pfcId);
  const sep = liquidSeparators.find((s) => s.id === slotIds.separatorId);
  return {
    compressor: bundle ? `${bundle.compressor.brand} ${bundle.compressor.partNo}` : slotIds.compressorBundleId,
    inverter: inv ? `${inv.ipmBrand} ${inv.ipmPartNo}` : slotIds.inverterPartNo,
    strategy: strat?.name ?? slotIds.strategyId,
    load: load?.name ?? slotIds.loadId,
    pfc: pfc?.name ?? slotIds.pfcId,
    separator: sep?.name ?? slotIds.separatorId,
  };
}

/** 重跑 runAssembly 拿到完整的 KPI（history 里只存了 cop / Tdischarge / 计数；Iq / Pd 需要现算） */
function recompute(entry: AssemblyHistoryEntry): AssemblyResult | null {
  const bundle = compressorBundles.find((b) => b.id === entry.slotIds.compressorBundleId);
  const inv = inverterPlatforms.find((i) => i.ipmPartNo === entry.slotIds.inverterPartNo);
  const strat = controlStrategies.find((s) => s.id === entry.slotIds.strategyId);
  const load = loadConditions.find((l) => l.id === entry.slotIds.loadId);
  const pfc = pfcPlatforms.find((p) => p.id === entry.slotIds.pfcId);
  const sep = liquidSeparators.find((s) => s.id === entry.slotIds.separatorId);
  if (!bundle || !inv || !strat || !load || !pfc || !sep) return null;
  return runAssembly({
    compressor: bundle.compressor,
    inverter: inv,
    strategy: strat,
    load,
    pfc,
    separator: sep,
  });
}

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SnapshotDiffPanel() {
  const { t } = useI18n();
  const history = useAssemblyProgressStore((s) => s.history);
  // 默认对比"最新两条"
  const defaultIds = useMemo(() => {
    if (history.length < 2) return { a: '', b: '' };
    return { a: history[history.length - 2].id, b: history[history.length - 1].id };
  }, [history]);
  const [idA, setIdA] = useState(defaultIds.a);
  const [idB, setIdB] = useState(defaultIds.b);

  // 当 history 变化（新 push）时，如果用户未手动选过、保持"最新两条"语义
  // 简化：每次组件 render 直接用 controlled state，只在 user select 时覆盖。
  // 这里给一个 reset 按钮即可。

  const entryA = history.find((h) => h.id === idA) ?? history[history.length - 2];
  const entryB = history.find((h) => h.id === idB) ?? history[history.length - 1];

  if (history.length < 2 || !entryA || !entryB) {
    return (
      <div className="rounded-2xl border border-line-subtle bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
          <ArrowLeftRight className="h-3.5 w-3.5 text-accent-primary" />
          <span>{t('assemblyWorkshop.diffTitle')}</span>
        </div>
        <p className="mt-2 text-caption text-ink-muted">
          {t('assemblyWorkshop.diffEmptyHint')}
        </p>
      </div>
    );
  }

  return <SnapshotDiffBody history={history} entryA={entryA} entryB={entryB} idA={idA || entryA.id} idB={idB || entryB.id} onPickA={setIdA} onPickB={setIdB} />;
}

function SnapshotDiffBody({
  history, entryA, entryB, idA, idB, onPickA, onPickB,
}: {
  history: AssemblyHistoryEntry[];
  entryA: AssemblyHistoryEntry;
  entryB: AssemblyHistoryEntry;
  idA: string;
  idB: string;
  onPickA: (id: string) => void;
  onPickB: (id: string) => void;
}) {
  const { t } = useI18n();
  const slotsA = lookupSlotNames(entryA.slotIds);
  const slotsB = lookupSlotNames(entryB.slotIds);

  // 重算 KPI（cop / Td 已经在 history 里，但 Iq / Pd 需要 runAssembly）
  const resA = useMemo(() => recompute(entryA), [entryA]);
  const resB = useMemo(() => recompute(entryB), [entryB]);

  const slotRows: Array<{ label: string; aValue: string; bValue: string }> = [
    { label: t('assemblyWorkshop.slotCompressor'), aValue: slotsA.compressor, bValue: slotsB.compressor },
    { label: t('assemblyWorkshop.slotInverter'), aValue: slotsA.inverter, bValue: slotsB.inverter },
    { label: t('assemblyWorkshop.slotStrategy'), aValue: slotsA.strategy, bValue: slotsB.strategy },
    { label: t('assemblyWorkshop.slotLoadFull'), aValue: slotsA.load, bValue: slotsB.load },
    { label: t('assemblyWorkshop.slotPfcFull'), aValue: slotsA.pfc, bValue: slotsB.pfc },
    { label: t('assemblyWorkshop.slotSeparatorFull'), aValue: slotsA.separator, bValue: slotsB.separator },
  ];

  const kpiRows: Array<{ label: string; unit: string; a: number; b: number; positiveBetter: boolean }> = [
    { label: 'COP', unit: '', a: entryA.cop, b: entryB.cop, positiveBetter: true },
    { label: t('assemblyWorkshop.diffKpiIq'), unit: 'A', a: resA?.metrics.requiredIqA ?? NaN, b: resB?.metrics.requiredIqA ?? NaN, positiveBetter: false },
    { label: t('assemblyWorkshop.diffKpiPd'), unit: '', a: resA?.metrics.pressureRatio ?? NaN, b: resB?.metrics.pressureRatio ?? NaN, positiveBetter: false },
    { label: t('assemblyWorkshop.diffKpiTd'), unit: '°C', a: entryA.Tdischarge, b: entryB.Tdischarge, positiveBetter: false },
  ];

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
          <ArrowLeftRight className="h-3.5 w-3.5 text-accent-primary" />
          <span>{t('assemblyWorkshop.diffTitleFull')}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5 text-caption">
          <label className="flex items-center gap-1 rounded-md border border-accent-measure/40 bg-accent-measure/5 px-2 py-1 text-accent-measure">
            <span className="font-mono">A</span>
            <select
              aria-label={t('assemblyWorkshop.diffSelectAAria')}
              value={idA}
              onChange={(e) => onPickA(e.target.value)}
              className="rounded bg-bg-base px-1 py-0.5 text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {history.map((h) => (
                <option key={h.id} value={h.id}>
                  {timeLabel(h.timestamp)} · {h.verdict}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 rounded-md border border-accent-warn/40 bg-accent-warn/5 px-2 py-1 text-accent-warn">
            <span className="font-mono">B</span>
            <select
              aria-label={t('assemblyWorkshop.diffSelectBAria')}
              value={idB}
              onChange={(e) => onPickB(e.target.value)}
              className="rounded bg-bg-base px-1 py-0.5 text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {history.map((h) => (
                <option key={h.id} value={h.id}>
                  {timeLabel(h.timestamp)} · {h.verdict}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* slot 表 */}
      <div className="mb-3 overflow-x-auto rounded-xl border border-line-subtle">
        <table className="w-full text-caption">
          <thead className="bg-bg-base text-ink-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.18em]">{t('assemblyWorkshop.diffSlotHeader')}</th>
              <th scope="col" className="px-2 py-1.5 text-left text-accent-measure">A · {timeLabel(entryA.timestamp)}</th>
              <th scope="col" className="px-2 py-1.5 text-left text-accent-warn">B · {timeLabel(entryB.timestamp)}</th>
            </tr>
          </thead>
          <tbody>
            {slotRows.map((r) => {
              const diff = r.aValue !== r.bValue;
              return (
                <tr key={r.label} className={`border-t border-line-subtle ${diff ? 'bg-accent-primary/5' : ''}`}>
                  <th scope="row" className="px-2 py-1 text-left font-normal text-ink-muted">{r.label}</th>
                  <td className={`px-2 py-1 ${diff ? 'text-accent-primary' : 'text-ink-secondary'}`}>
                    {diff && <span className="mr-1" aria-hidden="true">●</span>}
                    {r.aValue}
                  </td>
                  <td className={`px-2 py-1 ${diff ? 'text-accent-primary' : 'text-ink-secondary'}`}>
                    {diff && <span className="mr-1" aria-hidden="true">●</span>}
                    {r.bValue}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* KPI 表 */}
      <div className="overflow-x-auto rounded-xl border border-line-subtle">
        <table className="w-full text-caption">
          <thead className="bg-bg-base text-ink-muted">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.18em]">KPI</th>
              <th scope="col" className="px-2 py-1.5 text-right text-accent-measure">A</th>
              <th scope="col" className="px-2 py-1.5 text-right text-accent-warn">B</th>
              <th scope="col" className="px-2 py-1.5 text-right text-[10px] uppercase tracking-[0.18em]">Δ (B−A)</th>
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((r) => {
              const delta = r.b - r.a;
              const sig = Math.abs(delta) > 0.005;
              const better = r.positiveBetter ? delta > 0 : delta < 0;
              const deltaCls = !sig ? 'text-ink-muted' : better ? 'text-accent-measure' : 'text-accent-fault';
              const sign = delta > 0 ? '+' : '';
              const shape = !sig ? '＝' : better ? '↑' : '↓';
              return (
                <tr key={r.label} className="border-t border-line-subtle">
                  <th scope="row" className="px-2 py-1 text-left font-normal text-ink-muted">
                    {r.label}{r.unit ? ` (${r.unit})` : ''}
                  </th>
                  <td className="px-2 py-1 text-right font-mono text-ink-primary">{fmt(r.a)}</td>
                  <td className="px-2 py-1 text-right font-mono text-ink-primary">{fmt(r.b)}</td>
                  <td className={`px-2 py-1 text-right font-mono ${deltaCls}`}>
                    <span className="mr-0.5" aria-hidden="true">{shape}</span>
                    <span className="sr-only">{better ? t('assemblyWorkshop.diffBetter') : sig ? t('assemblyWorkshop.diffWorse') : t('assemblyWorkshop.diffUnchanged')} </span>
                    {sig ? `${sign}${fmt(delta)}` : '0.00'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-ink-muted">
        <span className="text-accent-measure">A</span> = {t('assemblyWorkshop.diffColoredA')} · <span className="text-accent-warn">B</span> = {t('assemblyWorkshop.diffColoredB')}。
        {t('assemblyWorkshop.diffFooterNote')}
      </p>
    </div>
  );
}

/** 单独导出图标版 close 占位（保留以备未来 modal 化；当前未用） */
export const _SnapshotDiffCloseIcon = X;
