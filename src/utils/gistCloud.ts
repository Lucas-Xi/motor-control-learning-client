/**
 * GitHub Gist 云协作客户端（V2）。
 *
 * 选型理由（见报告）：
 *   - GitHub Gist 公开免费，匿名 / PAT 都能读，PAT 可写；不需要自建后端。
 *   - **不引入 octokit**，直接 fetch 标准 REST endpoints：
 *     https://api.github.com/gists
 *
 * 协议设计：每个 snapshot 一个 gist；gist 内含两个文件：
 *   - snapshot.json    —— { schemaVersion, payloadB64, savedAt }（snapshotCodec 紧凑编码后再 base64）
 *   - comments.md      —— Markdown 评论（默认创建为空）
 *
 * 错误约定：所有失败抛 GistError；上层 UI 捕获后映射成中文提示，绝不静默吞掉。
 */

import type { SnapshotPayload } from './snapshotCodec';

export const GIST_API_BASE = 'https://api.github.com';
export const GIST_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_FILENAME = 'snapshot.json';
export const COMMENTS_FILENAME = 'comments.md';

/** 内部存储格式（写到 gist 的 snapshot.json） */
export interface GistSnapshotFile {
  schemaVersion: typeof GIST_SCHEMA_VERSION;
  /** snapshotCodec.encodeSnapshot() 的输出（含版本头）再 base64 包一层让 gist 行宽友好 */
  payloadB64: string;
  /** ISO 8601 时间戳 */
  savedAt: string;
  /** 创建端记录的本地标签（方便不解码就能在列表看到） */
  label?: string;
}

export interface GistMeta {
  id: string;
  description: string;
  public: boolean;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  ownerLogin?: string;
  /** snapshot.json 的 raw_url（用于无需 PAT 直读） */
  rawUrl?: string;
}

export interface CreateSnapshotOptions {
  description: string;
  public: boolean;
  /** 可选 label 写进 snapshot.json，方便列表展示 */
  label?: string;
  /** 评论文件初始内容；默认空 */
  initialComments?: string;
}

export interface CreateSnapshotResult {
  gistId: string;
  url: string;
  rawUrl: string;
}

export class GistError extends Error {
  status?: number;
  code: 'rate-limit' | 'unauthorized' | 'not-found' | 'network' | 'parse' | 'unknown';
  constructor(code: GistError['code'], message: string, status?: number) {
    super(message);
    this.name = 'GistError';
    this.code = code;
    this.status = status;
  }
}

/** 把任意字符串安全 base64（UTF-8） */
function b64Encode(s: string): string {
  if (typeof btoa === 'function') {
    // 处理 UTF-8：先 encodeURIComponent → unescape → btoa
    return btoa(unescape(encodeURIComponent(s)));
  }
  // Node fallback（vitest 走这里）
  return Buffer.from(s, 'utf8').toString('base64');
}

