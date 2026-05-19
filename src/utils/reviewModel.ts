/**
 * 数字孪生 V3 · PR-style review 数据模型。
 *
 * 数据落在 gist 的第三个 file `review-comments.json`，与 V2 的 `snapshot.json` /
 * `comments.md` 共存：
 *   - snapshot.json     —— 紧凑参数 token（V2 既有）
 *   - comments.md       —— 粗粒度"对整个 snapshot 留言"（V2 既有，保留兼容）
 *   - review-comments.json —— 本文件定义的"行级 + 建议改动 + thread + 状态"
 *
 * 设计取舍：
 *   - 每条评论锚定 `parameterPath`（如 `foc.kp`、`motorBasics.polePairs`），相当于
 *     GitHub PR 的"行号 + 文件"。
 *   - 评论之间通过 `parentId` 串成 thread；顶层条目 parentId = null。
 *   - 可附带 `suggestion: { parameterPath, newValue, reason }`，相当于 PR 的
 *     "Suggest changes"；接收方一键 apply。
 *   - 状态机：open → closed → merged。任何状态都可以 reopen（→ open）。
 *   - **不**调用 simulationStore：apply 时由调用方注入 `updaters`，避免 utils ←→
 *     store 循环依赖；也方便 vitest 隔离测试。
 *
 * 安全/校验：
 *   - parameterPath 必须形如 `<slice>.<field>`，slice ∈ 17 个白名单 slice（与
 *     snapshotCodec 一致）；field 必须是非空字符串。
 *   - suggestion.newValue 必须是 number / boolean / string（不允许 object/array
 *     绕过校验）。
 *   - 每条 entry id 由 ts + 短随机后缀生成，便于去重 / 排序。
 */

/** 17 个 slice 白名单（与 snapshotCodec.SIM_SHORT_KEYS 一一对应） */
export const REVIEW_SLICES = [
  'motorBasics',
  'threePhase',
  'clarke',
  'park',
  'pid',
  'svpwm',
  'inverter',
  'sensorless',
  'weakField',
  'fault',
  'controlLoop',
  'foc',
  'hfi',
  'startup',
  'apf',
  'refrigeration',
] as const;

export type ReviewSlice = (typeof REVIEW_SLICES)[number];

/** 评论锚点位置：参数 / KPI 行 / 总评（用于不绑定具体字段的"verdict"评论） */
export type ReviewLine = 'parameter' | 'kpi' | 'verdict';

/** 评论状态机：open ↔ closed ↔ merged */
export type ReviewStatus = 'open' | 'closed' | 'merged';

/** 一条建议改动（PR-style suggestion） */
export interface ReviewSuggestion {
  /** 建议改动的目标参数路径（必须与 entry.parameterPath 同 slice，但可以指向同 slice 的不同字段） */
  parameterPath: string;
  /** 建议的新值；只接受标量类型 */
  newValue: number | boolean | string;
  /** 给出建议的理由，可空 */
  reason?: string;
}

/** 一条评论 entry（threaded） */
export interface ReviewEntry {
  /** 短 id：ts + 随机后缀，便于排序和去重 */
  id: string;
  /** 父评论 id；顶层条目为 null */
  parentId: string | null;
  /** 锚定的参数路径，形如 `foc.kp`；verdict 行可以是 `__verdict` */
  parameterPath: string;
  /** 锚点位置 */
  line: ReviewLine;
  /** 作者：通常是 GitHub login / reviewers 别名 */
  author: string;
  /** ISO 8601 时间戳 */
  ts: string;
  /** Markdown 正文 */
  body: string;
  /** 可选的建议改动；apply 后会被收件方调用 store update 函数应用 */
  suggestion?: ReviewSuggestion;
  /** 建议是否已被应用（应用后由系统追加 reply "✓ Applied by @owner"） */
  suggestionApplied?: boolean;
}

