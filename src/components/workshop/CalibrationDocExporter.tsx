import { useState } from 'react';
import { FileText, Download, Archive } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { useAssemblyProgressStore } from '../../store/assemblyProgressStore';
import { useChallengeStore } from '../../store/challengeStore';
import { compressorBundles } from '../../content/compressorLibrary';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
} from '../../content/assemblyLibraries';
import { parameterSchemas } from '../../content/parameterSchemas';
import { downloadText, downloadBinary, timestamp } from '../../utils/download';
import { buildZip } from '../../utils/zipMinimal';
import { generateProject } from '../../content/stm32Export/projectGenerator';
import { guessMcuFamily } from '../../content/stm32Export/mcuTemplate';
import type { McuFamily } from '../../content/stm32Export/types';
import { Button } from '../ui/Button';

/**
 * 标定文档生成器（Phase C · 任务 4）。
 *
 * 把当前 store 全量参数 + 6 slot 选型 + 通关挑战 拍成一份 **Markdown 标定单**。
 * 工程师拿这份 doc 给电气主管签字、塞进电控柜抽屉里都能直接对照量。
 *
 * 结构：
 *  1) 头部：项目名 / 日期 / MCU 型号 / 压缩机型号
 *  2) 参数表：按 schema 拍出"参数名 / 当前值 / 单位 / 推荐范围 / 是否在范围内"
 *  3) 评分：当前最近一次 history 的 verdict + 4 KPI
 *  4) 挑战通关：useChallengeStore 的记录
 *
 * 同时支持把"标定 .md + STM32 .c 工程"打成真 .zip 一键下发。
 */

type SliceKey =
  | 'motorBasics' | 'pid' | 'foc' | 'svpwm' | 'inverter' | 'controlLoop' | 'startup' | 'apf' | 'refrigeration';

const TARGET_SLICES: SliceKey[] = [
  'motorBasics', 'foc', 'pid', 'controlLoop', 'svpwm', 'inverter', 'apf', 'refrigeration',
];

interface ParamRow {
  slice: SliceKey;
  key: string;
  label: string;
  value: number | string | boolean;
  unit: string;
  min: number;
  max: number;
  inRange: boolean;
}

function collectRows(): ParamRow[] {
  const s = useSimulationStore.getState();
  const sliceData: Record<SliceKey, Record<string, unknown>> = {
    motorBasics: s.motorBasics as unknown as Record<string, unknown>,
    pid: s.pid as unknown as Record<string, unknown>,
    foc: s.foc as unknown as Record<string, unknown>,
    svpwm: s.svpwm as unknown as Record<string, unknown>,
    inverter: s.inverter as unknown as Record<string, unknown>,
    controlLoop: s.controlLoop as unknown as Record<string, unknown>,
    startup: s.startup as unknown as Record<string, unknown>,
    apf: s.apf as unknown as Record<string, unknown>,
    refrigeration: s.refrigeration as unknown as Record<string, unknown>,
  };
  const rows: ParamRow[] = [];
  // 通过 parameterSchemas 反查"推荐范围"（schema 的 min/max 即作者标注的安全区）
  for (const schema of Object.values(parameterSchemas)) {
    if (!schema) continue;
    const slice = schema.sliceKey as SliceKey;
    if (!TARGET_SLICES.includes(slice)) continue;
    const sliceObj = sliceData[slice];
    if (!sliceObj) continue;
    for (const item of schema.sliders) {
      const v = sliceObj[item.key];
      if (typeof v === 'number') {
        const inRange = v >= item.min && v <= item.max;
        rows.push({
          slice,
          key: item.key,
          label: item.label,
          value: v,
          unit: (item.unit ?? '').trim(),
          min: item.min,
          max: item.max,
          inRange,
        });
      }
    }
  }
  return rows;
}

function resolveSlots() {
  const history = useAssemblyProgressStore.getState().history;
  const last = history[history.length - 1];
  return last;
}

