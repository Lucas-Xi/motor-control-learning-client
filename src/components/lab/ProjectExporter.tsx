import { useEffect, useMemo, useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { useAssemblyProgressStore } from '../../store/assemblyProgressStore';
import { compressorBundles } from '../../content/compressorLibrary';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
} from '../../content/assemblyLibraries';
import {
  buildParamMappings,
  generateProject,
  packAsSingleText,
} from '../../content/stm32Export/projectGenerator';
import { guessMcuFamily } from '../../content/stm32Export/mcuTemplate';
import type { ExportFile, McuFamily, ProjectSlots, SimulationSnapshot } from '../../content/stm32Export/types';
import { downloadBinary, downloadText, timestamp } from '../../utils/download';
import { buildZip } from '../../utils/zipMinimal';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/**
 * STM32 项目导出器 —— 把"web 仿真当前 store + assembly 6 槽位"一键生成可读 C 工程骨架。
 *
 * 设计要点：
 *   - 不依赖 AssemblyWorkshop 内部 state：通过 useAssemblyProgressStore 拿最近一条 history（如有）
 *     的 slotIds 反查 6 个对象；没有时用各库的第一个条目兜底，UI 也提示"先点 Run 一次更准"。
 *   - 不打开就不算开销：mappings / files 都在 useMemo 里、仅当 isOpen=true 时才计算。
 *   - 多文件下载：默认"打包为单一 .txt"减少点击次数；用户可勾选"逐文件下载"。
 *   - 视觉令牌仅用 accent.primary / measure / warn / fault；不引入新依赖。
 */

const MCU_OPTIONS: Array<{ value: McuFamily; label: string; brief: TKey }> = [
  { value: 'STM32G4', label: 'STM32G4 (170MHz · CORDIC)', brief: 'lab.exporterMcuG4Brief' },
  { value: 'STM32F4', label: 'STM32F4 (168MHz)', brief: 'lab.exporterMcuF4Brief' },
  { value: 'STM32H7', label: 'STM32H7 (480MHz · DP-FPU)', brief: 'lab.exporterMcuH7Brief' },
];

/** 把 store 拍成纯快照对象（不持有 store 引用） */
function pickSnapshot(): SimulationSnapshot {
  const s = useSimulationStore.getState();
  return {
    motorBasics: { ...s.motorBasics },
    pid: { ...s.pid },
    foc: { ...s.foc },
    svpwm: { ...s.svpwm },
    inverter: { ...s.inverter },
    controlLoop: { ...s.controlLoop },
    startup: { ...s.startup },
  };
}

/** 根据 history 最新一条解析 slots，没有则用兜底 */
function resolveSlots(): ProjectSlots {
  const history = useAssemblyProgressStore.getState().history;
  const last = history[history.length - 1];
  const ids = last?.slotIds ?? {
    compressorBundleId: compressorBundles[0]?.id ?? 'unknown',
    inverterPartNo: inverterPlatforms[0]?.ipmPartNo ?? 'unknown',
    strategyId: controlStrategies[0]?.id ?? 'unknown',
    loadId: loadConditions[0]?.id ?? 'unknown',
    pfcId: pfcPlatforms[0]?.id ?? 'unknown',
    separatorId: liquidSeparators[0]?.id ?? 'unknown',
  };
  const bundle = compressorBundles.find((b) => b.id === ids.compressorBundleId) ?? compressorBundles[0];
  const inverter = inverterPlatforms.find((i) => i.ipmPartNo === ids.inverterPartNo) ?? inverterPlatforms[0];
  const strategy = controlStrategies.find((s) => s.id === ids.strategyId) ?? controlStrategies[0];
  const load = loadConditions.find((l) => l.id === ids.loadId) ?? loadConditions[0];
  const pfc = pfcPlatforms.find((p) => p.id === ids.pfcId) ?? pfcPlatforms[0];
  const separator = liquidSeparators.find((s) => s.id === ids.separatorId) ?? liquidSeparators[0];
  return {
    slotIds: ids,
    compressorLabel: `${bundle.compressor.brand} ${bundle.compressor.partNo}`,
    strategyLabel: strategy.name,
    loadLabel: load.name,
    pfcLabel: pfc.name,
    separatorLabel: separator.name,
    inverterMcuPartNo: inverter.mcuPartNo,
  };
}

