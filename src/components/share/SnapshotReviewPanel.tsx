import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useSimulationStore } from '../../store/simulationStore';
import { useCloudShareStore } from '../../store/cloudShareStore';
import { useReviewersStore, colorForAuthor } from '../../store/reviewersStore';
import {
  GistError,
  fetchReviewDoc,
  updateReviewDoc,
} from '../../utils/gistCloud';
import {
  REVIEW_SLICES,
  type ReviewDocument,
  type ReviewEntry,
  type ReviewStatus,
  type ReviewUpdaters,
  appendEntry,
  applySuggestion,
  buildThreads,
  bumpRevision,
  canTransition,
  countByParameter,
  createEmptyReviewDoc,
  parseReviewDoc,
  removeEntry,
  serializeReviewDoc,
  splitParameterPath,
  summarizeReview,
  transitionStatus,
  type ThreadNode,
} from '../../utils/reviewModel';
import { SLICE_LABELS } from '../../utils/snapshotCodec';
import { CommentRenderer } from './CommentRenderer';

/**
 * 数字孪生 V3 · PR-style review 面板。
 *
 * 列出当前 snapshot 的所有参数（按 17 个 slice 分组）。每个参数：
 *   - 显示当前值（从 useSimulationStore 读切片）
 *   - "+" 按钮：弹出留言/建议输入
 *   - 已有评论数：显示徽章
 *   - 展开后：渲染该参数下所有 thread（顶层 + 回复嵌套，左侧细线 + 缩进）
 *
 * 顶部摘要：X open / Y resolved / Z suggestions
 * 状态切换：open / closed / merged（按状态机 transitionStatus 校验）
 *
 * 不主动轮询；用户手动【刷新评论】才会调 GitHub API。
 */

interface SnapshotReviewPanelProps {
  /** 当前操作的 gist id；空时面板停留在 "请选择一个 gist" */
  gistId: string;
  /** 关闭面板的回调 */
  onClose?: () => void;
  /** 应用 suggestion 后弹个 toast；调用方可以接到 CloudSharePanel 的 flash */
  onFlash?: (kind: 'ok' | 'err', msg: string) => void;
}

function shortValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return v.toPrecision(4);
  }
  if (typeof v === 'boolean') return v ? '✓' : '×';
  return String(v).slice(0, 24);
}

