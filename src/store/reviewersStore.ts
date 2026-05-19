import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 多审阅者（V3）。
 *
 * 为什么单开 store（而不是塞进 cloudShareStore.team）？
 *   - cloudShareStore.team 是"GitHub username 公共信息列表，团队时间线用"。
 *   - 这里的"reviewer"是评论着色 / 个性化身份标识；不强制对应 GitHub 账号，可只是
 *     用户起的别名（"小张"、"机电组"）。
 *   - 持久化策略不同：team 走 sessionStorage（关闭浏览器清空，避免 PAT 旁路），
 *     reviewers 仅是颜色/别名，没有敏感信息，走 localStorage 长期保留。
 *
 * 边界：
 *   - reviewers 上限 12 人（避免颜色板被耗尽 + UI 拥挤）
 *   - 每个 reviewer 自选颜色（accent token 名 + 任意 hex）；颜色用于评论左侧细线
 *     和头像首字着色
 *   - PAT 字段是可选的，仅作 UI 标识（已绑定 / 未绑定徽章）；**不会**真的拿去调
 *     GitHub API（避免不同 reviewer PAT 混淆配额）
 */

export interface Reviewer {
  /** 显示名（别名 / GitHub login，必填且 ≤ 24 字） */
  name: string;
  /** 颜色：可以是 CSS 颜色字符串 / 任意 hex / token 名（UI 直接套到 style.color） */
  color: string;
  /** 可选 PAT 标记（**不存明文**，仅记长度做"已绑定"指示） */
  hasPat?: boolean;
  /** 加入时间戳，排序用 */
  addedAt: number;
}

interface ReviewersState {
  reviewers: Reviewer[];
  /** 当前选中的 reviewer name（用作评论作者；用户也可以自己手填） */
  activeReviewer: string;

  addReviewer: (name: string, color: string, hasPat?: boolean) => { ok: boolean; reason?: string };
  removeReviewer: (name: string) => void;
  setActive: (name: string) => void;
  updateColor: (name: string, color: string) => void;
  resetAll: () => void;
}

export const MAX_REVIEWERS = 12;

/** 一组健康的预设色（与 Tailwind accent 板对齐 + 几款补充色） */
export const REVIEWER_PALETTE = [
  '#22d3ee', // cyan
  '#34d6ff', // primary
  '#4ade80', // mint
  '#fbbf24', // amber
  '#fb7185', // rose
  '#a78bfa', // violet
  '#f472b6', // pink
  '#60a5fa', // blue
  '#facc15', // yellow
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#94a3b8', // slate
] as const;

function normalizeName(s: string): string {
  return (s ?? '').trim().slice(0, 24);
}

function isValidColor(c: string): boolean {
  if (typeof c !== 'string') return false;
  const v = c.trim();
  if (!v) return false;
  // 接受 #RGB / #RRGGBB / rgb()/rgba() / 命名色（不强校验，CSS 自己吃）
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) || /^[a-z]+$/i.test(v) || /^rgba?\(/i.test(v);
}

/** 安全 storage：jsdom / node 没有 localStorage 时退化到 in-memory，避免 persist 抛错 */
function safeStorage() {
  if (typeof localStorage !== 'undefined') {
    try {
      // 探针：写一次马上删
      localStorage.setItem('__compbench_probe__', '1');
      localStorage.removeItem('__compbench_probe__');
      return localStorage;
    } catch {
      /* fallthrough */
    }
  }
  const mem: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = String(v);
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
  } as Storage;
}

export const useReviewersStore = create<ReviewersState>()(
  persist(
    (set, get) => ({
      reviewers: [],
      activeReviewer: '',

      addReviewer: (name, color, hasPat) => {
        const n = normalizeName(name);
        if (!n) return { ok: false, reason: '名字为空' };
        if (!isValidColor(color)) return { ok: false, reason: '颜色格式不合法（用 #RRGGBB / 命名色 / rgba()）' };
        const cur = get().reviewers;
        if (cur.some((r) => r.name.toLowerCase() === n.toLowerCase())) {
          return { ok: false, reason: '该名字已存在' };
        }
        if (cur.length >= MAX_REVIEWERS) {
          return { ok: false, reason: `审阅者上限 ${MAX_REVIEWERS} 人` };
        }
        const next: Reviewer = { name: n, color: color.trim(), hasPat: !!hasPat, addedAt: Date.now() };
        set({ reviewers: [...cur, next], activeReviewer: get().activeReviewer || n });
        return { ok: true };
      },

      removeReviewer: (name) => {
        const n = normalizeName(name).toLowerCase();
        set((state) => {
          const filtered = state.reviewers.filter((r) => r.name.toLowerCase() !== n);
          const stillActive = filtered.find((r) => r.name.toLowerCase() === state.activeReviewer.toLowerCase());
          return {
            reviewers: filtered,
            activeReviewer: stillActive ? state.activeReviewer : filtered[0]?.name ?? '',
          };
        });
      },

      setActive: (name) => {
        const n = normalizeName(name);
        if (!n) {
          set({ activeReviewer: '' });
          return;
        }
        // 允许设为非列表内的名字（手填作者）
        set({ activeReviewer: n });
      },

      updateColor: (name, color) => {
        if (!isValidColor(color)) return;
        const n = normalizeName(name).toLowerCase();
        set((state) => ({
          reviewers: state.reviewers.map((r) =>
            r.name.toLowerCase() === n ? { ...r, color: color.trim() } : r,
          ),
        }));
      },

      resetAll: () => set({ reviewers: [], activeReviewer: '' }),
    }),
    {
      name: 'compbench:reviewers:v1',
      storage: createJSONStorage(() => safeStorage()),
      version: 1,
      partialize: (state) => ({
        reviewers: state.reviewers,
        activeReviewer: state.activeReviewer,
      }),
    },
  ),
);

/** 测试用：重置 store + 清空持久化 */
export function __resetReviewersStoreForTests(): void {
  useReviewersStore.setState({ reviewers: [], activeReviewer: '' });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('compbench:reviewers:v1');
    }
  } catch {
    /* ignore */
  }
}

/** 按名字查找一条 reviewer；找不到返回 undefined（不抛） */
export function lookupReviewer(name: string): Reviewer | undefined {
  const n = normalizeName(name).toLowerCase();
  if (!n) return undefined;
  return useReviewersStore.getState().reviewers.find((r) => r.name.toLowerCase() === n);
}

/** 给定一个作者名，返回该作者的颜色（找不到走 fallback） */
export function colorForAuthor(name: string, fallback = '#34d6ff'): string {
  return lookupReviewer(name)?.color ?? fallback;
}
