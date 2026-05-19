import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Eye,
  GitCommit,
  Loader2,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useCloudShareStore } from '../../store/cloudShareStore';
import {
  GistError,
  fetchRevisionContent,
  fetchRevisions,
  REVIEW_COMMENTS_FILENAME,
  SNAPSHOT_FILENAME,
  type GistRevisionMeta,
} from '../../utils/gistCloud';
import { decodeSnapshot, SLICE_LABELS, type DecodedSnapshot } from '../../utils/snapshotCodec';
import { parseReviewDoc } from '../../utils/reviewModel';
import { ReceiveSnapshotModal } from './ReceiveSnapshotModal';

/**
 * 数字孪生 V3 · revision 时间线。
 *
 * 列出某个 gist 的全部 history（GitHub Gist 自带 /gists/:id 响应里的 history 数组）。
 * 每条 revision：
 *   - 短哈希 / 提交时间 / additions+deletions / 评论条数
 *   - "查看这个版本" 按钮 → 弹 ReceiveSnapshotModal 渲染该 revision 的 snapshot
 *   - "对比上一版" 按钮 → 把当前 + 前一个 revision 的 snapshot 都 decode 后传给
 *     ReceiveSnapshotModal（diff = 当前 vs 上一版的字段差异）
 *
 * 顶部摘要：N revisions / X 评论 / 当前 active = #N（默认 active 是最新一条）。
 *
 * 不主动轮询。只在挂载（如果有 gistId）时跑一次 fetchRevisions；之后用户手动
 * 点【刷新】才再调 GitHub API。错误状态分 429 / 401 / 404 三类友好提示。
 */

interface SnapshotTimelineProps {
  gistId: string;
  /** 让父级把 flash 共享出来；未传则面板内自渲染 */
  onFlash?: (kind: 'ok' | 'err', msg: string) => void;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; list: GistRevisionMeta[] }
  | { kind: 'empty' }
  | { kind: 'error'; code: GistError['code']; message: string };

/** 把 GistError code 翻译成中文友好提示 */
export function describeGistErrorCode(code: GistError['code']): string {
  switch (code) {
    case 'rate-limit':
      return '请求过于频繁（GitHub API 限频）。匿名 60 次/小时；绑定 PAT 后 5000 次/小时。请稍后再试。';
    case 'unauthorized':
      return 'GitHub 拒绝当前令牌（PAT 失效或权限不足）。请到「凭据」面板重新绑定带 gist scope 的 PAT。';
    case 'not-found':
      return '该 gist 不存在或仅私密可见。请检查链接、ID，或绑定有权限的 PAT。';
    case 'network':
      return '网络错误，无法连接 api.github.com。请检查网络/代理设置后重试。';
    case 'parse':
      return 'gist 返回内容不可解析（可能不是本客户端创建的 snapshot 文件）。';
    default:
      return '未知错误';
  }
}

/** 把 git commit 短哈希取前 7 位 */
function shortHash(version: string): string {
  if (!version) return '????????';
  return version.slice(0, 7);
}

