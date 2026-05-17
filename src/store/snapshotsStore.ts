import { create } from 'zustand';
import type { CycleState } from '../simulation/math/vaporCycle';
import type { Refrigerant } from '../simulation/math/refrigerantProps';

/**
 * 工况快照 store。
 *
 * 用于"保存当前工况 → 切换参数 → 再保存 → 表格对比 / P-h 图叠加"的学习场景。
 * 不做持久化：刷新页面即清空，避免学员把陈旧工况误当作当前实验数据。
 */

export interface BenchSnapshot {
  id: string;
  label: string;
  /** 调色板颜色，用于在 P-h 叠加图和表头色块中标识同一条快照 */
  color: string;
  refrigerant: Refrigerant;
  states: readonly [CycleState, CycleState, CycleState, CycleState];
  cop: number;
  Wcomp: number;
  Qc: number;
  pressureRatio: number;
  Tdischarge: number;
  takenAt: number;
  /** 是否在 P-h 图上叠加显示 */
  overlay: boolean;
}

interface SnapshotsState {
  list: BenchSnapshot[];
  add: (
    snap: Omit<BenchSnapshot, 'id' | 'color' | 'takenAt' | 'overlay' | 'label'> & { label?: string },
  ) => void;
  remove: (id: string) => void;
  rename: (id: string, label: string) => void;
  toggleOverlay: (id: string) => void;
  clear: () => void;
  /** 整体替换 list（导入 JSON 时用）；保留旧 id 还是重新分配交给 caller */
  replaceAll: (list: BenchSnapshot[]) => void;
}

const PALETTE = ['#34d6ff', '#43f7b5', '#ffb84d', '#fb7185', '#a3e635', '#c084fc'];

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useSnapshotsStore = create<SnapshotsState>((set) => ({
  list: [],
  add: (snap) =>
    set((state) => {
      const idx = state.list.length;
      const label = snap.label && snap.label.trim().length > 0 ? snap.label : `工况 ${idx + 1}`;
      const next: BenchSnapshot = {
        id: genId(),
        label,
        color: PALETTE[idx % PALETTE.length],
        refrigerant: snap.refrigerant,
        states: snap.states,
        cop: snap.cop,
        Wcomp: snap.Wcomp,
        Qc: snap.Qc,
        pressureRatio: snap.pressureRatio,
        Tdischarge: snap.Tdischarge,
        takenAt: Date.now(),
        overlay: true,
      };
      return { list: [...state.list, next] };
    }),
  remove: (id) => set((state) => ({ list: state.list.filter((s) => s.id !== id) })),
  rename: (id, label) =>
    set((state) => ({
      list: state.list.map((s) => (s.id === id ? { ...s, label: label.trim() || s.label } : s)),
    })),
  toggleOverlay: (id) =>
    set((state) => ({
      list: state.list.map((s) => (s.id === id ? { ...s, overlay: !s.overlay } : s)),
    })),
  clear: () => set({ list: [] }),
  replaceAll: (list) => set({ list }),
}));

/** 序列化快照集合 → JSON 文本；包一层 schema 头方便升级兼容 */
export interface SnapshotsExportV1 {
  schema: 'compressor-bench-snapshots';
  version: 1;
  exportedAt: number;
  snapshots: BenchSnapshot[];
}

export function serializeSnapshots(list: BenchSnapshot[]): string {
  const payload: SnapshotsExportV1 = {
    schema: 'compressor-bench-snapshots',
    version: 1,
    exportedAt: Date.now(),
    snapshots: list,
  };
  return JSON.stringify(payload, null, 2);
}

/** 解析 JSON 文本 → 快照数组；校验 schema 与 version。失败抛出带可读信息的 Error。 */
export function parseSnapshots(text: string): BenchSnapshot[] {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  if (!obj || typeof obj !== 'object') throw new Error('JSON 顶层不是对象');
  const o = obj as Partial<SnapshotsExportV1>;
  if (o.schema !== 'compressor-bench-snapshots') {
    throw new Error('JSON schema 不匹配（期望 compressor-bench-snapshots）');
  }
  if (o.version !== 1) {
    throw new Error(`JSON 版本不兼容（导入 v${o.version}，当前支持 v1）`);
  }
  if (!Array.isArray(o.snapshots)) throw new Error('snapshots 字段不是数组');
  // 基本结构校验：states 4 项 + 必需 number 字段
  for (const s of o.snapshots as BenchSnapshot[]) {
    if (!s.id || !s.label) throw new Error('某快照缺 id/label');
    if (!Array.isArray(s.states) || s.states.length !== 4) {
      throw new Error('某快照 states 数组长度 ≠ 4');
    }
    for (const field of ['cop', 'Wcomp', 'Qc', 'pressureRatio', 'Tdischarge'] as const) {
      if (typeof s[field] !== 'number') throw new Error(`某快照字段 ${field} 不是 number`);
    }
  }
  return o.snapshots as BenchSnapshot[];
}