/** review-comments.json 的顶层结构 */
export interface ReviewDocument {
  schemaVersion: 1;
  /** 当前状态（open / closed / merged） */
  status: ReviewStatus;
  /** 修订计数（每次 submit changes +1，UI 显示用） */
  revision: number;
  /** 所有评论 entry（已按 ts 排序） */
  entries: ReviewEntry[];
  /** 最近一次更新时间 */
  updatedAt: string;
}

export const REVIEW_DOC_FILENAME = 'review-comments.json' as const;
export const REVIEW_SCHEMA_VERSION = 1 as const;

/** 创建一份空的 ReviewDocument */
export function createEmptyReviewDoc(): ReviewDocument {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    status: 'open',
    revision: 0,
    entries: [],
    updatedAt: new Date(0).toISOString(),
  };
}

/** 把任意 JSON 字符串安全解析成 ReviewDocument；非法时返回空 doc */
export function parseReviewDoc(raw: string): ReviewDocument {
  if (typeof raw !== 'string' || !raw.trim()) return createEmptyReviewDoc();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createEmptyReviewDoc();
  }
  if (!parsed || typeof parsed !== 'object') return createEmptyReviewDoc();
  const p = parsed as Partial<ReviewDocument>;
  if (p.schemaVersion !== REVIEW_SCHEMA_VERSION) return createEmptyReviewDoc();
  const entries: ReviewEntry[] = [];
  if (Array.isArray(p.entries)) {
    for (const e of p.entries) {
      const norm = normalizeEntry(e);
      if (norm) entries.push(norm);
    }
  }
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    status: isReviewStatus(p.status) ? p.status : 'open',
    revision: typeof p.revision === 'number' && Number.isFinite(p.revision) ? Math.max(0, Math.floor(p.revision)) : 0,
    entries,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date(0).toISOString(),
  };
}

export function serializeReviewDoc(doc: ReviewDocument): string {
  return JSON.stringify(
    {
      schemaVersion: REVIEW_SCHEMA_VERSION,
      status: doc.status,
      revision: doc.revision,
      entries: doc.entries.slice().sort(sortByTs),
      updatedAt: doc.updatedAt,
    },
    null,
    2,
  );
}

function sortByTs(a: ReviewEntry, b: ReviewEntry): number {
  return (a.ts || '').localeCompare(b.ts || '');
}

function isReviewStatus(s: unknown): s is ReviewStatus {
  return s === 'open' || s === 'closed' || s === 'merged';
}

function normalizeEntry(e: unknown): ReviewEntry | null {
  if (!e || typeof e !== 'object') return null;
  const ee = e as Partial<ReviewEntry>;
  if (typeof ee.id !== 'string' || !ee.id) return null;
  if (typeof ee.author !== 'string') return null;
  if (typeof ee.body !== 'string') return null;
  const parameterPath = typeof ee.parameterPath === 'string' ? ee.parameterPath : '';
  const validPath = parameterPath === '__verdict' || isValidParameterPath(parameterPath);
  if (!validPath) return null;
  const line: ReviewLine =
    ee.line === 'parameter' || ee.line === 'kpi' || ee.line === 'verdict' ? ee.line : 'parameter';
  const suggestion = normalizeSuggestion(ee.suggestion);
  return {
    id: ee.id,
    parentId: typeof ee.parentId === 'string' ? ee.parentId : null,
    parameterPath,
    line,
    author: ee.author,
    ts: typeof ee.ts === 'string' ? ee.ts : new Date().toISOString(),
    body: ee.body,
    ...(suggestion ? { suggestion } : {}),
    ...(ee.suggestionApplied ? { suggestionApplied: true } : {}),
  };
}

function normalizeSuggestion(s: unknown): ReviewSuggestion | null {
  if (!s || typeof s !== 'object') return null;
  const ss = s as Partial<ReviewSuggestion>;
  if (typeof ss.parameterPath !== 'string' || !isValidParameterPath(ss.parameterPath)) return null;
  const v = ss.newValue;
  if (typeof v !== 'number' && typeof v !== 'boolean' && typeof v !== 'string') return null;
  return {
    parameterPath: ss.parameterPath,
    newValue: v,
    ...(typeof ss.reason === 'string' && ss.reason ? { reason: ss.reason } : {}),
  };
}

