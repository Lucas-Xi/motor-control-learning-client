import { useMemo, useRef, useState } from 'react';
import { Camera, Crown, Download, Eye, EyeOff, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useSimulationStore } from '../../store/simulationStore';
import { useSnapshotsStore, parseSnapshots, serializeSnapshots, type BenchSnapshot } from '../../store/snapshotsStore';
import { runBenchCycle } from './useBenchCycle';
import { downloadText, timestamp } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * 工况快照对比面板。
 *
 * 顶部：保存当前工况 / 清空全部
 * 中部：每列一个快照，每行一个 metric。COP 数值大者高亮 mint。
 * 表头操作：重命名 / 切换叠加 / 删除。
 *
 * 数据来源：基于 simulationStore 的 refrigeration + motor 参数即时跑 simulateCycle
 * 拿到 result，再写入 snapshotsStore。后续 P-h 叠加由父组件读 snapshotsStore.list 实现。
 */

interface MetricRow {
  key: string;
  label: string;
  /** 给定快照返回展示文本 */
  format: (s: BenchSnapshot) => string;
  /** 是否对该 metric 启用 max 高亮（mint） */
  highlightMax?: boolean;
  /** 提取数值用于挑出最大值 */
  numeric?: (s: BenchSnapshot) => number;
}

const METRICS: MetricRow[] = [
  { key: 'refrigerant', label: '制冷剂', format: (s) => s.refrigerant },
  {
    key: 'cop',
    label: 'COP',
    format: (s) => formatNumber(s.cop, 2),
    highlightMax: true,
    numeric: (s) => s.cop,
  },
  { key: 'qc', label: '制冷量 Q_c (kW)', format: (s) => formatNumber(s.Qc, 2) },
  { key: 'w', label: '输入功率 W (kW)', format: (s) => formatNumber(s.Wcomp, 2) },
  { key: 'pd', label: '排气压力 P_d (MPa)', format: (s) => formatNumber(s.states[1].P, 3) },
  { key: 'td', label: '排气温度 T_d (°C)', format: (s) => formatNumber(s.Tdischarge, 1) },
  { key: 'pr', label: '压比 P_d/P_s', format: (s) => formatNumber(s.pressureRatio, 2) },
];