function b64Decode(s: string): string {
  if (typeof atob === 'function') {
    try {
      return decodeURIComponent(escape(atob(s)));
    } catch {
      return atob(s);
    }
  }
  return Buffer.from(s, 'base64').toString('utf8');
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function publicHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** 把响应里 GitHub 限频 / 鉴权状态映射成 GistError */
async function ensureOk(resp: Response, ctx: string): Promise<void> {
  if (resp.ok) return;
  let bodyMsg = '';
  try {
    const j = (await resp.clone().json()) as { message?: string };
    if (j && typeof j.message === 'string') bodyMsg = j.message;
  } catch {
    try {
      bodyMsg = (await resp.clone().text()).slice(0, 200);
    } catch {
      /* ignore */
    }
  }
  const rateRemaining = resp.headers.get('x-ratelimit-remaining');
  if (resp.status === 401) {
    throw new GistError('unauthorized', `${ctx}：GitHub 拒绝令牌（401）。请检查 PAT 是否过期或权限不足。`, 401);
  }
  if (resp.status === 403 && rateRemaining === '0') {
    throw new GistError(
      'rate-limit',
      `${ctx}：GitHub API 频率限制已用完（403）。匿名 60/小时；绑定 PAT 可提升至 5000/小时。`,
      403,
    );
  }
  if (resp.status === 404) {
    throw new GistError('not-found', `${ctx}：未找到对应 gist（404）。链接可能已删除或仅私密可见。`, 404);
  }
  if (resp.status === 429) {
    throw new GistError('rate-limit', `${ctx}：请求过于频繁（429）。请稍后重试。`, 429);
  }
  throw new GistError(
    'unknown',
    `${ctx}：GitHub API 返回 ${resp.status}${bodyMsg ? `（${bodyMsg}）` : ''}。`,
    resp.status,
  );
}

/** 从响应头读出 rate-limit 元信息 */
export interface RateLimitInfo {
  remaining: number;
  limit: number;
}

export function readRateLimit(resp: Response): RateLimitInfo {
  const r = resp.headers.get('x-ratelimit-remaining');
  const l = resp.headers.get('x-ratelimit-limit');
  return {
    remaining: r ? Number.parseInt(r, 10) : 0,
    limit: l ? Number.parseInt(l, 10) : 0,
  };
}

/** 测试 PAT：返回 { login, remaining, limit } 或抛 GistError */
export async function verifyToken(token: string): Promise<{ login: string; remaining: number; limit: number }> {
  if (!token || token.trim().length < 5) {
    throw new GistError('unauthorized', 'PAT 为空或太短，请粘贴完整的 GitHub Personal Access Token。');
  }
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/user`, { headers: authHeaders(token.trim()) });
  } catch (err) {
    throw new GistError('network', `网络错误：无法连接 api.github.com（${(err as Error).message}）`);
  }
  await ensureOk(resp, '校验 PAT');
  let json: { login?: string };
  try {
    json = (await resp.json()) as { login?: string };
  } catch {
    throw new GistError('parse', '校验 PAT：响应不是合法 JSON');
  }
  const rate = readRateLimit(resp);
  return { login: (json.login ?? '').toLowerCase(), remaining: rate.remaining, limit: rate.limit };
}

/**
 * 创建一个 snapshot gist。
 *
 * 上传内容：snapshotCodec.encodeSnapshot(payload) 的输出（已经是版本头 + base64
 * URL-safe）再 base64 一次封进 snapshot.json。这样既保持 gist 体积 < 1200 字符，
 * 也避免特殊字符在 gist diff 视图里显示得乱七八糟。
 */
export async function createSnapshot(
  token: string,
  encodedToken: string,
  options: CreateSnapshotOptions,
): Promise<CreateSnapshotResult> {
  if (!token) throw new GistError('unauthorized', '创建 gist 需要 PAT（GitHub 不允许真匿名写）。');
  if (!encodedToken || typeof encodedToken !== 'string') {
    throw new GistError('parse', '上传内容为空（encodedToken 无效）。');
  }
  const fileContent: GistSnapshotFile = {
    schemaVersion: GIST_SCHEMA_VERSION,
    payloadB64: b64Encode(encodedToken),
    savedAt: new Date().toISOString(),
    label: options.label,
  };
  const body = {
    description: options.description || '电机控制学习客户端 · 数字孪生 snapshot',
    public: options.public,
    files: {
      [SNAPSHOT_FILENAME]: { content: JSON.stringify(fileContent, null, 2) },
      [COMMENTS_FILENAME]: { content: options.initialComments ?? '<!-- 在此添加评论 -->\n' },
    },
  };
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/gists`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GistError('network', `网络错误：上传失败（${(err as Error).message}）`);
  }
  await ensureOk(resp, '创建 gist');
  let json: {
    id?: string;
    html_url?: string;
    files?: Record<string, { raw_url?: string }>;
  };
  try {
    json = await resp.json();
  } catch {
    throw new GistError('parse', '创建 gist：返回不是合法 JSON');
  }
  if (!json.id || !json.html_url) throw new GistError('parse', '创建 gist：返回缺 id / html_url');
  const rawUrl = json.files?.[SNAPSHOT_FILENAME]?.raw_url ?? '';
  return { gistId: json.id, url: json.html_url, rawUrl };
}