function buildMarkdown(projectName: string, mcuFamily: McuFamily): string {
  const last = resolveSlots();
  const rows = collectRows();
  const challenges = useChallengeStore.getState().records;

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const compressorLabel = last
    ? (() => {
        const b = compressorBundles.find((x) => x.id === last.slotIds.compressorBundleId);
        return b ? `${b.compressor.brand} ${b.compressor.partNo} (${b.compressor.hp}HP · ${b.compressor.refrigerant})` : last.slotIds.compressorBundleId;
      })()
    : '（未运行过 → 请到工作台跑一次"运行整机仿真"）';
  const strategyLabel = last ? controlStrategies.find((s) => s.id === last.slotIds.strategyId)?.name ?? last.slotIds.strategyId : '—';
  const loadLabel = last ? loadConditions.find((l) => l.id === last.slotIds.loadId)?.name ?? last.slotIds.loadId : '—';
  const pfcLabel = last ? pfcPlatforms.find((p) => p.id === last.slotIds.pfcId)?.name ?? last.slotIds.pfcId : '—';
  const sepLabel = last ? liquidSeparators.find((s) => s.id === last.slotIds.separatorId)?.name ?? last.slotIds.separatorId : '—';
  const inverterLabel = last
    ? (() => {
        const i = inverterPlatforms.find((x) => x.ipmPartNo === last.slotIds.inverterPartNo);
        return i ? `${i.ipmBrand} ${i.ipmPartNo} (${i.ratedCurrentA}A/${i.ratedBusV}V)` : last.slotIds.inverterPartNo;
      })()
    : '—';

  const head = [
    `# ${projectName} · 标定单`,
    '',
    '| 项目 | 值 |',
    '| --- | --- |',
    `| 日期 | ${dateStr} |`,
    `| MCU 型号 | ${mcuFamily} |`,
    `| 压缩机 | ${compressorLabel} |`,
    `| 变频器平台 | ${inverterLabel} |`,
    `| 控制策略 | ${strategyLabel} |`,
    `| 工况负载 | ${loadLabel} |`,
    `| PFC 前级 | ${pfcLabel} |`,
    `| 液气分离器 | ${sepLabel} |`,
    '',
  ];

  // 参数表 - 按 slice 分组
  const sliceTitles: Record<SliceKey, string> = {
    motorBasics: '电机模型 (motorBasics)',
    foc: 'FOC 电流环 (foc)',
    pid: 'PID 调速 (pid)',
    controlLoop: '三闭环 (controlLoop)',
    svpwm: 'SVPWM 调制 (svpwm)',
    inverter: '逆变器 (inverter)',
    startup: '启动状态机 (startup)',
    apf: 'PFC 前级 (apf)',
    refrigeration: '制冷循环 (refrigeration)',
  };
  const paramSections: string[] = ['## 关键参数标定表', ''];
  for (const slice of TARGET_SLICES) {
    const sliceRows = rows.filter((r) => r.slice === slice);
    if (sliceRows.length === 0) continue;
    paramSections.push(`### ${sliceTitles[slice]}`, '');
    paramSections.push('| 参数 | 当前值 | 单位 | 推荐范围 | 是否在区间 |');
    paramSections.push('| --- | ---: | --- | --- | :---: |');
    for (const r of sliceRows) {
      const valueStr = typeof r.value === 'number'
        ? (Math.abs(r.value) < 0.01 && r.value !== 0 ? r.value.toExponential(2) : r.value.toFixed(3))
        : String(r.value);
      paramSections.push(
        `| ${r.label} (\`${r.key}\`) | ${valueStr} | ${r.unit || '—'} | ${r.min} ~ ${r.max} | ${r.inRange ? '✓ 在区间' : '✗ 超界'} |`,
      );
    }
    paramSections.push('');
  }

  // 评分 + 当前组合 verdict
  const verdictSection: string[] = ['## 当前组合评分', ''];
  if (last) {
    const verdictText = last.verdict === 'pass' ? '✓ 通过'
      : last.verdict === 'pass-warn' ? '⚠ 通过 · 有告警'
      : '✗ 不通过';
    verdictSection.push('| KPI | 值 |', '| --- | ---: |');
    verdictSection.push(`| 总判定 | **${verdictText}** |`);
    verdictSection.push(`| COP | ${last.cop.toFixed(2)} |`);
    verdictSection.push(`| 排气温度 Td | ${last.Tdischarge.toFixed(1)} °C |`);
    verdictSection.push(`| 达标 | ${last.reachedTarget ? '✓ 是' : '✗ 否'} |`);
    verdictSection.push(`| 故障数 | ${last.faultCount} |`);
    verdictSection.push(`| 告警数 | ${last.warnCount} |`);
    verdictSection.push('');
  } else {
    verdictSection.push('（暂无运行记录。请到工作台执行"运行整机仿真"后再生成。）', '');
  }

  // 挑战通关
  const challengeSection: string[] = ['## 挑战通关记录', ''];
  const solvedEntries = Object.entries(challenges).filter(([, r]) => r.solved);
  if (solvedEntries.length === 0) {
    challengeSection.push('（暂无通关记录）', '');
  } else {
    challengeSection.push('| 挑战 ID | 尝试次数 | 最优指标 | 首次通关时间 |', '| --- | ---: | ---: | --- |');
    for (const [id, r] of solvedEntries) {
      const passedAt = r.firstPassedAt ? new Date(r.firstPassedAt).toISOString().slice(0, 19).replace('T', ' ') : '—';
      const best = r.bestValue == null ? '—' : r.bestValue.toFixed(3);
      challengeSection.push(`| \`${id}\` | ${r.attempts} | ${best} | ${passedAt} |`);
    }
    challengeSection.push('');
  }

  const footer: string[] = [
    '---',
    '',
    `_自动生成 · 电机控制学习客户端 · ${dateStr}_`,
    '',
    '> 此文件作为标定基线。如要复现，在工作台还原"压缩机 + 变频器 + 控制策略 + 工况 + PFC + 分离器"6 项选型，',
    '> 然后按"关键参数标定表"逐项校对 store 滑块值即可。**所有推荐范围来自 `parameterSchemas.ts`**。',
  ];

  return [...head, ...paramSections, ...verdictSection, ...challengeSection, ...footer].join('\n');
}

