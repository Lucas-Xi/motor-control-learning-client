import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Copy, Link2, Trash2, Plus, ClipboardPaste, ArrowLeftRight, Cloud, Loader2 } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { useAssemblyProgressStore } from '../../store/assemblyProgressStore';
import { useChallengeStore } from '../../store/challengeStore';
import { useSnapshotsStore } from '../../store/snapshotsStore';
import { useCloudShareStore } from '../../store/cloudShareStore';
import { createSnapshot, GistError } from '../../utils/gistCloud';
import { useI18n } from '../../i18n/useI18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  decodeSnapshot,
  encodeSnapshot,
  packAppState,
  SLICE_LABELS,
  type AppStateInput,
} from '../../utils/snapshotCodec';

/**
 * 数字孪生分享面板（生成 / 接收 / 多人对比）。
 *
 * 三段：
 *   1. 「生成分享链接」—— 把当前 17 段 sim slice + 6 槽位 + 通关摘要打成 token，
 *       拼到 `${origin}${path}#snapshot=<token>` 复制给同事。
 *   2. 「粘贴远端 token」—— 输入框 + 添加按钮，把对方发来的链接 / 纯 token 装进
 *       remoteSnapshots（上限 10 条）。同 token 去重。
 *   3. 「远端快照列表」—— 已收的 token 列表，每条可重命名 / 删除 / 复制 / "下方对比" 切换。
 *
 * 设计：UI 层只读取 store getState() 一次（按钮点击时），不订阅整个 store；
 *      避免每帧 time 推送拉爆重渲染。
 */

/** 从 store snapshot 拍出 AppStateInput（仅参数，不含会话级 time/running/activeModule） */
function pickCurrentState(): AppStateInput {
  const sim = useSimulationStore.getState();
  const asmProgress = useAssemblyProgressStore.getState();
  const challenge = useChallengeStore.getState();
  // 取 history 最近一条的 slotIds，如果没有就不带 asm（接收端用默认值）
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

/** 从一段文本里提取 token：支持完整 URL（#snapshot=xxx）或裸 token */
function extractToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/#snapshot=([^&\s]+)/);
  if (m) return m[1];
  return trimmed;
}

function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return `#snapshot=${token}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#snapshot=${token}`;
}

interface ShareSnapshotPanelProps {
  /** 给 SnapshotDiffPanel 对比"远端 X vs 当前"用 */
  onCompareRequest?: (remoteId: string) => void;
}