/** 从 gist id（或 URL）拉取 snapshot；公共 gist 无需 PAT */
export async function fetchSnapshot(gistIdOrUrl: string, token?: string): Promise<{
  encodedToken: string;
  meta: GistMeta;
  comments: string;
}> {
  const gistId = extractGistId(gistIdOrUrl);
  if (!gistId) throw new GistError('parse', '无法识别 gist id（请粘贴形如 https://gist.github.com/xxx/<id> 的链接或 id）。');
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/gists/${encodeURIComponent(gistId)}`, {
      headers: token ? authHeaders(token) : publicHeaders(),
    });
  } catch (err) {
    throw new GistError('network', `网络错误：拉取 gist 失败（${(err as Error).message}）`);
  }
  await ensureOk(resp, '拉取 gist');
  let json: {
    id?: string;
    description?: string;
    public?: boolean;
    html_url?: string;
    created_at?: string;
    updated_at?: string;
    owner?: { login?: string };
    files?: Record<string, { content?: string; raw_url?: string }>;
  };
  try {
    json = await resp.json();
  } catch {
    throw new GistError('parse', '拉取 gist：返回不是合法 JSON');
  }
  const snapFile = json.files?.[SNAPSHOT_FILENAME];
  if (!snapFile?.content) {
    throw new GistError('parse', `gist 中缺少 ${SNAPSHOT_FILENAME}（可能不是本客户端创建的快照）`);
  }
  let snap: GistSnapshotFile;
  try {
    snap = JSON.parse(snapFile.content) as GistSnapshotFile;
  } catch {
    throw new GistError('parse', `${SNAPSHOT_FILENAME} 不是合法 JSON`);
  }
  if (snap.schemaVersion !== GIST_SCHEMA_VERSION) {
    throw new GistError('parse', `不支持的 snapshot schema 版本：${snap.schemaVersion}`);
  }
  if (!snap.payloadB64 || typeof snap.payloadB64 !== 'string') {
    throw new GistError('parse', 'snapshot 缺 payloadB64 字段');
  }
  let encodedToken: string;
  try {
    encodedToken = b64Decode(snap.payloadB64);
  } catch {
    throw new GistError('parse', 'payloadB64 base64 解码失败');
  }
  return {
    encodedToken,
    comments: json.files?.[COMMENTS_FILENAME]?.content ?? '',
    meta: {
      id: json.id ?? gistId,
      description: json.description ?? '',
      public: !!json.public,
      htmlUrl: json.html_url ?? `https://gist.github.com/${gistId}`,
      createdAt: json.created_at ?? '',
      updatedAt: json.updated_at ?? '',
      ownerLogin: json.owner?.login,
      rawUrl: snapFile.raw_url,
    },
  };
}