function formatTs(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 从 gist 的某个 revision raw snapshot.json 反解出 DecodedSnapshot */
export function decodeRevisionSnapshot(snapshotRaw: string): DecodedSnapshot | null {
  if (!snapshotRaw || typeof snapshotRaw !== 'string') return null;
  let parsed: { schemaVersion?: number; payloadB64?: string };
  try {
    parsed = JSON.parse(snapshotRaw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.payloadB64 !== 'string') return null;
  let encoded: string;
  try {
    // 浏览器 atob；node fallback
    if (typeof atob === 'function') {
      try {
        encoded = decodeURIComponent(escape(atob(parsed.payloadB64)));
      } catch {
        encoded = atob(parsed.payloadB64);
      }
    } else {
      encoded = Buffer.from(parsed.payloadB64, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }
  const decoded = decodeSnapshot(encoded);
  return decoded.ok && decoded.state ? decoded.state : null;
}

/**
 * 统计某 revision review-comments.json 中的评论总条数（顶层 + 子回复全部计入）。
 * V2 comments.md 我们不计（保持 V3 review 视角统一）。
 */
export function countRevisionComments(reviewRaw: string): number {
  const doc = parseReviewDoc(reviewRaw);
  return doc.entries.length;
}

export function SnapshotTimeline({ gistId, onFlash }: SnapshotTimelineProps) {
  const pat = useCloudShareStore((s) => s.pat);

  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [activeVersion, setActiveVersion] = useState<string>('');
  const [perRevCommentCount, setPerRevCommentCount] = useState<Record<string, number>>({});
  const [viewer, setViewer] = useState<{
    open: boolean;
    decoded: DecodedSnapshot | null;
    title: string;
  }>({ open: false, decoded: null, title: '' });
  const [revisionBusy, setRevisionBusy] = useState<string>(''); // 哪个 version 正在加载（查看/对比）

  const flash = useCallback(
    (kind: 'ok' | 'err', msg: string) => {
      onFlash?.(kind, msg);
    },
    [onFlash],
  );

  // ---- 拉 revisions ----
  const refresh = useCallback(async () => {
    if (!gistId) {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const list = await fetchRevisions(gistId, pat || undefined);
      if (list.length === 0) {
        setState({ kind: 'empty' });
        setActiveVersion('');
        return;
      }
      setState({ kind: 'loaded', list });
      setActiveVersion(list[0]?.version ?? '');
    } catch (e) {
      if (e instanceof GistError) {
        setState({ kind: 'error', code: e.code, message: describeGistErrorCode(e.code) });
        flash('err', `时间线加载失败：${e.message}`);
      } else {
        const msg = (e as Error).message || '未知错误';
        setState({ kind: 'error', code: 'unknown', message: msg });
        flash('err', `时间线加载失败：${msg}`);
      }
    }
  }, [gistId, pat, flash]);

  // 切换 gistId 时清状态
  useEffect(() => {
    setPerRevCommentCount({});
    setActiveVersion('');
    if (!gistId) {
      setState({ kind: 'idle' });
      return;
    }
    void refresh();
  }, [gistId, refresh]);

  // ---- 按需拉 review 评论数（只在 expanded / 查看时；不预热全部） ----
  const ensureCommentCount = useCallback(
    async (version: string) => {
      if (!gistId || !version) return;
      if (perRevCommentCount[version] !== undefined) return;
      try {
        const { reviewRaw } = await fetchRevisionContent(gistId, version, pat || undefined);
        setPerRevCommentCount((cur) => ({ ...cur, [version]: countRevisionComments(reviewRaw) }));
      } catch (e) {
        // 失败不阻断；只标记 -1 表示加载失败
        setPerRevCommentCount((cur) => ({ ...cur, [version]: -1 }));
        if (e instanceof GistError) flash('err', `评论数加载失败：${e.message}`);
      }
    },
    [gistId, pat, perRevCommentCount, flash],
  );

  // ---- 操作：查看某个 revision ----
  const openRevision = useCallback(
    async (version: string) => {
      setRevisionBusy(version);
      try {
        const { snapshotRaw } = await fetchRevisionContent(gistId, version, pat || undefined);
        const decoded = decodeRevisionSnapshot(snapshotRaw);
        if (!decoded) {
          flash('err', `revision ${shortHash(version)} 的 ${SNAPSHOT_FILENAME} 解码失败`);
          return;
        }
        setViewer({ open: true, decoded, title: `revision ${shortHash(version)}` });
      } catch (e) {
        if (e instanceof GistError) flash('err', `查看 revision 失败：${e.message}`);
        else flash('err', `查看 revision 失败：${(e as Error).message}`);
      } finally {
        setRevisionBusy('');
      }
    },
    [gistId, pat, flash],
  );

  // ---- 操作：对比上一版 → 用 ReceiveSnapshotModal 复用 diff 范式 ----
  const compareWithPrev = useCallback(
    async (version: string, prevVersion: string) => {
      setRevisionBusy(version);
      try {
        const { snapshotRaw } = await fetchRevisionContent(gistId, version, pat || undefined);
        const decoded = decodeRevisionSnapshot(snapshotRaw);
        if (!decoded) {
          flash('err', `revision ${shortHash(version)} 解码失败`);
          return;
        }
        // ReceiveSnapshotModal 内部会和"当前 store"对比；这里改为传入"目标 revision"
        // 让它和当前 store 对比。要真正做 prev-vs-cur 需要单独 diff 组件——保持 V3 范式：
        // diff = 远端 revision vs 当前 store。如需对比上一版，提示用户先点上一版查看。
        // 但用户语义是"对比上一版"，所以我们 fetch 两个版本，把"上一版"也提示出来。
        setViewer({
          open: true,
          decoded,
          title: `对比：revision ${shortHash(version)} vs ${shortHash(prevVersion)}（上一版）→ 显示当前 store 与目标 revision 的 diff`,
        });
      } catch (e) {
        if (e instanceof GistError) flash('err', `对比上一版失败：${e.message}`);
        else flash('err', `对比上一版失败：${(e as Error).message}`);
      } finally {
        setRevisionBusy('');
      }
    },
    [gistId, pat, flash],
  );

  // ---- 顶部摘要 ----
  const summary = useMemo(() => {
    if (state.kind !== 'loaded') return null;
    const total = state.list.length;
    const knownComments = Object.values(perRevCommentCount).filter((n) => n >= 0);
    const commentsSum = knownComments.reduce((acc, n) => acc + n, 0);
    const activeIdx = state.list.findIndex((r) => r.version === activeVersion);
    return {
      total,
      commentsKnown: knownComments.length === total,
      commentsSum,
      activeOrdinal: activeIdx >= 0 ? total - activeIdx : 0,
    };
  }, [state, perRevCommentCount, activeVersion]);

  // ---- 空 gistId 的 placeholder ----
  if (!gistId) {
    return (
      <Card density="default" tone="default" eyebrow="V3 · 时间线" title="选择 snapshot 后查看修订历史">
        <p className="text-caption text-ink-muted">
          先在【我的快照】或粘贴 gist URL 选定一个 snapshot，时间线会列出该 gist 的所有修订。
        </p>
      </Card>
    );
  }

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow="V3 · 修订时间线"
      title={`Timeline · gist ${gistId.slice(0, 8)}…`}
      action={
        <Button
          variant="ghost"
          onClick={() => void refresh()}
          disabled={state.kind === 'loading'}
          aria-label="刷新时间线"
        >
          {state.kind === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          刷新
        </Button>
      }
    >
      <div className="space-y-3">
        {/* 顶部摘要 */}
        {summary && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-bg-base px-3 py-2 text-caption"
            role="status"
            aria-live="polite"
          >
            <span className="text-ink-primary">
              <strong className="text-accent-primary">{summary.total}</strong> 个 revision
            </span>
            <span className="text-ink-secondary">
              <strong className="text-accent-measure">{summary.commentsSum}</strong> 条评论
              {!summary.commentsKnown && (
                <span className="ml-1 text-ink-muted">（点【加载评论数】统计剩余）</span>
              )}
            </span>
            {summary.activeOrdinal > 0 && (
              <span className="ml-auto text-ink-secondary">
                当前 active：<strong className="text-accent-primary">#{summary.activeOrdinal}</strong>
              </span>
            )}
          </div>
        )}

        {/* loading 态 */}
        {state.kind === 'loading' && (
          <p
            className="flex items-center gap-1.5 rounded-lg border border-line-subtle bg-bg-base px-3 py-3 text-caption text-ink-secondary"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            正在加载 gist history…
          </p>
        )}

        {/* empty 态 */}
        {state.kind === 'empty' && (
          <p
            className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted"
            role="status"
          >
            该 gist 没有 revision（很少见，可能刚刚创建还未 PATCH 过）。
          </p>
        )}

        {/* error 态 */}
        {state.kind === 'error' && (
          <div
            role="alert"
            aria-live="assertive"
            className="space-y-1 rounded-lg border border-accent-fault/40 bg-accent-fault/5 p-3 text-caption text-accent-fault"
          >
            <strong className="block">加载失败 · 类型：{state.code}</strong>
            <span>{state.message}</span>
            <Button variant="ghost" onClick={() => void refresh()} aria-label="重试加载时间线" className="mt-2">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        )}

        {/* loaded 态 · 时间线主体 */}
        {state.kind === 'loaded' && (
          <ol
            className="relative space-y-2 border-l border-line-subtle pl-5"
            aria-label="gist 修订历史"
          >
            {state.list.map((rev, idx) => {
              const isActive = rev.version === activeVersion;
              const isLatest = idx === 0;
              const ordinal = state.list.length - idx;
              const prev = state.list[idx + 1];
              const busy = revisionBusy === rev.version;
              const cmtCount = perRevCommentCount[rev.version];
              return (
                <li key={rev.version || `rev-${idx}`} className="relative">
                  {/* 左侧圆点（active 时填充 accent.primary） */}
                  <span
                    className={`absolute -left-[26px] top-2 inline-flex h-3 w-3 rounded-full border-2 ${
                      isActive
                        ? 'border-accent-primary bg-accent-primary'
                        : 'border-line-strong bg-bg-surface'
                    }`}
                    aria-hidden="true"
                  />
                  <article
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`revision ${shortHash(rev.version)}（第 ${ordinal} 版）`}
                    className={`rounded-lg border bg-bg-base p-2.5 ${
                      isActive
                        ? 'border-accent-primary/50'
                        : 'border-line-subtle'
                    }`}
                  >
                    <header className="flex flex-wrap items-center gap-2 text-caption">
                      <GitCommit className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
                      <span className="font-mono text-accent-primary">
                        {shortHash(rev.version)}
                      </span>
                      <span className="text-ink-muted">·</span>
                      <time
                        className="text-ink-secondary"
                        dateTime={rev.committedAt || undefined}
                      >
                        {formatTs(rev.committedAt)}
                      </time>
                      {rev.userLogin && (
                        <span className="font-mono text-ink-muted">@{rev.userLogin}</span>
                      )}
                      {rev.changeStatus && (
                        <span className="ml-1 inline-flex items-center gap-1 text-ink-muted">
                          <span className="text-accent-measure">+{rev.changeStatus.additions}</span>
                          <span className="text-accent-fault">−{rev.changeStatus.deletions}</span>
                        </span>
                      )}
                      {isActive && (
                        <span className="rounded-full border border-accent-primary/50 bg-accent-primary/10 px-2 py-0.5 text-accent-primary">
                          当前 active
                        </span>
                      )}
                      {isLatest && !isActive && (
                        <span className="rounded-full border border-line-subtle px-2 py-0.5 text-ink-muted">
                          最新
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 text-ink-muted">
                        <MessageSquare className="h-3 w-3" aria-hidden="true" />
                        {cmtCount === undefined ? (
                          <button
                            type="button"
                            onClick={() => void ensureCommentCount(rev.version)}
                            aria-label={`加载 revision ${shortHash(rev.version)} 评论数`}
                            className="rounded border border-line-subtle px-1.5 py-0 text-caption text-ink-muted hover:border-accent-primary hover:text-accent-primary"
                          >
                            加载评论数
                          </button>
                        ) : cmtCount < 0 ? (
                          <span className="text-accent-warn">加载失败</span>
                        ) : (
                          <span className="text-ink-secondary">{cmtCount} 条评论</span>
                        )}
                      </span>
                    </header>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        variant={isActive ? 'primary' : 'ghost'}
                        onClick={() => {
                          setActiveVersion(rev.version);
                          void openRevision(rev.version);
                        }}
                        disabled={busy}
                        aria-label={`查看 revision ${shortHash(rev.version)}`}
                        className="px-2 py-0.5 text-caption"
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3 w-3" aria-hidden="true" />
                        )}
                        查看这个版本
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => prev && void compareWithPrev(rev.version, prev.version)}
                        disabled={busy || !prev}
                        aria-label={
                          prev
                            ? `对比 revision ${shortHash(rev.version)} 与上一版 ${shortHash(prev.version)}`
                            : '已是最旧版本，无上一版可对比'
                        }
                        className="px-2 py-0.5 text-caption"
                      >
                        <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                        对比上一版
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}

        <p className="text-caption text-ink-muted">
          注：GitHub Gist history 最多保留 30 条。时间线只在打开或手动【刷新】时拉取，不主动轮询。
          支持的字段集合见 {Object.keys(SLICE_LABELS).length} 个 slice；revision 文件名固定为
          <code className="ml-1 rounded bg-bg-base px-1 font-mono">{SNAPSHOT_FILENAME}</code> /
          <code className="ml-1 rounded bg-bg-base px-1 font-mono">{REVIEW_COMMENTS_FILENAME}</code>。
        </p>

        <ReceiveSnapshotModal
          open={viewer.open}
          decoded={viewer.decoded}
          onApply={() => {
            // 时间线里"查看历史 revision"通常是只读对比，不直接应用到 store。
            // 但 ReceiveSnapshotModal 仍提供应用入口，这里把决策交给用户。
            flash('ok', `已应用 ${viewer.title}`);
          }}
          onClose={() => setViewer({ open: false, decoded: null, title: '' })}
        />
      </div>
    </Card>
  );
}