export function ProjectExporter() {
  const { t, locale } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [mcuFamily, setMcuFamily] = useState<McuFamily>('STM32G4');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [packMode, setPackMode] = useState<'single-text' | 'multi-file' | 'zip'>('zip');

  // 打开时根据 inverter 选型推断 MCU family 默认值
  useEffect(() => {
    if (!isOpen) return;
    const slots = resolveSlots();
    setMcuFamily(guessMcuFamily(slots.inverterMcuPartNo));
  }, [isOpen]);

  // 只在打开时计算（性能）
  const { files, mappings, slots } = useMemo(() => {
    if (!isOpen) return { files: [] as ExportFile[], mappings: [], slots: null as ProjectSlots | null };
    const snapshot = pickSnapshot();
    const s = resolveSlots();
    const f = generateProject({ snapshot, slots: s, mcuFamily });
    const m = buildParamMappings({ snapshot, slots: s, mcuFamily });
    return { files: f, mappings: m, slots: s };
  }, [isOpen, mcuFamily]);

  const selectedFiles = useMemo(
    () => files.filter((f) => !excluded.has(f.path)),
    [files, excluded],
  );

  const toggleFile = (path: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleDownload = () => {
    if (selectedFiles.length === 0) return;
    const ts = timestamp();
    // 索引头标签表：EN 用半角标点；文件路径 / purpose 来自 generator，保持原样
    const L = locale === 'en-US'
      ? { indexTitle: 'STM32 project export index', fileList: 'File list' }
      : { indexTitle: 'STM32 工程导出索引', fileList: '文件清单' };
    if (packMode === 'single-text') {
      const text = packAsSingleText(selectedFiles);
      const indexLines = selectedFiles.map((f) => `  - ${f.path}  ${f.purpose}`).join('\n');
      const header = `# ${L.indexTitle}\n# Generated: ${ts}\n# MCU Family: ${mcuFamily}\n# ${L.fileList} (${selectedFiles.length}):\n${indexLines}\n`;
      downloadText(`stm32_${mcuFamily.toLowerCase()}_${ts}.txt`, header + text);
    } else if (packMode === 'zip') {
      // Phase C：用浏览器原生 + 自写 80 行 zip 头（STORE 模式）打成真 .zip
      const bin = buildZip(selectedFiles.map((f) => ({ path: f.path, content: f.content })));
      downloadBinary(`stm32_${mcuFamily.toLowerCase()}_${ts}.zip`, bin, 'application/zip');
    } else {
      // 逐文件下载
      selectedFiles.forEach((f, i) => {
        const safeName = f.path.replace(/\//g, '_');
        // 稍微错开避免浏览器只下第一个
        setTimeout(() => downloadText(`${mcuFamily}_${ts}_${safeName}`, f.content), i * 80);
      });
    }
  };

  if (!isOpen) {
    return (
      <div className="mt-3">
        <Card density="compact" tone="measure">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-body font-semibold text-ink-primary">{t('lab.exporterTeaserTitle')}</p>
              <p className="text-caption text-ink-secondary">
                {t('lab.exporterTeaserBody')}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => setIsOpen(true)}
              aria-label={t('lab.exporterOpenAria')}
            >
              {t('lab.exporterOpen')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Card
        density="default"
        tone="measure"
        eyebrow={t('lab.exporterEyebrow')}
        title={t('lab.exporterTitle')}
        action={
          <Button
            variant="ghost"
            onClick={() => setIsOpen(false)}
            aria-label={t('lab.exporterCloseAria')}
          >
            {t('lab.exporterCollapse')}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* 1. MCU 系列选择 */}
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
              {t('lab.exporterStepMcu')}
            </p>
            <div
              role="radiogroup"
              aria-label={t('lab.exporterMcuGroupAria')}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {MCU_OPTIONS.map((opt) => {
                const checked = mcuFamily === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setMcuFamily(opt.value)}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      checked
                        ? 'border-accent-primary/70 bg-accent-primary/15 text-ink-primary'
                        : 'border-line-subtle bg-bg-surface text-ink-secondary hover:border-line-strong'
                    }`}
                  >
                    <p className="text-body font-medium">{opt.label}</p>
                    <p className="text-caption text-ink-muted">{t(opt.brief)}</p>
                  </button>
                );
              })}
            </div>
            {slots && (
              <p className="mt-2 text-caption text-ink-muted">
                {t('lab.exporterSelectionSource')}{slots.compressorLabel} · {slots.strategyLabel} · MCU partNo
                <span className="font-mono text-ink-secondary"> {slots.inverterMcuPartNo}</span>
                {t('lab.exporterMatchedPrefix')}<span className="text-accent-measure">{mcuFamily}</span>{t('lab.exporterMatchedSuffix')}
              </p>
            )}
          </div>

          {/* 2. 文件清单 */}
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
              {t('lab.exporterStepFilesPrefix')}{selectedFiles.length} / {files.length}{t('lab.exporterStepFilesSuffix')}
            </p>
            <ul className="space-y-1.5">
              {files.map((f) => {
                const included = !excluded.has(f.path);
                return (
                  <li key={f.path}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line-subtle bg-bg-surface px-2.5 py-1.5 hover:border-line-strong">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleFile(f.path)}
                        aria-label={`${t('lab.exporterIncludeFileAria')} ${f.path}`}
                        className="mt-1 accent-accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-body text-ink-primary">{f.path}</span>
                        <span className="block text-caption text-ink-muted">{f.purpose}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 3. 参数对照表预览 */}
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
              {t('lab.exporterStepMappingsPrefix')}{mappings.length}{t('lab.exporterStepMappingsSuffix')}
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-line-subtle">
              <table className="w-full text-caption">
                <thead className="sticky top-0 bg-bg-surface text-ink-muted">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left">{t('lab.exporterColStoreField')}</th>
                    <th scope="col" className="px-2 py-1.5 text-right">{t('lab.exporterColValue')}</th>
                    <th scope="col" className="px-2 py-1.5 text-left">{t('lab.exporterColCMacro')}</th>
                    <th scope="col" className="px-2 py-1.5 text-right">{t('lab.exporterColCValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.cDefine} className="border-t border-line-subtle">
                      <td className="px-2 py-1 font-mono text-ink-secondary">{m.storeKey}</td>
                      <td className="px-2 py-1 text-right font-mono text-ink-primary">
                        {String(m.storeValue)}
                        {m.unit ? ` ${m.unit}` : ''}
                      </td>
                      <td className="px-2 py-1 font-mono text-accent-measure">{m.cDefine}</td>
                      <td className="px-2 py-1 text-right font-mono text-accent-primary">{m.cValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-caption text-ink-muted">
              {t('lab.exporterMappingNote')}
            </p>
          </div>

          {/* 4. 下载形式 + 触发按钮 */}
          <div className="flex flex-col gap-3 border-t border-line-subtle pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="radiogroup" aria-label={t('lab.exporterPackModeAria')} className="flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-caption text-ink-secondary">
                <input
                  type="radio"
                  name="packMode"
                  checked={packMode === 'zip'}
                  onChange={() => setPackMode('zip')}
                  className="accent-accent-primary"
                />
                {t('lab.exporterPackZip')}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-caption text-ink-secondary">
                <input
                  type="radio"
                  name="packMode"
                  checked={packMode === 'single-text'}
                  onChange={() => setPackMode('single-text')}
                  className="accent-accent-primary"
                />
                {t('lab.exporterPackSingleText')}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-caption text-ink-secondary">
                <input
                  type="radio"
                  name="packMode"
                  checked={packMode === 'multi-file'}
                  onChange={() => setPackMode('multi-file')}
                  className="accent-accent-primary"
                />
                {t('lab.exporterPackMultiPrefix')}{selectedFiles.length}{t('lab.exporterPackMultiSuffix')}
              </label>
            </div>
            <Button
              variant="primary"
              onClick={handleDownload}
              disabled={selectedFiles.length === 0}
              aria-label={`${t('lab.exporterDownloadAriaPrefix')}${selectedFiles.length}${t('lab.exporterDownloadAriaSuffix')}`}
            >
              {t('lab.exporterDownloadPrefix')}{selectedFiles.length}{t('lab.exporterDownloadSuffix')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