export function SnapshotReviewPanel({ gistId, onClose, onFlash }: SnapshotReviewPanelProps) {
  const pat = useCloudShareStore((s) => s.pat);
  const ghLogin = useCloudShareStore((s) => s.ghLogin);
  const activeReviewer = useReviewersStore((s) => s.activeReviewer);

  // 取 simulationStore 各 slice + 所有 updater
  const slices = useSimulationStore((s) => ({
    motorBasics: s.motorBasics,
    threePhase: s.threePhase,
    clarke: s.clarke,
    park: s.park,
    pid: s.pid,
    svpwm: s.svpwm,
    inverter: s.inverter,
    sensorless: s.sensorless,
    weakField: s.weakField,
    fault: s.fault,
    controlLoop: s.controlLoop,
    foc: s.foc,
    hfi: s.hfi,
    startup: s.startup,
    apf: s.apf,
    refrigeration: s.refrigeration,
  }));

  const updateMotorBasics = useSimulationStore((s) => s.updateMotorBasics);
  const updateThreePhase = useSimulationStore((s) => s.updateThreePhase);
  const updateClarke = useSimulationStore((s) => s.updateClarke);
  const updatePark = useSimulationStore((s) => s.updatePark);
  const updatePid = useSimulationStore((s) => s.updatePid);
  const updateSvpwm = useSimulationStore((s) => s.updateSvpwm);
  const updateInverter = useSimulationStore((s) => s.updateInverter);
  const updateSensorless = useSimulationStore((s) => s.updateSensorless);
  const updateWeakField = useSimulationStore((s) => s.updateWeakField);
  const updateFault = useSimulationStore((s) => s.updateFault);
  const updateControlLoop = useSimulationStore((s) => s.updateControlLoop);
  const updateFoc = useSimulationStore((s) => s.updateFoc);
  const updateHfi = useSimulationStore((s) => s.updateHfi);
  const updateStartup = useSimulationStore((s) => s.updateStartup);
  const updateApf = useSimulationStore((s) => s.updateApf);
  const updateRefrigeration = useSimulationStore((s) => s.updateRefrigeration);
  const setActiveModule = useSimulationStore((s) => s.setActiveModule);

  const updaters: ReviewUpdaters = useMemo(
    () => ({
      motorBasics: updateMotorBasics,
      threePhase: updateThreePhase,
      clarke: updateClarke,
      park: updatePark,
      pid: updatePid,
      svpwm: updateSvpwm,
      inverter: updateInverter,
      sensorless: updateSensorless,
      weakField: updateWeakField,
      fault: updateFault,
      controlLoop: updateControlLoop,
      foc: updateFoc,
      hfi: updateHfi,
      startup: updateStartup,
      apf: updateApf,
      refrigeration: updateRefrigeration,
    }),
    [
      updateMotorBasics,
      updateThreePhase,
      updateClarke,
      updatePark,
      updatePid,
      updateSvpwm,
      updateInverter,
      updateSensorless,
      updateWeakField,
      updateFault,
      updateControlLoop,
      updateFoc,
      updateHfi,
      updateStartup,
      updateApf,
      updateRefrigeration,
    ],
  );

  const [doc, setDoc] = useState<ReviewDocument>(() => createEmptyReviewDoc());
  const [loading, setLoading] = useState(false);
  const [expandedSlice, setExpandedSlice] = useState<string>('');
  const [expandedParam, setExpandedParam] = useState<string>('');
  const [draft, setDraft] = useState({
    parameterPath: '',
    body: '',
    suggestion: { enabled: false, newValue: '', reason: '' },
  });
  const [replyTo, setReplyTo] = useState<string>('');

  const flash = useCallback(
    (kind: 'ok' | 'err', msg: string) => {
      onFlash?.(kind, msg);
    },
    [onFlash],
  );

  const author = activeReviewer || ghLogin || 'anonymous';

  // ---- 拉评论（不主动轮询） ----
  const refresh = useCallback(async () => {
    if (!gistId) return;
    setLoading(true);
    try {
      const { raw } = await fetchReviewDoc(gistId, pat || undefined);
      setDoc(parseReviewDoc(raw));
    } catch (e) {
      const msg = e instanceof GistError ? e.message : (e as Error).message;
      flash('err', `加载 review 失败：${msg}`);
    } finally {
      setLoading(false);
    }
  }, [gistId, pat, flash]);

  useEffect(() => {
    if (gistId) void refresh();
    // gistId 切换时清掉本地草稿状态
    setReplyTo('');
    setDraft({ parameterPath: '', body: '', suggestion: { enabled: false, newValue: '', reason: '' } });
  }, [gistId, refresh]);

  // ---- 提交一条新评论（顶层 / reply / 带 suggestion） ----
  const persist = useCallback(
    async (next: ReviewDocument) => {
      if (!pat) {
        flash('err', '需要绑定 PAT 才能写入云端 review');
        return;
      }
      const bumped = bumpRevision(next);
      setLoading(true);
      try {
        await updateReviewDoc(pat, gistId, serializeReviewDoc(bumped));
        setDoc(bumped);
        flash('ok', '已同步到云端 review');
      } catch (e) {
        const msg = e instanceof GistError ? e.message : (e as Error).message;
        flash('err', `保存失败：${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [pat, gistId, flash],
  );

  const submitComment = useCallback(
    async (parameterPath: string, parentId: string | null) => {
      const body = draft.body.trim();
      if (!body) {
        flash('err', '评论正文为空');
        return;
      }
      let suggestion: ReviewEntry['suggestion'];
      if (draft.suggestion.enabled) {
        const raw = draft.suggestion.newValue.trim();
        if (!raw) {
          flash('err', '建议改动需要填入新值');
          return;
        }
        // 智能转换：true/false → boolean；可解析数字 → number；否则字符串
        let val: number | boolean | string;
        if (raw === 'true') val = true;
        else if (raw === 'false') val = false;
        else if (raw !== '' && !Number.isNaN(Number(raw))) val = Number(raw);
        else val = raw;
        suggestion = {
          parameterPath,
          newValue: val,
          ...(draft.suggestion.reason.trim() ? { reason: draft.suggestion.reason.trim() } : {}),
        };
      }
      try {
        const next = appendEntry(doc, {
          parentId,
          parameterPath,
          line: parameterPath === '__verdict' ? 'verdict' : 'parameter',
          author,
          body,
          ...(suggestion ? { suggestion } : {}),
        });
        await persist(next);
        setDraft({ parameterPath: '', body: '', suggestion: { enabled: false, newValue: '', reason: '' } });
        setReplyTo('');
      } catch (e) {
        flash('err', `发布失败：${(e as Error).message}`);
      }
    },
    [draft, doc, author, persist, flash],
  );

  const handleApply = useCallback(
    async (entry: ReviewEntry) => {
      const result = applySuggestion(doc, entry.id, author, updaters);
      if (!result.ok || !result.doc) {
        flash('err', `应用失败：${result.reason ?? '未知错误'}`);
        return;
      }
      await persist(result.doc);
      flash('ok', `已应用建议 → ${entry.suggestion?.parameterPath}`);
    },
    [doc, author, updaters, persist, flash],
  );

  const handleDelete = useCallback(
    async (entryId: string) => {
      if (!confirm('删除这条评论（及其所有回复）？')) return;
      const next = removeEntry(doc, entryId);
      await persist(next);
    },
    [doc, persist],
  );

  const handleStatus = useCallback(
    async (to: ReviewStatus) => {
      if (!canTransition(doc.status, to)) {
        flash('err', `非法状态迁移：${doc.status} → ${to}`);
        return;
      }
      try {
        await persist(transitionStatus(doc, to));
      } catch (e) {
        flash('err', (e as Error).message);
      }
    },
    [doc, persist, flash],
  );

  const handleParamJump = useCallback(
    (path: string) => {
      const split = splitParameterPath(path);
      if (!split) return;
      const [slice] = split;
      setExpandedSlice(slice);
      setExpandedParam(path);
      // 同时切换到对应模块（slice → moduleId 大致对应；不强制 1:1）
      const SLICE_TO_MODULE: Record<string, string> = {
        motorBasics: 'motor-basics',
        threePhase: 'three-phase',
        clarke: 'clarke-transform',
        park: 'park-transform',
        pid: 'pid-control',
        svpwm: 'svpwm',
        inverter: 'inverter',
        sensorless: 'sensorless-foc',
        weakField: 'field-weakening',
        fault: 'faults-debugging',
        controlLoop: 'control-loops',
        foc: 'foc-flow',
        hfi: 'hfi-sensorless',
        startup: 'startup-statemachine',
        apf: 'apf-frontend',
        refrigeration: 'refrigeration-bench',
      };
      const modId = SLICE_TO_MODULE[slice];
      if (modId) setActiveModule(modId as Parameters<typeof setActiveModule>[0]);
    },
    [setActiveModule],
  );

  // ---- 渲染辅助 ----
  const summary = useMemo(() => summarizeReview(doc), [doc]);
  const counts = useMemo(() => countByParameter(doc.entries), [doc.entries]);
  const threadsByParam = useMemo(() => {
    const map = new Map<string, ThreadNode[]>();
    const trees = buildThreads(doc.entries);
    for (const t of trees) {
      const p = t.entry.parameterPath;
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(t);
    }
    return map;
  }, [doc.entries]);

  function renderThread(node: ThreadNode, depth: number) {
    const accent = colorForAuthor(node.entry.author);
    const canDel = !!pat && node.entry.author.toLowerCase() === author.toLowerCase();
    return (
      <div key={node.entry.id} className="space-y-1.5">
        <CommentRenderer
          entry={{ author: node.entry.author, ts: node.entry.ts, body: node.entry.body }}
          colorAccent={accent}
          depth={depth}
          canDelete={canDel}
          onDelete={() => void handleDelete(node.entry.id)}
          onParamClick={handleParamJump}
          headerExtra={
            node.entry.suggestion && !node.entry.suggestionApplied ? (
              <button
                type="button"
                onClick={() => void handleApply(node.entry)}
                aria-label={`应用 ${node.entry.author} 的建议改动到 ${node.entry.suggestion.parameterPath}`}
                className="inline-flex items-center gap-1 rounded border border-accent-measure/50 bg-accent-measure/10 px-2 py-0.5 text-caption text-accent-measure hover:bg-accent-measure/20"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Apply suggestion
              </button>
            ) : node.entry.suggestionApplied ? (
              <span className="inline-flex items-center gap-1 rounded border border-accent-measure/40 bg-accent-measure/10 px-1.5 py-0.5 text-caption text-accent-measure">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                已应用
              </span>
            ) : null
          }
          footer={
            node.entry.suggestion ? (
              <div className="mt-1.5 rounded-md border border-line-subtle bg-bg-surface px-2 py-1 text-caption">
                <span className="text-ink-muted">建议改动：</span>
                <code className="font-mono text-accent-primary">{node.entry.suggestion.parameterPath}</code>
                <span className="mx-1 text-ink-muted">→</span>
                <code className="font-mono text-accent-measure">{String(node.entry.suggestion.newValue)}</code>
                {node.entry.suggestion.reason && (
                  <p className="mt-0.5 text-ink-secondary">{node.entry.suggestion.reason}</p>
                )}
              </div>
            ) : null
          }
        />
        {/* 回复按钮 */}
        <div className="flex items-center gap-2" style={{ marginLeft: Math.min(depth, 4) * 16 + 8 }}>
          <button
            type="button"
            onClick={() => {
              setReplyTo(node.entry.id);
              setDraft((d) => ({
                parameterPath: node.entry.parameterPath,
                body: '',
                suggestion: { enabled: false, newValue: '', reason: '' },
              }));
            }}
            aria-label={`回复 ${node.entry.author}`}
            className="inline-flex items-center gap-1 rounded border border-line-subtle px-1.5 py-0.5 text-caption text-ink-muted hover:border-accent-primary hover:text-accent-primary"
          >
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            回复
          </button>
        </div>
        {/* 子回复 */}
        {node.children.map((c) => renderThread(c, depth + 1))}
        {/* 内联回复表单 */}
        {replyTo === node.entry.id && (
          <div className="space-y-1.5 rounded-md border border-accent-primary/30 bg-bg-base p-2" style={{ marginLeft: Math.min(depth, 4) * 16 + 16 }}>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder={`回复 @${node.entry.author}：支持 **bold** *italic* \`code\` [text](url) {{${node.entry.parameterPath}}}`}
              rows={2}
              aria-label="回复内容"
              className="w-full resize-none rounded border border-line-subtle bg-bg-surface px-2 py-1 text-body focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => void submitComment(node.entry.parameterPath, node.entry.id)} disabled={loading || !draft.body.trim()}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                发布回复
              </Button>
              <Button variant="ghost" onClick={() => { setReplyTo(''); setDraft({ parameterPath: '', body: '', suggestion: { enabled: false, newValue: '', reason: '' } }); }}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- 顶部摘要徽章 ----
  const statusBadge = (
    <span
      role="status"
      className={`rounded-full border px-2 py-0.5 text-caption ${
        doc.status === 'open'
          ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary'
          : doc.status === 'merged'
          ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
          : 'border-ink-muted/40 bg-bg-base text-ink-muted'
      }`}
    >
      状态：{doc.status} · 修订 #{doc.revision}
    </span>
  );

  if (!gistId) {
    return (
      <Card density="default" tone="default" eyebrow="V3 · PR-style review" title="选择 snapshot 后开始评审">
        <p className="text-caption text-ink-muted">
          在【我的快照】或【团队时间线】里点【Review】按钮可打开本面板。
        </p>
        {onClose && (
          <Button className="mt-2" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow="V3 · PR-style review"
      title={`Review · gist ${gistId.slice(0, 8)}…`}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {statusBadge}
          <Button variant="ghost" onClick={() => void refresh()} disabled={loading} aria-label="刷新评论">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            刷新评论
          </Button>
          {onClose && (
            <Button variant="ghost" onClick={onClose} aria-label="关闭 review 面板">
              关闭
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {/* 摘要 + 状态按钮 */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-bg-base px-3 py-2 text-caption">
          <span className="text-ink-primary">
            <strong className="text-accent-primary">{summary.openTopLevel}</strong> 条 open
          </span>
          <span className="text-ink-secondary">
            <strong className="text-accent-measure">{summary.resolvedTopLevel}</strong> 条 resolved
          </span>
          <span className="text-ink-secondary">
            <strong className="text-accent-warn">{summary.suggestions}</strong> 条 suggestions
            （已应用 {summary.appliedSuggestions}）
          </span>
          <span className="ml-auto inline-flex gap-1">
            {(['open', 'closed', 'merged'] as const).map((s) => {
              const enabled = canTransition(doc.status, s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleStatus(s)}
                  disabled={!enabled || loading}
                  aria-label={`切换 review 状态到 ${s}`}
                  className={`rounded-full border px-2 py-0.5 text-caption ${
                    enabled
                      ? 'border-line-subtle text-ink-secondary hover:border-accent-primary hover:text-accent-primary'
                      : 'border-line-subtle text-ink-muted opacity-50'
                  }`}
                >
                  → {s}
                </button>
              );
            })}
          </span>
        </div>

        {/* 17 个 slice 的参数表 */}
        <div className="space-y-1.5">
          {REVIEW_SLICES.map((sliceKey) => {
            const slice = slices[sliceKey as keyof typeof slices] as unknown as Record<string, unknown> | undefined;
            if (!slice) return null;
            const fields = Object.keys(slice);
            if (fields.length === 0) return null;
            const isOpen = expandedSlice === sliceKey;
            const sliceCount = fields.reduce(
              (acc, f) => acc + (counts[`${sliceKey}.${f}`] ?? 0),
              0,
            );
            return (
              <section key={sliceKey} className="rounded-lg border border-line-subtle bg-bg-base">
                <button
                  type="button"
                  onClick={() => setExpandedSlice(isOpen ? '' : sliceKey)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? '折叠' : '展开'} ${SLICE_LABELS[sliceKey as keyof typeof SLICE_LABELS]} 参数列表`}
                >
                  <span className="inline-flex items-center gap-2 text-body text-ink-primary">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-accent-primary" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                    )}
                    <strong>{SLICE_LABELS[sliceKey as keyof typeof SLICE_LABELS]}</strong>
                    <span className="text-caption text-ink-muted">{fields.length} 个参数</span>
                  </span>
                  {sliceCount > 0 && (
                    <span className="rounded-full border border-accent-primary/40 bg-accent-primary/10 px-2 py-0.5 text-caption text-accent-primary">
                      💬 {sliceCount}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <ul className="border-t border-line-subtle p-2">
                    {fields.map((field) => {
                      const path = `${sliceKey}.${field}`;
                      const cnt = counts[path] ?? 0;
                      const threads = threadsByParam.get(path) ?? [];
                      const isParamOpen = expandedParam === path;
                      const value = (slice as Record<string, unknown>)[field];
                      return (
                        <li
                          key={path}
                          className="border-b border-line-subtle/60 last:border-b-0"
                        >
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedParam(isParamOpen ? '' : path)}
                              className="flex-1 text-left"
                              aria-expanded={isParamOpen}
                              aria-label={`${isParamOpen ? '折叠' : '展开'} ${path} 评论`}
                            >
                              <code className="font-mono text-caption text-accent-primary">{path}</code>
                              <span className="ml-2 text-caption text-ink-secondary">= {shortValue(value)}</span>
                            </button>
                            {cnt > 0 && (
                              <span
                                className="rounded-full border border-accent-primary/40 bg-accent-primary/10 px-1.5 py-0.5 text-caption text-accent-primary"
                                aria-label={`${cnt} 条评论`}
                              >
                                💬 {cnt}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedParam(path);
                                setDraft({
                                  parameterPath: path,
                                  body: '',
                                  suggestion: { enabled: false, newValue: String(value ?? ''), reason: '' },
                                });
                                setReplyTo('');
                              }}
                              aria-label={`新增评论锚定到 ${path}`}
                              className="rounded border border-line-subtle px-1.5 py-0.5 text-caption text-ink-muted hover:border-accent-primary hover:text-accent-primary"
                            >
                              <MessageSquarePlus className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                          {isParamOpen && (
                            <div className="space-y-1.5 px-2 pb-2">
                              {threads.length === 0 && (
                                <p className="text-caption text-ink-muted">尚无评论。</p>
                              )}
                              {threads.map((t) => renderThread(t, 0))}
                              {/* 新增顶层评论表单 */}
                              {draft.parameterPath === path && replyTo === '' && (
                                <div className="space-y-1.5 rounded-md border border-accent-primary/30 bg-bg-surface p-2">
                                  <textarea
                                    value={draft.body}
                                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                                    placeholder={`留言锚定到 ${path}（支持 **bold** *italic* \`code\` [text](url) {{${path}}}）`}
                                    rows={3}
                                    aria-label={`针对 ${path} 的新评论内容`}
                                    className="w-full resize-none rounded border border-line-subtle bg-bg-base px-2 py-1 text-body focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                  />
                                  <label className="flex items-center gap-2 text-caption text-ink-secondary">
                                    <input
                                      type="checkbox"
                                      checked={draft.suggestion.enabled}
                                      onChange={(e) =>
                                        setDraft((d) => ({ ...d, suggestion: { ...d.suggestion, enabled: e.target.checked } }))
                                      }
                                      className="h-4 w-4 accent-accent-primary"
                                      aria-label="附加建议改动"
                                    />
                                    附加建议改动（apply 后会调用 store 的 update 函数）
                                  </label>
                                  {draft.suggestion.enabled && (
                                    <div className="flex flex-wrap gap-1.5">
                                      <input
                                        type="text"
                                        value={draft.suggestion.newValue}
                                        onChange={(e) =>
                                          setDraft((d) => ({ ...d, suggestion: { ...d.suggestion, newValue: e.target.value } }))
                                        }
                                        placeholder="新值（数字 / true / false / 字符串）"
                                        aria-label={`${path} 的建议新值`}
                                        className="min-w-[10rem] flex-1 rounded border border-line-subtle bg-bg-base px-2 py-1 font-mono text-caption focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                      />
                                      <input
                                        type="text"
                                        value={draft.suggestion.reason}
                                        onChange={(e) =>
                                          setDraft((d) => ({ ...d, suggestion: { ...d.suggestion, reason: e.target.value } }))
                                        }
                                        placeholder="理由（可空）"
                                        aria-label={`${path} 建议改动的理由`}
                                        className="min-w-[10rem] flex-1 rounded border border-line-subtle bg-bg-base px-2 py-1 text-caption focus:outline-none focus:ring-2 focus:ring-accent-primary"
                                      />
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <Button variant="primary" onClick={() => void submitComment(path, null)} disabled={loading || !draft.body.trim()}>
                                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                      发布评论
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() => {
                                        setDraft({ parameterPath: '', body: '', suggestion: { enabled: false, newValue: '', reason: '' } });
                                      }}
                                    >
                                      取消
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {!pat && (
          <p className="text-caption text-accent-warn">绑定 PAT 后才能写入 / 应用建议。当前只可只读浏览。</p>
        )}
        <p className="text-caption text-ink-muted">
          作者：<strong className="text-ink-primary">@{author}</strong>
          {activeReviewer && activeReviewer !== ghLogin && (
            <span className="ml-1 text-ink-muted">（来自 reviewers store）</span>
          )}
        </p>
      </div>
    </Card>
  );
}
