import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  CloudDownload,
  Copy,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  MessageSquare,
  Send,
  UserPlus,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useSimulationStore } from '../../store/simulationStore';
import { useAssemblyProgressStore } from '../../store/assemblyProgressStore';
import { useChallengeStore } from '../../store/challengeStore';
import { useSnapshotsStore } from '../../store/snapshotsStore';
import { useCloudShareStore } from '../../store/cloudShareStore';
import {
  GistError,
  createSnapshot,
  deleteSnapshot,
  extractGistId,
  fetchSnapshot,
  listMine,
  listUser,
  updateComments,
  type GistMeta,
} from '../../utils/gistCloud';
import {
  addComment,
  parseComments,
  removeComment,
  type CommentEntry,
} from '../../utils/broadcastShare';
import {
  decodeSnapshot,
  encodeSnapshot,
  packAppState,
  type AppStateInput,
  type DecodedSnapshot,
} from '../../utils/snapshotCodec';
import { CommentRenderer } from './CommentRenderer';
import { SnapshotReviewPanel } from './SnapshotReviewPanel';
import { SnapshotTimeline } from './SnapshotTimeline';
import { SnapshotPickerDialog } from './SnapshotPickerDialog';

/**
 * 数字孪生 V2 · 云协作面板。
 *
 * 三个 tab：
 *   1. 我的快照：列已上传的 gist + 复制链接 / 评论 / 删除
 *   2. 导入分享：粘贴 gist URL / id → fetch → 直接灌入 remoteSnapshots（V1 已有的对比通道）
 *   3. 团队时间线：聚合多个 GitHub 用户公共 gist，按时间倒序展示
 *
 * V1 本地 URL token 分享继续生效（ShareSnapshotPanel 仍保留）。
 */

type Tab = 'mine' | 'import' | 'team' | 'review';

function pickCurrentState(): AppStateInput {
  const sim = useSimulationStore.getState();
  const asmProgress = useAssemblyProgressStore.getState();
  const challenge = useChallengeStore.getState();
  const lastHistory = asmProgress.history[asmProgress.history.length - 1];
  const challengeBestValues: Record<string, number> = {};
  for (const [id, rec] of Object.entries(challenge.records)) {
    if (rec.solved && typeof rec.bestValue === 'number' && Number.isFinite(rec.bestValue)) {
      challengeBestValues[id] = rec.bestValue;
    }
  }
  return packAppState(
    {
      motorBasics: sim.motorBasics,
      threePhase: sim.threePhase,
      clarke: sim.clarke,
      park: sim.park,
      pid: sim.pid,
      svpwm: sim.svpwm,
      inverter: sim.inverter,
      sensorless: sim.sensorless,
      weakField: sim.weakField,
      fault: sim.fault,
      controlLoop: sim.controlLoop,
      foc: sim.foc,
      hfi: sim.hfi,
      startup: sim.startup,
      apf: sim.apf,
      refrigeration: sim.refrigeration,
    },
    lastHistory?.slotIds,
    Object.keys(challengeBestValues).length ? challengeBestValues : undefined,
  );
}

interface CloudSharePanelProps {
  /** 让父级可选地把"接收到的 decoded snapshot"丢给 V1 的 ReceiveSnapshotModal */
  onReceive?: (decoded: DecodedSnapshot, source: string) => void;
}

