import { create } from 'zustand';

/**
 * 云协作分享 store（V2 增量）。
 *
 * 与 V1 区别：V1 是把 token 拼到 URL 里点对点扔出去；V2 把 token 通过 GitHub Gist
 * 作为"免维护键值存储"在云端落盘 + 团队成员列表 + 跨标签页广播开关。
 *
 * 关键安全约束：
 *   - GitHub Personal Access Token（PAT）**仅存内存 + sessionStorage**，永不
 *     localStorage（避免长期残留被泄漏）；关闭浏览器即清除。
 *   - 团队成员列表只放 GitHub username（公共信息），不放 PAT。
 *   - 实时同步开关默认 false，避免后台多标签页静默同步状态。
 */

const PAT_SESSION_KEY = 'compbench:gist:pat';
const TEAM_SESSION_KEY = 'compbench:gist:team';
const SYNC_SESSION_KEY = 'compbench:gist:realtime-sync';

export interface TeamMember {
  /** GitHub 用户名（小写归一化后存储） */
  username: string;
  /** 用户自定义中文别名（可空） */
  alias?: string;
  /** 添加时间戳 */
  addedAt: number;
}

interface CloudShareState {
  /** PAT；空串表示未绑定。**仅存 sessionStorage**，不 persist 到 localStorage */
  pat: string;
  /** 测试连接后取得的 GitHub 登录名（小写） */
  ghLogin: string;
  /** 配额信息（最近一次 fetch 回包带的 X-RateLimit-*） */
  rateLimitRemaining: number;
  rateLimitLimit: number;
  /** 团队成员（最多 5 人） */
  team: TeamMember[];
  /** 跨标签页实时同步开关 */
  realtimeSync: boolean;
  /** 当前在线的标签页数（broadcast 收到 hello 时递增） */
  connectedTabs: number;

  setPat: (pat: string) => void;
  clearPat: () => void;
  setIdentity: (login: string, remaining: number, limit: number) => void;
  setRateLimit: (remaining: number, limit: number) => void;
  addTeamMember: (username: string, alias?: string) => { ok: boolean; reason?: string };
  removeTeamMember: (username: string) => void;
  setRealtimeSync: (on: boolean) => void;
  setConnectedTabs: (n: number) => void;
}

const MAX_TEAM = 5;

function readSession(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeSession(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage quota / disabled → 静默忽略，下次再读为空 */
  }
}

function parseTeam(raw: string): TeamMember[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: TeamMember[] = [];
    for (const m of arr) {
      if (m && typeof m === 'object') {
        const mm = m as Partial<TeamMember>;
        if (typeof mm.username === 'string' && mm.username.length > 0) {
          out.push({
            username: mm.username.toLowerCase(),
            alias: typeof mm.alias === 'string' ? mm.alias : undefined,
            addedAt: typeof mm.addedAt === 'number' ? mm.addedAt : Date.now(),
          });
        }
      }
    }
    return out.slice(0, MAX_TEAM);
  } catch {
    return [];
  }
}

function initialState(): Pick<CloudShareState, 'pat' | 'team' | 'realtimeSync'> {
  return {
    pat: readSession(PAT_SESSION_KEY),
    team: parseTeam(readSession(TEAM_SESSION_KEY)),
    realtimeSync: readSession(SYNC_SESSION_KEY) === '1',
  };
}

const seed = initialState();

export const useCloudShareStore = create<CloudShareState>((set, get) => ({
  pat: seed.pat,
  ghLogin: '',
  rateLimitRemaining: 0,
  rateLimitLimit: 0,
  team: seed.team,
  realtimeSync: seed.realtimeSync,
  connectedTabs: 1,

  setPat: (pat) => {
    const trimmed = (pat ?? '').trim();
    writeSession(PAT_SESSION_KEY, trimmed);
    set({ pat: trimmed, ghLogin: trimmed ? get().ghLogin : '' });
  },

  clearPat: () => {
    writeSession(PAT_SESSION_KEY, '');
    set({ pat: '', ghLogin: '', rateLimitRemaining: 0, rateLimitLimit: 0 });
  },

  setIdentity: (login, remaining, limit) =>
    set({ ghLogin: login.toLowerCase(), rateLimitRemaining: remaining, rateLimitLimit: limit }),

  setRateLimit: (remaining, limit) =>
    set({ rateLimitRemaining: remaining, rateLimitLimit: limit }),

  addTeamMember: (username, alias) => {
    const u = (username ?? '').trim().toLowerCase();
    if (!u) return { ok: false, reason: '用户名为空' };
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(u)) {
      return { ok: false, reason: 'GitHub 用户名格式不合法（字母数字 + 短横线，≤39 字符）' };
    }
    const existing = get().team;
    if (existing.some((m) => m.username === u)) {
      return { ok: false, reason: '该成员已在团队列表里' };
    }
    if (existing.length >= MAX_TEAM) {
      return { ok: false, reason: `团队成员上限 ${MAX_TEAM} 人，请先删除` };
    }
    const next: TeamMember[] = [
      ...existing,
      { username: u, alias: alias?.trim() || undefined, addedAt: Date.now() },
    ];
    writeSession(TEAM_SESSION_KEY, JSON.stringify(next));
    set({ team: next });
    return { ok: true };
  },

  removeTeamMember: (username) => {
    const u = (username ?? '').trim().toLowerCase();
    const next = get().team.filter((m) => m.username !== u);
    writeSession(TEAM_SESSION_KEY, JSON.stringify(next));
    set({ team: next });
  },

  setRealtimeSync: (on) => {
    writeSession(SYNC_SESSION_KEY, on ? '1' : '');
    set({ realtimeSync: on });
    if (!on) set({ connectedTabs: 1 });
  },

  setConnectedTabs: (n) => set({ connectedTabs: Math.max(1, Math.floor(n)) }),
}));

/** 测试用：重置 store 到初始状态（不动 sessionStorage） */
export function __resetCloudShareStoreForTests(): void {
  useCloudShareStore.setState({
    pat: '',
    ghLogin: '',
    rateLimitRemaining: 0,
    rateLimitLimit: 0,
    team: [],
    realtimeSync: false,
    connectedTabs: 1,
  });
}

/** 内部常量导出（给 broadcastShare / gistCloud 复用） */
export const CLOUD_SHARE_SESSION_KEYS = {
  pat: PAT_SESSION_KEY,
  team: TEAM_SESSION_KEY,
  sync: SYNC_SESSION_KEY,
} as const;