export function SnapshotComparePanel() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const list = useSnapshotsStore((s) => s.list);
  const add = useSnapshotsStore((s) => s.add);
  const remove = useSnapshotsStore((s) => s.remove);
  const rename = useSnapshotsStore((s) => s.rename);
  const toggleOverlay = useSnapshotsStore((s) => s.toggleOverlay);
  const clear = useSnapshotsStore((s) => s.clear);
  const replaceAll = useSnapshotsStore((s) => s.replaceAll);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxCop = useMemo(() => {
    if (list.length === 0) return -Infinity;
    return list.reduce((acc, s) => (s.cop > acc ? s.cop : acc), -Infinity);
  }, [list]);

  const handleCapture = () => {
    const result = runBenchCycle(refrig, motor.rpm);
    add({
      refrigerant: refrig.refrigerant,
      states: result.states,
      cop: result.cop,
      Wcomp: result.Wcomp,
      Qc: result.Qc,
      pressureRatio: result.pressureRatio,
      Tdischarge: result.Tdischarge,
    });
  };

  const startRename = (snap: BenchSnapshot) => {
    setRenamingId(snap.id);
    setRenameDraft(snap.label);
  };

  const commitRename = () => {
    if (renamingId) {
      rename(renamingId, renameDraft);
    }
    setRenamingId(null);
    setRenameDraft('');
  };

  // 导出当前快照集为 JSON 文件下载（跨设备同步、或在论坛 / 群里贴给同行讨论）
  const handleExportJson = () => {
    if (list.length === 0) return;
    const json = serializeSnapshots(list);
    downloadText(`bench-snapshots-${timestamp()}.json`, json, 'application/json;charset=utf-8');
  };

  // 触发隐藏 file input 选文件
  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  // 解析文件 → 校验 schema → replaceAll
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const snapshots = parseSnapshots(text);
      // 自己可能多次试错导入；如果当前有快照，二次确认避免覆盖
      if (list.length > 0 && typeof window !== 'undefined') {
        const ok = window.confirm(`当前有 ${list.length} 个快照，导入将整体替换。继续？`);
        if (!ok) return;
      }
      replaceAll(snapshots);
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      // 清空 input value 让相同文件能再次触发 change
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card title="工况快照对比" eyebrow="snapshot diff" density="compact">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={handleCapture} className="!py-1.5">
          <Camera className="h-3.5 w-3.5" />
          保存当前工况为快照
        </Button>
        <Button
          variant="ghost"
          onClick={handleExportJson}
          disabled={list.length === 0}
          className="!py-1.5"
          title="把所有快照导出为 JSON 文件，可跨设备同步或贴到论坛 / 群里跟同行讨论"
        >
          <Download className="h-3.5 w-3.5" />
          导出 JSON
        </Button>
        <Button
          variant="ghost"
          onClick={handleImportClick}
          className="!py-1.5"
          title="导入 JSON 快照集（会替换当前列表）"
        >
          <Upload className="h-3.5 w-3.5" />
          导入 JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleImportFile}
        />
        <Button
          variant="ghost"
          onClick={clear}
          disabled={list.length === 0}
          className="!py-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空全部
        </Button>
        <span className="ml-auto text-caption text-ink-muted">
          已保存 {list.length} 组
        </span>
      </div>
      {importError && (
        <div role="alert" className="mb-2 rounded-md border border-accent-fault/40 bg-accent-fault/[0.06] px-2 py-1 text-caption text-accent-fault">
          导入失败：{importError}
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-subtle bg-bg-base px-3 py-6 text-center text-caption text-ink-muted">
          尚未保存工况，点上方按钮捕获当前状态
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-caption">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-surface px-2 py-2 text-left font-normal text-ink-muted">
                  metric
                </th>
                {list.map((snap) => (
                  <th
                    key={snap.id}
                    className="border-l border-line-subtle px-2 py-2 text-left align-top"
                    style={{ minWidth: 140 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                        style={{ background: snap.color }}
                        aria-hidden
                      />
                      {renamingId === snap.id ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            else if (e.key === 'Escape') {
                              setRenamingId(null);
                              setRenameDraft('');
                            }
                          }}
                          className="min-w-0 flex-1 rounded border border-accent-primary/40 bg-bg-base px-1.5 py-0.5 text-body text-ink-primary outline-none focus:border-accent-primary"
                        />
                      ) : (
                        <span
                          className="truncate font-medium text-ink-primary"
                          title={snap.label}
                        >
                          {snap.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startRename(snap)}
                        title="重命名"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-line-subtle text-ink-muted transition-colors hover:border-line-strong hover:text-ink-primary"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleOverlay(snap.id)}
                        title={snap.overlay ? '隐藏 P-h 叠加' : '显示 P-h 叠加'}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                          snap.overlay
                            ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                            : 'border-line-subtle text-ink-muted hover:border-line-strong hover:text-ink-primary'
                        }`}
                      >
                        {snap.overlay ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(snap.id)}
                        title="删除"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-line-subtle text-ink-muted transition-colors hover:border-accent-fault/50 hover:text-accent-fault"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-t border-line-subtle">
                  <td className="sticky left-0 z-10 bg-bg-surface px-2 py-1.5 text-ink-muted">
                    {m.label}
                  </td>
                  {list.map((snap) => {
                    const isMax =
                      m.highlightMax &&
                      m.numeric &&
                      list.length > 1 &&
                      Math.abs(m.numeric(snap) - maxCop) < 1e-9;
                    return (
                      <td
                        key={snap.id}
                        className={`border-l border-line-subtle px-2 py-1.5 font-mono ${
                          isMax ? 'text-accent-measure font-semibold' : 'text-ink-primary'
                        }`}
                      >
                        {/* 最高值用颜色 + 形状（皇冠图标）+ sr-only 三通道标注 */}
                        {isMax && (
                          <>
                            <Crown className="mr-1 inline h-3 w-3 align-text-bottom" aria-hidden="true" />
                            <span className="sr-only">本组最高 </span>
                          </>
                        )}
                        {m.format(snap)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
