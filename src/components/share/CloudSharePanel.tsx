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
import { useI18n } from '../../i18n/useI18n';

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
  const { t } = useI18n();
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
      showFlash('err', `${ctx}${t('share.errColon')}${msg}`);
    },
    [showFlash, t],
  );

  // ---- 「我的快照」-----------------------------------------------------------
  const [myList, setMyList] = useState<GistMeta[]>([]);
  const [uploadDesc, setUploadDesc] = useState(() => t('share.cloudUploadDefaultDesc'));
  const [uploadPublic, setUploadPublic] = useState(false);

  const refreshMine = useCallback(async () => {
    if (!pat) {
      showFlash('err', t('share.cloudNeedPatList'));
      return;
    }
    setBusy(true);
    try {
      const list = await listMine(pat, 30);
      setMyList(list);
      showFlash('ok', `${t('share.cloudLoadedCountPrefix')}${list.length}${t('share.cloudLoadedCountSuffix')}`);
    } catch (e) {
      handleError(e, t('share.ctxListMine'));
    } finally {
      setBusy(false);
    }
  }, [pat, showFlash, handleError, t]);

  useEffect(() => {
    if (tab === 'mine' && pat && myList.length === 0) {
      void refreshMine();
    }
  }, [tab, pat, myList.length, refreshMine]);

  const handleUpload = useCallback(async () => {
    if (!pat) {
      showFlash('err', t('share.cloudNeedPatUpload'));
      return;
    }
    setBusy(true);
    try {
      const input = pickCurrentState();
      const encoded = encodeSnapshot(input);
      const result = await createSnapshot(pat, encoded, {
        description: uploadDesc.trim() || t('share.uploadFallbackDesc'),
        public: uploadPublic,
        label: uploadDesc.trim() || undefined,
      });
      showFlash('ok', `${t('share.uploadedToGistPrefix')}${result.gistId.slice(0, 8)}…`);
      await refreshMine();
    } catch (e) {
      handleError(e, t('share.ctxUpload'));
    } finally {
      setBusy(false);
    }
  }, [pat, uploadDesc, uploadPublic, showFlash, refreshMine, handleError, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!pat) return;
      if (!window.confirm(`${t('share.cloudDeleteConfirmA')}${id.slice(0, 8)}…${t('share.cloudDeleteConfirmB')}`)) return;
      setBusy(true);
      try {
        await deleteSnapshot(pat, id);
        setMyList((cur) => cur.filter((g) => g.id !== id));
        showFlash('ok', t('share.deletedFlash'));
      } catch (e) {
        handleError(e, t('share.ctxDelete'));
      } finally {
        setBusy(false);
      }
    },
    [pat, showFlash, handleError, t],
  );

  const handleCopyLink = useCallback(
    (url: string) => {
      navigator.clipboard?.writeText(url).then(
        () => showFlash('ok', t('share.linkCopied')),
        () => showFlash('err', t('share.cloudCopyFail')),
      );
    },
    [showFlash, t],
  );

  // ---- 「导入分享」 -----------------------------------------------------------
  const [importInput, setImportInput] = useState('');

  const handleImport = useCallback(async () => {
    const id = extractGistId(importInput);
    if (!id) {
      showFlash('err', t('share.cloudBadGistId'));
      return;
    }
    setBusy(true);
    try {
      const { encodedToken, meta } = await fetchSnapshot(id, pat || undefined);
      const decoded = decodeSnapshot(encodedToken);
      if (!decoded.ok || !decoded.state) {
        showFlash('err', `${t('share.cloudDecodeFailPrefix')}${decoded.error ?? t('share.cloudUnknown')}`);
        return;
      }
      addRemote({
        token: encodedToken,
        decoded: decoded.state,
        label: meta.description || `${t('share.cloudFromOwnerPrefix')}${meta.ownerLogin ?? 'gist'}`,
      });
      if (onReceive) onReceive(decoded.state, meta.description || meta.id);
      setImportInput('');
      showFlash('ok', t('share.cloudAddedToRemote'));
    } catch (e) {
      handleError(e, t('share.ctxImport'));
    } finally {
      setBusy(false);
    }
  }, [importInput, pat, addRemote, onReceive, showFlash, handleError, t]);

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
          showFlash('err', `${t('share.cloudFetchUserGistFailPrefix')}${m.username}${t('share.cloudFetchUserGistFailMid')}${(e as Error).message}`);
        }
      }
      all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      setTeamFeed(all);
      showFlash('ok', `${t('share.cloudAggregatedPrefix')}${all.length}${t('share.cloudAggregatedSuffix')}`);
    } finally {
      setBusy(false);
    }
  }, [team, showFlash, t]);

  const handleAddTeam = useCallback(() => {
    const res = addTeamMember(teamUserDraft, teamAliasDraft);
    if (res.ok) {
      setTeamUserDraft('');
      setTeamAliasDraft('');
      showFlash('ok', t('share.cloudMemberAdded'));
    } else {
      showFlash('err', res.reason ?? t('share.cloudAddMemberFail'));
    }
  }, [teamUserDraft, teamAliasDraft, addTeamMember, showFlash, t]);

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
        handleError(e, t('share.ctxLoadComments'));
      } finally {
        setCommentLoading(false);
      }
    },
    [pat, handleError, t],
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
      showFlash('err', t('share.cloudSubmitCommentNeedPat'));
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
      showFlash('ok', t('share.cloudCommentPosted'));
    } catch (e) {
      handleError(e, t('share.publishComment'));
    } finally {
      setCommentLoading(false);
    }
  }, [commentDraft, pat, ghLogin, commentTarget, showFlash, handleError, t]);

  const deleteCommentAt = useCallback(
    async (idx: number) => {
      if (!pat) return;
      if (!window.confirm(t('share.cloudConfirmDeleteComment'))) return;
      setCommentLoading(true);
      try {
        const { comments } = await fetchSnapshot(commentTarget, pat);
        const next = removeComment(comments, idx);
        await updateComments(pat, commentTarget, next);
        setCommentList(parseComments(next));
        showFlash('ok', t('share.deletedFlash'));
      } catch (e) {
        handleError(e, t('share.ctxDeleteComment'));
      } finally {
        setCommentLoading(false);
      }
    },
    [pat, commentTarget, showFlash, handleError, t],
  );

  // ---- 实时同步 toggle UI ---------------------------------------------------
  const realtimeBadge = useMemo(() => {
    if (!realtimeSync) {
      return (
        <span className="inline-flex items-center gap-1 text-caption text-ink-muted">
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          {t('share.cloudRealtimeOff')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-caption text-accent-measure">
        <span className="h-2 w-2 rounded-full bg-accent-measure" aria-hidden="true" />
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        {t('share.cloudRealtimeOnPrefix')}
        {connectedTabs}
        {t('share.cloudRealtimeOnSuffix')}
      </span>
    );
  }, [realtimeSync, connectedTabs, t]);

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow={t('share.cloudEyebrow')}
      title={t('share.cloudTitle')}
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
        <div role="tablist" aria-label={t('share.cloudTablistAria')} className="flex flex-wrap gap-1.5 border-b border-line-subtle">
          {(
            [
              { id: 'mine', label: t('share.cloudTabMine'), icon: Cloud },
              { id: 'import', label: t('share.cloudTabImport'), icon: CloudDownload },
              { id: 'team', label: t('share.cloudTabTeam'), icon: Users },
              { id: 'review', label: 'PR Review', icon: GitPullRequest },
            ] as const
          ).map((tabDef) => {
            const Icon = tabDef.icon;
            const active = tab === tabDef.id;
            return (
              <button
                key={tabDef.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`cloud-tab-${tabDef.id}`}
                onClick={() => setTab(tabDef.id)}
                className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-1.5 text-body transition-colors ${
                  active
                    ? 'border-accent-primary text-accent-primary'
                    : 'border-transparent text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tabDef.label}
              </button>
            );
          })}
          <span className="ml-auto self-center pr-1">{realtimeBadge}</span>
        </div>

        {/* 实时同步 toggle */}
        <div className="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-base px-3 py-2">
          <div className="text-caption text-ink-secondary">
            <strong className="text-ink-primary">{t('share.cloudRtTitle')}</strong>
            <span className="ml-2 text-ink-muted">{t('share.cloudRtHint')}</span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="sr-only">{t('share.cloudRtSwitchSr')}</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={realtimeSync}
              checked={realtimeSync}
              onChange={(e) => setRealtimeSync(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent-primary"
            />
            <span className="text-caption text-ink-primary">
              {realtimeSync ? t('share.cloudRtOn') : t('share.cloudRtOff')}
            </span>
          </label>
        </div>

        {/* Tab: 我的快照 */}
        {tab === 'mine' && (
          <section id="cloud-tab-mine" role="tabpanel" aria-labelledby="cloud-tab-mine" className="space-y-3">
            {/* 上传卡 */}
            <div className="space-y-2 rounded-lg border border-line-subtle bg-bg-base p-3">
              <h4 className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('share.cloudUploadHeading')}</h4>
              <input
                type="text"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder={t('share.cloudUploadDescPlaceholder')}
                aria-label={t('share.cloudUploadDescAria')}
                className="w-full rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-caption text-ink-secondary">
                <input
                  type="checkbox"
                  checked={uploadPublic}
                  onChange={(e) => setUploadPublic(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent-primary"
                  aria-label={t('share.cloudPublicAria')}
                />
                {t('share.cloudPublicLabelPrefix')}
                <strong className="text-ink-primary">{t('share.cloudPublicLabelStrong')}</strong>
                {t('share.cloudPublicLabelSuffix')}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={handleUpload}
                  disabled={busy || !pat}
                  aria-label={t('share.cloudUploadBtnAria')}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Cloud className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('share.uploadToGistBtn')}
                </Button>
                <Button variant="ghost" onClick={refreshMine} disabled={busy || !pat} aria-label={t('share.refreshMyGistListAria')}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t('share.cloudRefreshListBtn')}
                </Button>
              </div>
              {!pat && (
                <p className="text-caption text-accent-warn">{t('share.cloudBindPatHint')}</p>
              )}
            </div>

            {/* 列表 */}
            {myList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted">
                {t('share.cloudNoSnapshots')}
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
                      {g.public ? t('share.publicBadge') : t('share.privateBadge')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-ink-primary" title={g.description}>
                        {g.description || `${t('share.noDescPrefix')}${g.id.slice(0, 8)}…`}
                      </p>
                      <p className="text-caption text-ink-muted">
                        {g.createdAt ? new Date(g.createdAt).toLocaleString('zh-CN') : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => handleCopyLink(g.htmlUrl)}
                      aria-label={`${t('share.cloudCopyAriaPrefix')}${g.id.slice(0, 8)}${t('share.cloudCopyAriaMid')}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => openComments(g.id)}
                      aria-label={`${t('share.cloudViewCommentsAriaPrefix')}${g.id.slice(0, 8)}${t('share.cloudViewCommentsAriaMid')}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(g.id)}
                      aria-label={`${t('share.deleteAriaPrefix')}${g.id.slice(0, 8)}`}
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
                <span className="sr-only">{t('share.cloudGistUrlSr')}</span>
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
                  placeholder={t('share.cloudImportPlaceholder')}
                  aria-label={t('share.cloudImportAria')}
                  className="w-full rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </label>
              <Button variant="primary" onClick={handleImport} disabled={busy} aria-label={t('share.cloudFetchBtnAria')}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudDownload className="h-4 w-4" aria-hidden="true" />
                )}
                {t('share.cloudFetchBtn')}
              </Button>
            </div>
            <p className="text-caption text-ink-muted">
              {t('share.cloudImportHintA')}
              <code className="rounded bg-bg-base px-1 font-mono">gist</code>
              {t('share.cloudImportHintB')}
            </p>
          </section>
        )}

        {/* Tab: 团队时间线 */}
        {tab === 'team' && (
          <section id="cloud-tab-team" role="tabpanel" className="space-y-3">
            {/* 添加成员 */}
            <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
              <h4 className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted">
                {t('share.cloudTeamHeadingPrefix')}
                {team.length}
                {t('share.cloudTeamHeadingSuffix')}
              </h4>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={teamUserDraft}
                  onChange={(e) => setTeamUserDraft(e.target.value)}
                  placeholder="GitHub username"
                  aria-label={t('share.cloudMemberAria')}
                  className="min-w-[10rem] flex-1 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 font-mono text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <input
                  type="text"
                  value={teamAliasDraft}
                  onChange={(e) => setTeamAliasDraft(e.target.value)}
                  placeholder={t('share.cloudAliasPlaceholder')}
                  aria-label={t('share.cloudAliasAria')}
                  className="min-w-[8rem] flex-1 rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <Button variant="primary" onClick={handleAddTeam} aria-label={t('share.cloudAddMemberAria')}>
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {t('share.addBtn')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={refreshTeam}
                  disabled={busy || team.length === 0}
                  aria-label={t('share.cloudRefreshTeamAria')}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('share.refreshBtn')}
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
                        aria-label={`${t('share.cloudRemoveMemberAriaPrefix')}${m.username}`}
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
                {team.length === 0 ? t('share.cloudTeamEmptyA') : t('share.cloudTeamEmptyB')}
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
                        {g.description || `${t('share.noDescPrefix')}${g.id.slice(0, 8)}…`}
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
                      aria-label={`${t('share.cloudImportAriaPrefix')}${g.byMember}${t('share.cloudImportAriaMid')}${g.id.slice(0, 8)}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('share.cloudImportBtn')}
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
                    {t('share.cloudReviewTargetLabel')}
                    <code className="ml-1 rounded bg-bg-surface px-1.5 py-0.5 font-mono text-accent-primary">
                      {reviewGistId.slice(0, 12)}…
                    </code>
                  </p>
                ) : (
                  <p className="text-caption text-ink-muted">{t('share.cloudNoReviewTarget')}</p>
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => setPickerOpen(true)}
                aria-label={t('share.cloudOpenPickerAria')}
              >
                <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                {reviewGistId ? t('share.cloudChangeSnapshotBtn') : t('share.cloudPickSnapshotBtn')}
              </Button>
              {reviewGistId && (
                <Button
                  variant="ghost"
                  onClick={() => setReviewGistId('')}
                  aria-label={t('share.cloudClearReviewAria')}
                >
                  {t('share.clearBtn')}
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
            aria-label={t('share.cloudCommentsRegionAria')}
          >
            <header className="mb-2 flex items-center justify-between">
              <h4 className="text-body text-ink-primary">
                <MessageSquare className="mr-1 inline h-4 w-4 text-accent-primary" aria-hidden="true" />
                {t('share.cloudCommentsTitlePrefix')}
                {commentTarget.slice(0, 8)}…
              </h4>
              <button
                type="button"
                onClick={closeComments}
                aria-label={t('share.cloudCloseCommentsAria')}
                className="rounded border border-line-subtle px-2 py-0.5 text-caption text-ink-secondary hover:text-ink-primary"
              >
                {t('common.close')}
              </button>
            </header>
            {commentLoading && (
              <p className="text-caption text-ink-muted">
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {t('share.loadingDots')}
              </p>
            )}
            <div className="space-y-2">
              {commentList.length === 0 && !commentLoading && (
                <p className="text-caption text-ink-muted">{t('share.noCommentsYet')}</p>
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
                  <span className="sr-only">{t('share.cloudNewCommentSr')}</span>
                  <textarea
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder={t('share.cloudCommentPlaceholder')}
                    rows={3}
                    aria-label={t('share.cloudNewCommentAria')}
                    className="w-full resize-none rounded-lg border border-line-subtle bg-bg-surface px-2 py-1.5 text-body text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                </label>
                <Button
                  variant="primary"
                  onClick={submitComment}
                  disabled={commentLoading || !commentDraft.trim()}
                  aria-label={t('share.publishComment')}
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {t('share.cloudPublishBtn')}
                </Button>
              </div>
            )}
            {(!pat || !ghLogin) && (
              <p className="mt-2 text-caption text-accent-warn">{t('share.cloudPatCommentWarn')}</p>
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