export function CalibrationDocExporter() {
  const [projectName, setProjectName] = useState('压缩机变频器标定');
  const [mcuFamily, setMcuFamily] = useState<McuFamily>(() => {
    const last = resolveSlots();
    if (!last) return 'STM32G4';
    const inv = inverterPlatforms.find((x) => x.ipmPartNo === last.slotIds.inverterPartNo);
    return guessMcuFamily(inv?.mcuPartNo ?? 'STM32G431');
  });

  const handleDownloadMd = () => {
    const md = buildMarkdown(projectName, mcuFamily);
    const safeName = projectName.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 32) || 'calibration';
    downloadText(`${safeName}_${timestamp()}.md`, md, 'text/markdown;charset=utf-8');
  };

  const handleDownloadZip = () => {
    // 标定单 + STM32 工程 一起打 zip
    const md = buildMarkdown(projectName, mcuFamily);
    const sim = useSimulationStore.getState();
    const last = resolveSlots();
    const bundle = last ? compressorBundles.find((b) => b.id === last.slotIds.compressorBundleId) : undefined;
    const inv = last ? inverterPlatforms.find((i) => i.ipmPartNo === last.slotIds.inverterPartNo) : undefined;
    const strat = last ? controlStrategies.find((s) => s.id === last.slotIds.strategyId) : undefined;
    const load = last ? loadConditions.find((l) => l.id === last.slotIds.loadId) : undefined;
    const pfc = last ? pfcPlatforms.find((p) => p.id === last.slotIds.pfcId) : undefined;
    const sep = last ? liquidSeparators.find((s) => s.id === last.slotIds.separatorId) : undefined;

    const slotIds = last?.slotIds ?? {
      compressorBundleId: compressorBundles[0]?.id ?? 'unknown',
      inverterPartNo: inverterPlatforms[0]?.ipmPartNo ?? 'unknown',
      strategyId: controlStrategies[0]?.id ?? 'unknown',
      loadId: loadConditions[0]?.id ?? 'unknown',
      pfcId: pfcPlatforms[0]?.id ?? 'unknown',
      separatorId: liquidSeparators[0]?.id ?? 'unknown',
    };

    const files = generateProject({
      snapshot: {
        motorBasics: { ...sim.motorBasics },
        pid: { ...sim.pid },
        foc: { ...sim.foc },
        svpwm: { ...sim.svpwm },
        inverter: { ...sim.inverter },
        controlLoop: { ...sim.controlLoop },
        startup: { ...sim.startup },
      },
      slots: {
        slotIds,
        compressorLabel: bundle ? `${bundle.compressor.brand} ${bundle.compressor.partNo}` : slotIds.compressorBundleId,
        strategyLabel: strat?.name ?? slotIds.strategyId,
        loadLabel: load?.name ?? slotIds.loadId,
        pfcLabel: pfc?.name ?? slotIds.pfcId,
        separatorLabel: sep?.name ?? slotIds.separatorId,
        inverterMcuPartNo: inv?.mcuPartNo ?? 'unknown',
      },
      mcuFamily,
    });

    const safeName = projectName.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 32) || 'calibration';
    const zipFiles = [
      { path: 'CALIBRATION.md', content: md },
      ...files.map((f) => ({ path: f.path, content: f.content })),
    ];
    const bin = buildZip(zipFiles);
    downloadBinary(`${safeName}_${timestamp()}.zip`, bin, 'application/zip');
  };

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
        <FileText className="h-3.5 w-3.5 text-accent-measure" />
        <span>标定文档生成器 · Markdown + 真 .zip</span>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-caption">
          <span className="mb-0.5 block text-ink-muted">项目名（出现在 .md 头部）</span>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            aria-label="项目名"
            maxLength={48}
            className="w-full rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-body text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </label>
        <label className="block text-caption">
          <span className="mb-0.5 block text-ink-muted">MCU 型号</span>
          <select
            value={mcuFamily}
            onChange={(e) => setMcuFamily(e.target.value as McuFamily)}
            aria-label="MCU 型号"
            className="w-full rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-body text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
          >
            <option value="STM32G4">STM32G4</option>
            <option value="STM32F4">STM32F4</option>
            <option value="STM32H7">STM32H7</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={handleDownloadMd}
          aria-label="下载 Markdown 标定单"
        >
          <Download className="h-3.5 w-3.5" />
          下载 .md 标定单
        </Button>
        <Button
          variant="primary"
          onClick={handleDownloadZip}
          aria-label="把标定单 + STM32 工程打成 真 zip 一键下载"
        >
          <Archive className="h-3.5 w-3.5" />
          下载 .zip（标定单 + STM32 工程）
        </Button>
      </div>

      <p className="mt-2 text-[10px] text-ink-muted">
        .md 含：头部信息 / 9 个 slice × 全参数表（推荐范围对照） / 当前组合 verdict / 挑战通关记录。
        .zip 是用浏览器原生 API 写的 **真 ZIP（STORE 模式，无压缩）**，Windows 资源管理器 / 7-Zip 都能直接打开。
      </p>
    </div>
  );
}
