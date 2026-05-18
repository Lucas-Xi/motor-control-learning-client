import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Copy, Link2, Trash2, Plus, ClipboardPaste, ArrowLeftRight } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { useAssemblyProgressStore } from '../../store/assemblyProgressStore';
import { useChallengeStore } from '../../store/challengeStore';
import { useSnapshotsStore } from '../../store/snapshotsStore';
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
      const t = encodeSnapshot(input);
      setToken(t);
      setShareUrl(buildShareUrl(t));
      showFeedback(`已生成 token（${t.length} 字符）`);
    } catch (err) {
      showFeedback(`生成失败：${(err as Error).message}`);
    }
  }, [showFeedback]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showFeedback('链接已复制到剪贴板');
      } else {
        // 旧浏览器兜底
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showFeedback('链接已复制（兜底路径）');
      }
    } catch {
      showFeedback('复制失败，请手动选中文本');
    }
  }, [shareUrl, showFeedback]);

  const handleNativeShare = useCallback(async () => {
    if (!shareUrl) return;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: '电机控制学习客户端 · 数字孪生分享',
          text: '我的当前调参 snapshot，点击链接在客户端里预览：',
          url: shareUrl,
        });
        showFeedback('已调起系统分享');
      } catch {
        showFeedback('已取消系统分享');
      }
    } else {
      showFeedback('当前环境不支持系统分享，请手动复制');
    }
  }, [shareUrl, showFeedback]);

  const handleAddRemote = useCallback(() => {
    const t = extractToken(pasteText);
    if (!t) {
      setPasteError('请粘贴完整链接或 token');
      return;
    }
    const result = decodeSnapshot(t);
    if (!result.ok) {
      setPasteError(result.error ?? '解码失败');
      return;
    }
    addRemote({ token: t, decoded: result.state });
    setPasteText('');
    setPasteError('');
    showFeedback('已添加到远端快照列表');
  }, [pasteText, addRemote, showFeedback]);

  const supportsNativeShare = useMemo(
    () => typeof navigator !== 'undefined' && 'share' in navigator,
    [],
  );

  return (
    <Card
      density="default"
      tone="measure"
      eyebrow="LAB · 数字孪生分享"
      title="分享当前参数 / 接收远端 snapshot"
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
            1. 生成分享链接
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={handleGenerate} aria-label="把当前 store 参数生成分享 token">
              <Share2 className="h-4 w-4" aria-hidden="true" />
              生成分享链接
            </Button>
            {shareUrl && (
              <>
                <Button variant="ghost" onClick={handleCopy} aria-label="复制分享链接到剪贴板">
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  复制链接
                </Button>
                {supportsNativeShare && (
                  <Button
                    variant="ghost"
                    onClick={handleNativeShare}
                    aria-label="调用系统原生分享"
                  >
                    <Link2 className="h-4 w-4" aria-hidden="true" />
                    系统分享
                  </Button>
                )}
              </>
            )}
          </div>
          {shareUrl && (
            <div className="mt-2 space-y-1.5">
              <p className="text-caption text-ink-muted">
                token 长度 <span className="font-mono text-accent-measure">{token.length}</span>{' '}
                字符 · 目标 ≤ 1200 ·{' '}
                {token.length > 1200 ? (
                  <span className="text-accent-warn">超过浏览器/聊天软件常见上限</span>
                ) : (
                  <span className="text-accent-measure">URL 安全</span>
                )}
              </p>
              <label className="block">
                <span className="sr-only">分享链接</span>
                <textarea
                  readOnly
                  value={shareUrl}
                  className="w-full resize-none rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  rows={3}
                  aria-label="生成的分享链接（只读）"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
              <p className="text-caption text-ink-muted">
                把链接发给同事，对方在客户端打开后会弹"接收对比"窗口；也可以让对方粘贴到下面【2. 接收】里。
              </p>
            </div>
          )}
        </section>

        {/* Section 2: 接收 */}
        <section aria-labelledby="share-paste-heading">
          <h3
            id="share-paste-heading"
            className="mb-2 text-caption uppercase tracking-[0.18em] text-ink-muted"
          >
            2. 粘贴远端 token（不立即应用，仅入栈对比）
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">远端链接或 token</span>
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
                placeholder="贴入 https://.../#snapshot=... 或纯 token 字符串"
                aria-label="远端分享链接或 token 输入"
                aria-invalid={!!pasteError}
                aria-describedby={pasteError ? 'paste-err' : undefined}
                className="w-full rounded-lg border border-line-subtle bg-bg-base px-2 py-1.5 font-mono text-caption text-ink-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              />
            </label>
            <Button variant="primary" onClick={handleAddRemote} aria-label="添加远端快照到对比列表">
              <Plus className="h-4 w-4" aria-hidden="true" />
              添加
            </Button>
          </div>
          {pasteError && (
            <p id="paste-err" role="alert" className="mt-1 text-caption text-accent-fault">
              <span className="sr-only">错误：</span>
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
              3. 远端快照（{remoteSnapshots.length} / 10）
            </h3>
            {remoteSnapshots.length > 0 && (
              <Button
                variant="ghost"
                onClick={clearRemote}
                aria-label="清空所有远端快照"
                className="px-2 py-1 text-caption"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                清空
              </Button>
            )}
          </div>
          {remoteSnapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-subtle bg-bg-base p-3 text-caption text-ink-muted">
              <ClipboardPaste className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              尚未接收任何远端快照。粘贴同事发来的链接后，会显示在这里。最多保留 10 条；超过自动挤掉最旧。
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
                      <span className="sr-only">远端快照名称</span>
                      <input
                        type="text"
                        value={r.label}
                        onChange={(e) => renameRemote(r.id, e.target.value)}
                        className="w-full bg-transparent text-body text-ink-primary outline-none focus:ring-2 focus:ring-accent-primary"
                        aria-label={`重命名 ${r.label}`}
                      />
                    </label>
                    <span className="text-caption text-ink-muted">
                      {sliceCount} slice · {hasAsm ? '含装配' : '无装配'} · {challengeCount} 通关
                    </span>
                    {onCompareRequest && (
                      <Button
                        variant="ghost"
                        onClick={() => onCompareRequest(r.id)}
                        aria-label={`选 ${r.label} 与当前状态对比`}
                        className="px-2 py-0.5 text-caption"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                        对比
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(buildShareUrl(r.token));
                        showFeedback(`已复制 ${r.label} 的链接`);
                      }}
                      aria-label={`复制 ${r.label} 的分享链接`}
                      className="px-2 py-0.5 text-caption"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => removeRemote(r.id)}
                      aria-label={`删除 ${r.label}`}
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
          token 里仅包含 17 段工程参数 + 装配选型 + 通关摘要（best value）；
          <span className="text-accent-measure">不含 attempts / IP / 时间戳等隐私信息</span>。
          支持的字段一共 {Object.keys(SLICE_LABELS).length} 个 slice：{Object.values(SLICE_LABELS).join(' · ')}。
        </p>
      </div>
    </Card>
  );
}