/** 列出当前 PAT 用户自己创建的 gists（仅 snapshot.json 命中的视为本客户端产物） */
export async function listMine(token: string, perPage = 30): Promise<GistMeta[]> {
  if (!token) throw new GistError('unauthorized', '需要 PAT 才能列出私人 gist。');
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/gists?per_page=${Math.min(100, perPage)}`, {
      headers: authHeaders(token),
    });
  } catch (err) {
    throw new GistError('network', `网络错误：列出 gist 失败（${(err as Error).message}）`);
  }
  await ensureOk(resp, '列出我的 gist');
  let arr: Array<{
    id?: string;
    description?: string;
    public?: boolean;
    html_url?: string;
    created_at?: string;
    updated_at?: string;
    owner?: { login?: string };
    files?: Record<string, { raw_url?: string }>;
  }>;
  try {
    arr = await resp.json();
  } catch {
    throw new GistError('parse', '列出 gist：返回不是合法 JSON');
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((g) => g.files && SNAPSHOT_FILENAME in g.files)
    .map((g) => ({
      id: g.id ?? '',
      description: g.description ?? '',
      public: !!g.public,
      htmlUrl: g.html_url ?? '',
      createdAt: g.created_at ?? '',
      updatedAt: g.updated_at ?? '',
      ownerLogin: g.owner?.login,
      rawUrl: g.files?.[SNAPSHOT_FILENAME]?.raw_url,
    }))
    .filter((g) => g.id);
}

/** 列指定用户公共 gist（不需要 PAT；用于团队时间线） */
export async function listUser(username: string, perPage = 10): Promise<GistMeta[]> {
  const u = (username ?? '').trim().toLowerCase();
  if (!u) throw new GistError('parse', '用户名为空');
  let resp: Response;
  try {
    resp = await fetch(
      `${GIST_API_BASE}/users/${encodeURIComponent(u)}/gists?per_page=${Math.min(100, perPage)}`,
      { headers: publicHeaders() },
    );
  } catch (err) {
    throw new GistError('network', `网络错误：列出 ${u} 的 gist 失败（${(err as Error).message}）`);
  }
  await ensureOk(resp, `列出 @${u} 的 gist`);
  let arr: Array<{
    id?: string;
    description?: string;
    public?: boolean;
    html_url?: string;
    created_at?: string;
    updated_at?: string;
    owner?: { login?: string };
    files?: Record<string, { raw_url?: string }>;
  }>;
  try {
    arr = await resp.json();
  } catch {
    throw new GistError('parse', `列出 ${u} 的 gist：返回不是合法 JSON`);
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((g) => g.files && SNAPSHOT_FILENAME in g.files)
    .map((g) => ({
      id: g.id ?? '',
      description: g.description ?? '',
      public: !!g.public,
      htmlUrl: g.html_url ?? '',
      createdAt: g.created_at ?? '',
      updatedAt: g.updated_at ?? '',
      ownerLogin: g.owner?.login,
      rawUrl: g.files?.[SNAPSHOT_FILENAME]?.raw_url,
    }))
    .filter((g) => g.id);
}

/** 删除一个 gist */
export async function deleteSnapshot(token: string, gistId: string): Promise<void> {
  if (!token) throw new GistError('unauthorized', '删除 gist 需要 PAT。');
  if (!gistId) throw new GistError('parse', 'gist id 为空');
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/gists/${encodeURIComponent(gistId)}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  } catch (err) {
    throw new GistError('network', `网络错误：删除 gist 失败（${(err as Error).message}）`);
  }
  if (resp.status === 204) return;
  await ensureOk(resp, '删除 gist');
}

/** 更新 comments.md（评论功能用） */
export async function updateComments(
  token: string,
  gistId: string,
  markdown: string,
): Promise<void> {
  if (!token) throw new GistError('unauthorized', '更新评论需要 PAT。');
  if (!gistId) throw new GistError('parse', 'gist id 为空');
  const body = {
    files: { [COMMENTS_FILENAME]: { content: markdown } },
  };
  let resp: Response;
  try {
    resp = await fetch(`${GIST_API_BASE}/gists/${encodeURIComponent(gistId)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GistError('network', `网络错误：更新评论失败（${(err as Error).message}）`);
  }
  await ensureOk(resp, '更新评论');
}

/** 从 URL 或裸 id 里抠出 gist id；32 hex / 20 hex 都接受 */
export function extractGistId(input: string): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  // 形式 1：完整 URL https://gist.github.com/<user>/<id>
  const m = trimmed.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]{20,40})/i);
  if (m) return m[1];
  // 形式 2：纯 id
  if (/^[a-f0-9]{20,40}$/i.test(trimmed)) return trimmed;
  return '';
}

/** 把 SnapshotPayload + encodedToken 共同需要的"上传字符长度"算出来，供 UI 提示 */
export function computeUploadSize(encodedToken: string): number {
  return b64Encode(encodedToken).length;
}

/** 重导出供 UI 在 Markdown 评论里用 */
export { b64Encode as __encodeBase64ForTests, b64Decode as __decodeBase64ForTests };

// SnapshotPayload 用于类型导出（即便此文件内部不直接用，consumers 可能需要） — 防止 TS6133
export type { SnapshotPayload };