/** 校验 parameterPath 形如 `<slice>.<field>` 且 slice ∈ 白名单 */
export function isValidParameterPath(p: string): boolean {
  if (typeof p !== 'string' || !p) return false;
  const idx = p.indexOf('.');
  if (idx < 1 || idx === p.length - 1) return false;
  const slice = p.slice(0, idx);
  const field = p.slice(idx + 1);
  if (!REVIEW_SLICES.includes(slice as ReviewSlice)) return false;
  // 字段名：字母数字下划线，禁止 dot/bracket（避免 path injection）
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return false;
  return true;
}

/** 拆分 `slice.field` 返回 [slice, field]；非法返回 null */
export function splitParameterPath(p: string): [ReviewSlice, string] | null {
  if (!isValidParameterPath(p)) return null;
  const idx = p.indexOf('.');
  return [p.slice(0, idx) as ReviewSlice, p.slice(idx + 1)];
}

/** 生成短 id（ts 毫秒 36 进制 + 4 字符随机） */
export function generateEntryId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${now.toString(36)}-${rand}`;
}

/** 在 doc 上追加一条评论，返回**新 doc**（不可变） */
export function appendEntry(doc: ReviewDocument, draft: Omit<ReviewEntry, 'id' | 'ts'> & { id?: string; ts?: string }): ReviewDocument {
  const ts = draft.ts ?? new Date().toISOString();
  const id = draft.id ?? generateEntryId(Date.parse(ts) || Date.now());
  const normalized = normalizeEntry({ ...draft, id, ts });
  if (!normalized) {
    throw new Error(`非法评论：${JSON.stringify(draft).slice(0, 120)}`);
  }
  return {
    ...doc,
    entries: [...doc.entries, normalized],
    updatedAt: ts,
  };
}

/** 删除一条评论（按 id），同时删除其所有子回复 */
export function removeEntry(doc: ReviewDocument, id: string): ReviewDocument {
  const toRemove = new Set<string>([id]);
  // 简单 BFS 找子孙
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of doc.entries) {
      if (e.parentId && toRemove.has(e.parentId) && !toRemove.has(e.id)) {
        toRemove.add(e.id);
        grew = true;
      }
    }
  }
  return {
    ...doc,
    entries: doc.entries.filter((e) => !toRemove.has(e.id)),
    updatedAt: new Date().toISOString(),
  };
}

/** 把 entries 按 parentId 组织成 tree（深度任意，但通常 2-3 层就够） */
export interface ThreadNode {
  entry: ReviewEntry;
  children: ThreadNode[];
}

export function buildThreads(entries: readonly ReviewEntry[]): ThreadNode[] {
  const byParent = new Map<string | null, ReviewEntry[]>();
  for (const e of entries) {
    const key = e.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(e);
  }
  function build(parentId: string | null): ThreadNode[] {
    const kids = (byParent.get(parentId) ?? []).slice().sort(sortByTs);
    return kids.map((e) => ({ entry: e, children: build(e.id) }));
  }
  return build(null);
}

/** 按 parameterPath 聚合评论（顶层条目计数），供 SnapshotReviewPanel 显示 "💬 N" 徽章 */
export function countByParameter(entries: readonly ReviewEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (e.parentId !== null) continue;
    out[e.parameterPath] = (out[e.parameterPath] ?? 0) + 1;
  }
  return out;
}

/** 顶部摘要（X open / Y resolved / Z suggestions） */
export interface ReviewSummary {
  openTopLevel: number;
  resolvedTopLevel: number;
  suggestions: number;
  appliedSuggestions: number;
  status: ReviewStatus;
}

/** 计算摘要：当 doc.status === 'closed' / 'merged' 时整份算 resolved */
export function summarizeReview(doc: ReviewDocument): ReviewSummary {
  const topLevel = doc.entries.filter((e) => e.parentId === null).length;
  let suggestions = 0;
  let applied = 0;
  for (const e of doc.entries) {
    if (e.suggestion) {
      suggestions++;
      if (e.suggestionApplied) applied++;
    }
  }
  const docResolved = doc.status === 'closed' || doc.status === 'merged';
  return {
    openTopLevel: docResolved ? 0 : topLevel,
    resolvedTopLevel: docResolved ? topLevel : 0,
    suggestions,
    appliedSuggestions: applied,
    status: doc.status,
  };
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------

/** 合法的状态迁移（src → dst）；不在表中的迁移会被拒绝 */
const STATUS_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  open: ['closed', 'merged'],
  closed: ['open'],
  merged: ['open'], // 允许 reopen 一份已 merge 的 review（非典型但 PR 也支持）
};

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionStatus(doc: ReviewDocument, to: ReviewStatus): ReviewDocument {
  if (!canTransition(doc.status, to)) {
    throw new Error(`非法状态迁移：${doc.status} → ${to}`);
  }
  return { ...doc, status: to, updatedAt: new Date().toISOString() };
}

/** revision++（每次"submit changes"调用一次） */
export function bumpRevision(doc: ReviewDocument): ReviewDocument {
  return { ...doc, revision: doc.revision + 1, updatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Suggested-changes apply
// ---------------------------------------------------------------------------

/** 17 个 slice 对应的 update 函数签名（patch 形如 { field: value }） */
export type ReviewUpdaters = Partial<Record<ReviewSlice, (patch: Record<string, unknown>) => void>>;

/**
 * 应用一条建议改动。
 *
 * 安全策略（详见报告）：
 *   1. 解析 parameterPath（必须命中白名单 slice + 合法 field 字符）
 *   2. updaters[slice] 必须存在，否则拒绝（防御未注入的 slice）
 *   3. newValue 仅允许 number / boolean / string 标量
 *   4. 同时返回 nextDoc：把对应 entry 标记 suggestionApplied=true + 追加一条
 *      系统 reply "✓ Applied by @owner"
 *
 * 注意：本函数**不**直接读 useSimulationStore，调用方传入 updaters。
 */
export interface ApplySuggestionResult {
  ok: boolean;
  reason?: string;
  doc?: ReviewDocument;
}

export function applySuggestion(
  doc: ReviewDocument,
  entryId: string,
  appliedBy: string,
  updaters: ReviewUpdaters,
  now: () => string = () => new Date().toISOString(),
): ApplySuggestionResult {
  const entry = doc.entries.find((e) => e.id === entryId);
  if (!entry) return { ok: false, reason: '找不到对应评论' };
  if (!entry.suggestion) return { ok: false, reason: '该评论没有建议改动' };
  if (entry.suggestionApplied) return { ok: false, reason: '该建议已被应用' };
  const split = splitParameterPath(entry.suggestion.parameterPath);
  if (!split) return { ok: false, reason: `非法 parameterPath：${entry.suggestion.parameterPath}` };
  const [slice, field] = split;
  const updater = updaters[slice];
  if (!updater) return { ok: false, reason: `当前环境未注入 slice "${slice}" 的 updater` };
  const value = entry.suggestion.newValue;
  if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
    return { ok: false, reason: '建议值必须是 number / boolean / string 标量' };
  }
  try {
    updater({ [field]: value });
  } catch (err) {
    return { ok: false, reason: `updater 抛错：${(err as Error).message}` };
  }
  const ts = now();
  const replyId = generateEntryId(Date.parse(ts) || Date.now());
  const nextEntries = doc.entries.map((e) =>
    e.id === entryId ? { ...e, suggestionApplied: true } : e,
  );
  nextEntries.push({
    id: replyId,
    parentId: entryId,
    parameterPath: entry.parameterPath,
    line: entry.line,
    author: appliedBy,
    ts,
    body: `✓ Applied by @${appliedBy}`,
  });
  return {
    ok: true,
    doc: { ...doc, entries: nextEntries, updatedAt: ts },
  };
}