export function CloudSharePanel({ onReceive }: CloudSharePanelProps = {}) {
  const pat = useCloudShareStore((s) => s.pat);
  const ghLogin = useCloudShareStore((s) => s.ghLogin);
  const team = useCloudShareStore((s) => s.team);
  const addTeamMember = useCloudShareStore((s) => s.addTeamMember);
  const removeTeamMember = useCloudShareStore((s) => s.removeTeamMember);
  const realtimeSync = useCloudShareStore((s) => s.realtimeSync);
  const setRealtimeSync = useCloudShareStore((s) => s.setRealtimeSync);
  const connectedTabs = useCloudShareStore((s) => s.connectedTabs);

  const addRemote = useSnapshotsStore((s) => s.addRemote);

  const [tab, setTab] = useState<Tab>('mine');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // V3 · PR Review tab：当前选中的 snapshot gistId + picker dialog 开关
  const [reviewGistId, setReviewGistId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const showFlash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setFlash({ kind, msg });
    const t = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, []);

  const handleError = useCallback(
    (e: unknown, ctx: string) => {
      const msg = e instanceof GistError ? e.message : (e as Error).message;
      showFlash('err', `${ctx}：${msg}`);
    },
    [showFlash],
  );

  // ---- 「我的快照」-----------------------------------------------------------
  const [myList, setMyList] = useState<GistMeta[]>([]);
  const [uploadDesc, setUploadDesc] = useState('我的当前调参 snapshot');
  const [uploadPublic, setUploadPublic] = useState(false);

  const refreshMine = useCallback(async () => {
    if (!pat) {
      showFlash('err', '需要先绑定 PAT 才能列出我的快照');
      return;
    }
    setBusy(true);
    try {
      const list = await listMine(pat, 30);
      setMyList(list);
      showFlash('ok', `已加载 ${list.length} 条云端快照`);
    } catch (e) {
      handleError(e, '列出我的快照');
    } finally {
      setBusy(false);
    }
  }, [pat, showFlash, handleError]);

  useEffect(() => {
    if (tab === 'mine' && pat && myList.length === 0) {
      void refreshMine();
    }
  }, [tab, pat, myList.length, refreshMine]);

  const handleUpload = useCallback(async () => {
    if (!pat) {
      showFlash('err', '需要先绑定 PAT 才能上传到 GitHub Gist');
      return;
    }
    setBusy(true);
    try {
      const input = pickCurrentState();
      const encoded = encodeSnapshot(input);
      const result = await createSnapshot(pat, encoded, {
        description: uploadDesc.trim() || '电机控制学习客户端 · 数字孪生 snapshot',
        public: uploadPublic,
        label: uploadDesc.trim() || undefined,
      });
      showFlash('ok', `已上传到 Gist：${result.gistId.slice(0, 8)}…`);
      await refreshMine();
    } catch (e) {
      handleError(e, '上传');
    } finally {
      setBusy(false);
    }
  }, [pat, uploadDesc, uploadPublic, showFlash, refreshMine, handleError]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!pat) return;
      if (!window.confirm(`确定删除 gist ${id.slice(0, 8)}… 吗？此操作不可撤销。`)) return;
      setBusy(true);
      try {
        await deleteSnapshot(pat, id);
        setMyList((cur) => cur.filter((g) => g.id !== id));
        showFlash('ok', '已删除');
      } catch (e) {
        handleError(e, '删除');
      } finally {
        setBusy(false);
      }
    },
    [pat, showFlash, handleError],
  );

  const handleCopyLink = useCallback(
    (url: string) => {
      navigator.clipboard?.writeText(url).then(
        () => showFlash('ok', '链接已复制到剪贴板'),
        () => showFlash('err', '复制失败，请手动选中'),
      );
    },
    [showFlash],
  );

  // ---- 「导入分享」 -----------------------------------------------------------
  const [importInput, setImportInput] = useState('');

  const handleImport = useCallback(async () => {
    const id = extractGistId(importInput);
    if (!id) {
      showFlash('err', '无法识别 gist id（请粘贴完整链接或纯 id）');
      return;
    }
    setBusy(true);
    try {
      const { encodedToken, meta } = await fetchSnapshot(id, pat || undefined);
      const decoded = decodeSnapshot(encodedToken);
      if (!decoded.ok || !decoded.state) {
        showFlash('err', `Gist 内容解码失败：${decoded.error ?? '未知'}`);
        return;
      }
      addRemote({
        token: encodedToken,
        decoded: decoded.state,
        label: meta.description || `来自 @${meta.ownerLogin ?? 'gist'}`,
      });
      if (onReceive) onReceive(decoded.state, meta.description || meta.id);
      setImportInput('');
      showFlash('ok', '已添加到远端快照列表（可在下方对比 / 应用）');
    } catch (e) {
      handleError(e, '导入');
    } finally {
      setBusy(false);
    }
  }, [importInput, pat, addRemote, onReceive, showFlash, handleError]);

  // ---- 「团队时间线」 ---------------------------------------------------------
  const [teamFeed, setTeamFeed] = useState<Array<GistMeta & { byMember: string }>>([]);
  const [teamUserDraft, setTeamUserDraft] = useState('');
  const [teamAliasDraft, setTeamAliasDraft] = useState('');

  const refreshTeam = useCallback(async () => {
    if (team.length === 0) {
      setTeamFeed([]);
      return;
    }
    setBusy(true);
    try {
      const all: Array<GistMeta & { byMember: string }> = [];
      for (const m of team) {
        try {
          const items = await listUser(m.username, 3);
          for (const g of items) all.push({ ...g, byMember: m.alias || m.username });
        } catch (e) {
          showFlash('err', `获取 @${m.username} 的 gist 失败：${(e as Error).message}`);
        }
      }
      all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      setTeamFeed(all);
      showFlash('ok', `已聚合 ${all.length} 条团队快照`);
    } finally {
      setBusy(false);
    }
  }, [team, showFlash]);

  const handleAddTeam = useCallback(() => {
    const res = addTeamMember(teamUserDraft, teamAliasDraft);
    if (res.ok) {
      setTeamUserDraft('');
      setTeamAliasDraft('');
      showFlash('ok', '已添加成员');
    } else {
      showFlash('err', res.reason ?? '添加失败');
    }
  }, [teamUserDraft, teamAliasDraft, addTeamMember, showFlash]);

  // ---- 评论 ------------------------------------------------------------------
  const [commentTarget, setCommentTarget] = useState<string>(''); // gist id
  const [commentList, setCommentList] = useState<CommentEntry[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const openComments = useCallback(
    async (gistId: string) => {
      setCommentTarget(gistId);
      setCommentList([]);
      setCommentLoading(true);
      try {
        const { comments } = await fetchSnapshot(gistId, pat || undefined);
        setCommentList(parseComments(comments));
      } catch (e) {
        handleError(e, '加载评论');
      } finally {
        setCommentLoading(false);
      }
    },
    [pat, handleError],
  );

  const closeComments = useCallback(() => {
    setCommentTarget('');
    setCommentList([]);
    setCommentDraft('');
  }, []);

  const submitComment = useCallback(async () => {
    const body = commentDraft.trim();
    if (!body) return;
    if (!pat || !ghLogin) {
      showFlash('err', '提交评论需要先绑定 PAT');
      return;
    }
    setCommentLoading(true);
    try {
      const { comments } = await fetchSnapshot(commentTarget, pat);
      const next = addComment(comments, {
        author: ghLogin,
        ts: new Date().toISOString(),
        body,
      });
      await updateComments(pat, commentTarget, next);
      setCommentList(parseComments(next));
      setCommentDraft('');
      showFlash('ok', '评论已发布');
    } catch (e) {
      handleError(e, '发布评论');
    } finally {
      setCommentLoading(false);
    }
  }, [commentDraft, pat, ghLogin, commentTarget, showFlash, handleError]);

  const deleteCommentAt = useCallback(
    async (idx: number) => {
      if (!pat) return;
      if (!window.confirm('删除这条评论？')) return;
      setCommentLoading(true);
      try {
        const { comments } = await fetchSnapshot(commentTarget, pat);
        const next = removeComment(comments, idx);
        await updateComments(pat, commentTarget, next);
        setCommentList(parseComments(next));
        showFlash('ok', '已删除');
      } catch (e) {
        handleError(e, '删除评论');
      } finally {
        setCommentLoading(false);
      }
    },
    [pat, commentTarget, showFlash, handleError],
  );

  // ---- 实时同步 toggle UI ---------------------------------------------------
  const realtimeBadge = useMemo(() => {
    if (!realtimeSync) {
      return (
        <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          实时同步：关
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-caption text-accent-measure">
        <span className="h-2 w-2 rounded-full bg-accent-measure" aria-hidden="true" />
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        实时同步：已连接 {connectedTabs} 个标签
      </span>
    );
  }, [realtimeSync, connectedTabs]);

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow="LAB · 云协作"
      title="GitHub Gist · 团队共享 / 时间线 / 评论"
      action={
        flash ? (
          <span
            role="status"
            aria-live="polite"
            className={`rounded-md border px-2 py-0.5 text-caption ${
              flash.kind === 'ok'
                ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
                : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault'
            }`}
          >
            {flash.msg}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div role="tablist" aria-label="云协作子页面" className="flex flex-wrap gap-1.5 border-b border-line-subtle">
          {(
            [
              { id: 'mine', label: '我的快照', icon: Cloud },
              { id: 'import', label: '导入分享', icon: CloudDownload },
              { id: 'team', label: '团队时间线', icon: Users },
              { id: 'review', label: 'PR Review', icon: GitPullRequest },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`cloud-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-body transition-colors ${
                  active
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
          <span className="ml-auto self-center pr-1">{realtimeBadge}</span>
        </div>

        {/* 实时同步 toggle */}
        <div className="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-base px-3 py-2">
          <div className="text-caption text-ink-secondary">
            <strong className="text-ink-primary">跨标签页实时同步</strong>
            <span className="ml-2 text-ink-muted">
              （开启后，本浏览器其它标签调参会实时灌入本标签；默认关）
            </span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="sr-only">实时同步开关</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={realtimeSync}
              checked={realtimeSync}
              onChange={(e) => setRealtimeSync(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent-primary"
            />
            <span className="text-caption text-ink-primary">{realtimeSync ? '已开启' : '关闭'}</span>
          </label>
        </div>

        {/* Tab: 我的快照 */}
        {tab === 'mine' && (
          <section id="cloud-tab-mine" role="tabpanel" aria-labelledby="cloud-tab-mine" className="space-y-3">
            {/* 上传卡 */}
            <div className="space-y-2 rounded-lg border border-line-subtle bg-bg-base p-3">
              <h4 className="text-caption uppercase tracking-[0.18em] text-ink-muted">上传当前参数</h4>
              <input
                type="text"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="给这份 snapshot 加个描述"
                aria-label="上传描述"
                className="w-full rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-caption text-ink-secondary">
                <input
                  type="checkbox"
                  checked={uploadPublic}
                  onChange={(e) => setUploadPublic(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent-primary"
                  aria-label="设为公开 gist"
                />
                设为<strong className="text-ink-primary">公开</strong> gist（任何人凭 id 可读；私密 gist 仅 PAT 持有者可读）
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={handleUpload}
                  disabled={busy || !pat}
                  aria-label="上传当前参数到 GitHub Gist"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Cloud className="h-4 w-4" aria-hidden="true" />
                  )}
                  上传到 Gist
                </Button>
                <Button variant="ghost" onClick={refreshMine} disabled={busy || !pat} aria-label="刷新我的 gist 列表">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  刷新列表
                </Button>
              </div>
              {!pat && (
                <p className="text-caption text-accent-warn">
                  请先在上方「GitHub Gist 凭据」卡里绑定 PAT。
                </p>
              )}
            </div>

            {/* 列表 */}
            {myList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted">
                暂无云端快照。绑定 PAT 后上传，或点【刷新列表】拉取已有 gist。
              </p>
            ) : (
              <ul className="space-y-1.5">
                {myList.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-bg-surface px-2.5 py-1.5"
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-caption ${
                        g.public
                          ? 'border border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
                          : 'border border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
                      }`}
                    >
                      {g.public ? '公开' : '私密'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink-primary" title={g.description}>
                        {g.description || `(无描述) ${g.id.slice(0, 8)}…`}
                      </p>
                      <p className="text-caption text-ink-muted">
                        {g.createdAt ? new Date(g.createdAt).toLocaleString('zh-CN') : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleCopyLink(g.htmlUrl)}
                      aria-label={`复制 ${g.id.slice(0, 8)} 链接`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => openComments(g.id)}
                      aria-label={`查看 ${g.id.slice(0, 8)} 的评论`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(g.id)}
                      aria-label={`删除 ${g.id.slice(0, 8)}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Tab: 导入分享 */}
        {tab === 'import' && (
          <section id="cloud-tab-import" role="tabpanel" className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex-1">
                <span className="sr-only">Gist URL 或 id</span>
                <input
                  type="text"
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleImport();
                    }
                  }}
                  placeholder="贴入 https://gist.github.com/<user>/<id> 或纯 id"
                  aria-label="导入 Gist 链接或 ID"
                  className="w-full rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </label>
              <Button variant="primary" onClick={handleImport} disabled={busy} aria-label="拉取 gist">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudDownload className="h-4 w-4" aria-hidden="true" />
                )}
                拉取
              </Button>
            </div>
            <p className="text-caption text-ink-muted">
              公共 gist 无需 PAT；私密 gist 需要绑定具备 <code className="rounded bg-bg-base px-1 font-mono">gist</code>{' '}
              scope 的 PAT。
            </p>
          </section>
        )}

        {/* Tab: 团队时间线 */}
        {tab === 'team' && (
          <section id="cloud-tab-team" role="tabpanel" className="space-y-3">
            {/* 添加成员 */}
            <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
              <h4 className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
                团队成员（{team.length} / 5）
              </h4>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={teamUserDraft}
                  onChange={(e) => setTeamUserDraft(e.target.value)}
                  placeholder="GitHub username"
                  aria-label="新成员 GitHub 用户名"
                  className="min-w-[10rem] flex-1 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 font-mono text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <input
                  type="text"
                  value={teamAliasDraft}
                  onChange={(e) => setTeamAliasDraft(e.target.value)}
                  placeholder="中文别名（可空）"
                  aria-label="新成员别名"
                  className="min-w-[8rem] flex-1 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <Button variant="primary" onClick={handleAddTeam} aria-label="添加团队成员">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  添加
                </Button>
                <Button
                  variant="ghost"
                  onClick={refreshTeam}
                  disabled={busy || team.length === 0}
                  aria-label="刷新团队时间线"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  刷新
                </Button>
              </div>
              {team.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {team.map((m) => (
                    <li
                      key={m.username}
                      className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-bg-surface px-2 py-0.5 text-caption text-ink-secondary"
                    >
                      <span className="font-mono">@{m.username}</span>
                      {m.alias && <span className="text-ink-muted">· {m.alias}</span>}
                      <button
                        type="button"
                        onClick={() => removeTeamMember(m.username)}
                        aria-label={`移除 ${m.username}`}
                        className="ml-1 rounded text-ink-muted hover:text-accent-fault"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 时间线 */}
            {teamFeed.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted">
                {team.length === 0
                  ? '尚未添加团队成员。每位成员的最近 3 条公共 gist 会汇总到这里。'
                  : '点【刷新】拉取团队成员的最近公共 gist。'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {teamFeed.map((g) => (
                  <li
                    key={`${g.byMember}:${g.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-bg-surface px-2.5 py-1.5"
                  >
                    <span className="shrink-0 font-mono text-caption text-accent-primary">
                      {g.byMember}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink-primary" title={g.description}>
                        {g.description || `(无描述) ${g.id.slice(0, 8)}…`}
                      </p>
                      <p className="text-caption text-ink-muted">
                        {g.updatedAt ? new Date(g.updatedAt).toLocaleString('zh-CN') : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setImportInput(g.id);
                        setTab('import');
                      }}
                      aria-label={`导入 ${g.byMember} 的 ${g.id.slice(0, 8)}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                      导入
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Tab: V3 PR Review */}
        {tab === 'review' && (
          <section
            id="cloud-tab-review"
            role="tabpanel"
            aria-labelledby="cloud-tab-review"
            className="space-y-3"
          >
            {/* snapshot 选择条 */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-bg-base px-3 py-2">
              <div className="min-w-0 flex-1">
                {reviewGistId ? (
                  <p className="text-caption text-ink-primary">
                    当前 review 目标：
                    <code className="ml-1 rounded bg-bg-surface px-1.5 py-0.5 font-mono text-accent-primary">
                      {reviewGistId.slice(0, 12)}…
                    </code>
                  </p>
                ) : (
                  <p className="text-caption text-ink-muted">
                    尚未选择 snapshot。点【选择 snapshot】从【我的快照】或粘贴 gist URL 入口加载。
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => setPickerOpen(true)}
                aria-label="打开 snapshot 选择窗口"
              >
                <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                {reviewGistId ? '更换 snapshot' : '选择 snapshot'}
              </Button>
              {reviewGistId && (
                <Button
                  variant="ghost"
                  onClick={() => setReviewGistId('')}
                  aria-label="清空当前 review 目标"
                >
                  清空
                </Button>
              )}
            </div>

            {/* 组合视图：review 面板（参数级评论 + 建议改动） + 时间线 */}
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
              <div className="min-w-0">
                <SnapshotReviewPanel gistId={reviewGistId} onFlash={showFlash} />
              </div>
              <div className="min-w-0">
                <SnapshotTimeline gistId={reviewGistId} onFlash={showFlash} />
              </div>
            </div>
          </section>
        )}

        {/* 评论抽屉 */}
        {commentTarget && (
          <div
            className="rounded-lg border border-accent-primary/40 bg-bg-base p-3"
            role="region"
            aria-label="评论"
          >
            <header className="mb-2 flex items-center justify-between">
              <h4 className="text-body text-ink-primary">
                <MessageSquare className="mr-1 inline h-4 w-4 text-accent-primary" aria-hidden="true" />
                评论 · gist {commentTarget.slice(0, 8)}…
              </h4>
              <button
                type="button"
                onClick={closeComments}
                aria-label="关闭评论"
                className="rounded border border-line-subtle px-2 py-0.5 text-caption text-ink-secondary hover:text-ink-primary"
              >
                关闭
              </button>
            </header>
            {commentLoading && (
              <p className="text-caption text-ink-muted">
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                正在加载…
              </p>
            )}
            <div className="space-y-2">
              {commentList.length === 0 && !commentLoading && (
                <p className="text-caption text-ink-muted">尚无评论。</p>
              )}
              {commentList.map((c, i) => (
                <CommentRenderer
                  key={`${c.author}-${c.ts}-${i}`}
                  entry={c}
                  index={i}
                  canDelete={!!pat && c.author === ghLogin}
                  onDelete={() => deleteCommentAt(i)}
                />
              ))}
            </div>
            {pat && ghLogin && (
              <div className="mt-3 space-y-1.5">
                <label className="block">
                  <span className="sr-only">新评论 Markdown</span>
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="支持 **粗体**、*斜体*、`代码`、换行"
                    rows={3}
                    aria-label="新评论内容"
                    className="w-full resize-none rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                </label>
                <Button
                  variant="primary"
                  onClick={submitComment}
                  disabled={commentLoading || !commentDraft.trim()}
                  aria-label="发布评论"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  发布
                </Button>
              </div>
            )}
            {(!pat || !ghLogin) && (
              <p className="mt-2 text-caption text-accent-warn">绑定 PAT 后才能发布 / 删除评论。</p>
            )}
          </div>
        )}
      </div>

      {/* V3 · snapshot picker dialog（review tab 入口）；放在 Card 内最末，避免抢 tab 焦点 */}
      <SnapshotPickerDialog
        open={pickerOpen}
        onPick={(id) => {
          setReviewGistId(id);
          setTab('review');
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Card>
  );
}