export function ShareSnapshotPanel({ onCompareRequest }: ShareSnapshotPanelProps = {}) {
  const { t } = useI18n();
  const remoteSnapshots = useSnapshotsStore((s) => s.remoteSnapshots);
  const addRemote = useSnapshotsStore((s) => s.addRemote);
  const removeRemote = useSnapshotsStore((s) => s.removeRemote);
  const renameRemote = useSnapshotsStore((s) => s.renameRemote);
  const clearRemote = useSnapshotsStore((s) => s.clearRemote);

  const [token, setToken] = useState<string>('');
  const [shareUrl, setShareUrl] = useState<string>('');
  const [pasteText, setPasteText] = useState<string>('');
  const [pasteError, setPasteError] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const pat = useCloudShareStore((s) => s.pat);

  const feedbackTimerRef = useRef<number | null>(null);
  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(''), 2400);
  }, []);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  const handleGenerate = useCallback(() => {
    try {
      const input = pickCurrentState();
      const tokenStr = encodeSnapshot(input);
      setToken(tokenStr);
      setShareUrl(buildShareUrl(tokenStr));
      showFeedback(`${t('share.v1TokenGeneratedPrefix')}${tokenStr.length}${t('share.v1TokenGeneratedSuffix')}`);
    } catch (err) {
      showFeedback(`${t('share.v1GenFailPrefix')}${(err as Error).message}`);
    }
  }, [showFeedback, t]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showFeedback(t('share.linkCopied'));
      } else {
        // 旧浏览器兜底
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showFeedback(t('share.v1CopiedFallback'));
      }
    } catch {
      showFeedback(t('share.v1CopyFail'));
    }
  }, [shareUrl, showFeedback, t]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: t('share.v1NativeShareTitle'),
          text: t('share.v1NativeShareText'),
          url: shareUrl,
        });
        showFeedback(t('share.v1NativeShared'));
      } catch {
        showFeedback(t('share.v1NativeShareCancelled'));
      }
    } else {
      showFeedback(t('share.v1NoNativeShare'));
    }
  }, [shareUrl, showFeedback, t]);

  const handleUploadGist = useCallback(async () => {
    if (!token) {
      showFeedback(t('share.v1GenerateFirst'));
      return;
    }
    if (!pat) {
      showFeedback(t('share.v1BindPatFirst'));
      return;
    }
    setUploading(true);
    try {
      const result = await createSnapshot(pat, token, {
        description: t('share.uploadFallbackDesc'),
        public: false,
      });
      showFeedback(`${t('share.uploadedToGistPrefix')}${result.gistId.slice(0, 8)}…`);
    } catch (err) {
      const msg = err instanceof GistError ? err.message : (err as Error).message;
      showFeedback(`${t('share.v1UploadFailPrefix')}${msg}`);
    } finally {
      setUploading(false);
    }
  }, [token, pat, showFeedback, t]);

  const handleAddRemote = useCallback(() => {
    const tok = extractToken(pasteText);
    if (!tok) {
      setPasteError(t('share.v1PasteFullLink'));
      return;
    }
    const result = decodeSnapshot(tok);
    if (!result.ok) {
      setPasteError(result.error ?? t('share.v1DecodeFail'));
      return;
    }
    addRemote({ token: tok, decoded: result.state });
    setPasteText('');
    setPasteError('');
    showFeedback(t('share.v1AddedToList'));
  }, [pasteText, addRemote, showFeedback, t]);

  const supportsNativeShare = useMemo(
    () => typeof navigator !== 'undefined' && 'share' in navigator,
    [],
  );

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow={t('share.v1Eyebrow')}
      title={t('share.v1Title')}
      action={
        feedback ? (
          <span
            role="status"
            aria-live="polite"
            className="rounded-md border border-accent-measure/40 bg-accent-measure/10 px-2 py-0.5 text-caption text-accent-measure"
          >
            {feedback}
          </span>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Section 1: 生成 */}
        <section aria-labelledby="share-gen-heading">
          <h3
            id="share-gen-heading"
            className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted"
          >
            {t('share.v1GenHeading')}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={handleGenerate} aria-label={t('share.v1GenAria')}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {t('share.v1GenBtn')}
            </Button>
            {shareUrl && (
              <>
                <Button variant="ghost" onClick={handleCopy} aria-label={t('share.v1CopyAria')}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t('share.v1CopyBtn')}
                </Button>
                {supportsNativeShare && (
                  <Button
                    variant="ghost"
                    onClick={handleNativeShare}
                    aria-label={t('share.v1NativeAria')}
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    {t('share.v1NativeBtn')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={handleUploadGist}
                  disabled={uploading || !pat}
                  aria-label={pat ? t('share.v1UploadAriaPat') : t('share.v1UploadAriaNeedPat')}
                  title={pat ? t('share.v1UploadTitlePat') : t('share.v1UploadAriaNeedPat')}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Cloud className="h-4 w-4" aria-hidden="true" />
                  )}
                  {t('share.uploadToGistBtn')}
                </Button>
              </>
            )}
          </div>
          {shareUrl && (
            <div className="mt-2 space-y-1.5">
              <p className="text-caption text-ink-muted">
                {t('share.v1TokenLenPrefix')}
                <span className="font-mono text-accent-measure">{token.length}</span>
                {t('share.v1TokenLenMid')}
                {token.length > 1200 ? (
                  <span className="text-accent-warn">{t('share.v1OverLimit')}</span>
                ) : (
                  <span className="text-accent-measure">{t('share.v1UrlSafe')}</span>
                )}
              </p>
              <label className="block">
                <span className="sr-only">{t('share.v1ShareUrlSr')}</span>
                <textarea
                  readOnly
                  value={shareUrl}
                  className="w-full resize-none rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  rows={3}
                  aria-label={t('share.v1UrlAria')}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <p className="text-caption text-ink-muted">{t('share.v1ShareHint')}</p>
            </div>
          )}
        </section>

        {/* Section 2: 接收 */}
        <section aria-labelledby="share-paste-heading">
          <h3
            id="share-paste-heading"
            className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted"
          >
            {t('share.v1PasteHeading')}
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">{t('share.v1RemoteSr')}</span>
              <input
                type="text"
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  if (pasteError) setPasteError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRemote();
                  }
                }}
                placeholder={t('share.v1PastePlaceholder')}
                aria-label={t('share.v1PasteAria')}
                aria-invalid={!!pasteError}
                aria-describedby={pasteError ? 'paste-err' : undefined}
                className="w-full rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </label>
            <Button variant="primary" onClick={handleAddRemote} aria-label={t('share.v1AddAria')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('share.addBtn')}
            </Button>
          </div>
          {pasteError && (
            <p id="paste-err" role="alert" className="mt-1 text-caption text-accent-fault">
              <span className="sr-only">{t('share.srError')}</span>
              {pasteError}
            </p>
          )}
        </section>

        {/* Section 3: 远端快照列表 */}
        <section aria-labelledby="share-list-heading">
          <div className="mb-2 flex items-center justify-between">
            <h3
              id="share-list-heading"
              className="text-caption uppercase tracking-[0.18em] text-ink-muted"
            >
              {t('share.v1ListHeadingPrefix')}
              {remoteSnapshots.length}
              {t('share.v1ListHeadingSuffix')}
            </h3>
            {remoteSnapshots.length > 0 && (
              <Button
                variant="ghost"
                onClick={clearRemote}
                aria-label={t('share.v1ClearAria')}
                className="px-2 py-1 text-caption"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('share.clearBtn')}
              </Button>
            )}
          </div>
          {remoteSnapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted">
              <ClipboardPaste className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {t('share.v1EmptyList')}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {remoteSnapshots.map((r) => {
                const sliceCount = r.decoded ? Object.keys(r.decoded.sim).length : 0;
                const hasAsm = !!r.decoded?.asm;
                const challengeCount = r.decoded?.ch ? Object.keys(r.decoded.ch).length : 0;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-bg-surface px-2.5 py-1.5"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <label className="flex-1 min-w-0">
                      <span className="sr-only">{t('share.v1NameSr')}</span>
                      <input
                        type="text"
                        value={r.label}
                        onChange={(e) => renameRemote(r.id, e.target.value)}
                        className="w-full bg-transparent text-body text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
                        aria-label={`${t('share.v1RenameAriaPrefix')}${r.label}`}
                      />
                    </label>
                    <span className="text-caption text-ink-muted">
                      {sliceCount} slice · {hasAsm ? t('share.v1WithAsm') : t('share.v1NoAsm')} · {challengeCount}
                      {t('share.v1ChallengesSuffix')}
                    </span>
                    {onCompareRequest && (
                      <Button
                        variant="ghost"
                        onClick={() => onCompareRequest(r.id)}
                        aria-label={`${t('share.v1CompareAriaPrefix')}${r.label}${t('share.v1CompareAriaMid')}`}
                        className="px-2 py-0.5 text-caption"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('share.v1CompareBtn')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(buildShareUrl(r.token));
                        showFeedback(`${t('share.v1CopiedLinkFlashPrefix')}${r.label}${t('share.v1CopiedLinkFlashMid')}`);
                      }}
                      aria-label={`${t('share.v1CopyShareAriaPrefix')}${r.label}${t('share.v1CopyShareAriaMid')}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => removeRemote(r.id)}
                      aria-label={`${t('share.deleteAriaPrefix')}${r.label}`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="border-t border-line-subtle pt-3 text-caption text-ink-muted">
          {t('share.v1FootnoteA')}
          <span className="text-accent-measure">{t('share.v1FootnoteNoPrivacy')}</span>
          {t('share.v1FootnoteB')}
          {Object.keys(SLICE_LABELS).length}
          {t('share.v1FootnoteC')}
          {Object.values(SLICE_LABELS).join(' · ')}
          {t('share.period')}
        </p>
      </div>
    </Card>
  );
}
