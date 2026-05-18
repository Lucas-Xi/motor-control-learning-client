import { AnimatePresence, motion } from 'framer-motion';
import { Send, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssistantStore, type AssistantCitation } from '../../store/assistantStore';
import { useI18n } from '../../i18n/useI18n';
import {
  buildRagIndex,
  buildRagIndexAsync,
  citationToTarget,
  composeAnswer,
  search,
  type RagIndex,
  type SearchResult,
} from '../../utils/ragIndex';
import { CitationLink } from './CitationLink';

/**
 * 浮动聊天面板 —— 本地教学助手主 UI。
 *
 * 对话流：
 *   1. 用户输入 → pushUser
 *   2. 立即同步走 search() + composeAnswer() → pushAssistant
 *   3. assistant message 含 citations，每条对应 ragIndex 里的 chunk
 *   4. CitationLink 提供"跳到该模块"按钮
 *
 * 不调任何外部 API；索引在打开面板时 lazy 构建一次，之后命中 in-memory 缓存。
 * walkthrough chunk 通过 dynamic import 异步追加进索引（fire-and-forget）。
 *
 * a11y：role="dialog" + aria-modal + Esc 关闭 + 简易 focus trap（关闭时把焦点还给 FAB）。
 * 视觉：accent.primary（cyan）作为面板主调，引用块走 accent.measure（mint）。
 */
export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const messages = useAssistantStore((s) => s.messages);
  const pushUser = useAssistantStore((s) => s.pushUser);
  const pushAssistant = useAssistantStore((s) => s.pushAssistant);
  const clearMessages = useAssistantStore((s) => s.clearMessages);
  const pendingDraft = useAssistantStore((s) => s.pendingDraft);
  const consumePendingDraft = useAssistantStore((s) => s.consumePendingDraft);

  const { t, locale } = useI18n();
  const [draft, setDraft] = useState('');
  const [index, setIndex] = useState<RagIndex | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 打开时构建索引（首次同步基础 + 异步补 walkthrough）
  useEffect(() => {
    if (!open) return;
    const base = buildRagIndex();
    setIndex(base);
    void buildRagIndexAsync().then((idx) => setIndex({ ...idx })).catch(() => {
      /* walkthrough 加载失败不影响基础检索；保持已 set 的 base 即可 */
    });
  }, [open]);

  // 打开 + pendingDraft 时：把题目灌入输入框、聚焦
  useEffect(() => {
    if (!open) return;
    const draftFromOutside = consumePendingDraft();
    if (draftFromOutside) setDraft(draftFromOutside);
    // 微延迟一帧让 layout 完成再 focus，避免 framer-motion 入场期间被抢
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, consumePendingDraft]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // 新消息后滚到底部
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    pushUser(text);
    setDraft('');
    // 检索 + 拼答案（同步）
    const idx = index ?? buildRagIndex();
    const results: SearchResult[] = search(text, 8, idx);
    const composed = composeAnswer(text, results, locale);
    // citations 元数据快照（避免持久化后 chunkId 漂移）
    const citations: AssistantCitation[] = composed.citations.map((ri) => {
      const r = results[ri];
      const tgt = citationToTarget(r.chunk);
      return {
        chunkId: r.chunk.id,
        title: r.chunk.title,
        preview: r.chunk.text.slice(0, 140),
        moduleId: tgt.moduleId,
        walkthroughStepId: tgt.walkthroughStepId,
      };
    });
    pushAssistant(composed.answer, citations);
  }, [draft, index, locale, pushUser, pushAssistant]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送；Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const pendingHint = useMemo(() => pendingDraft && draft === pendingDraft, [pendingDraft, draft]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-label={t('assistant.panelTitle')}
          className="fixed bottom-20 right-5 z-40 flex h-[min(600px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line-subtle bg-bg-surface shadow-2xl"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
            <div>
              <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('assistant.panelEyebrow')}</p>
              <h2 className="font-display text-title text-ink-primary">{t('assistant.panelTitle')}</h2>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{t('assistant.panelSubtitle')}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearMessages}
                aria-label={t('assistant.clearButton')}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-bg-base hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                disabled={messages.length === 0}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('assistant.closeAria')}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-bg-base hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="rounded-lg border border-dashed border-line-subtle p-4 text-center text-caption text-ink-muted">
                {t('assistant.emptyHint')}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[88%] rounded-2xl rounded-br-sm border border-accent-primary/30 bg-accent-primary/10 px-3 py-2 text-body text-ink-primary'
                      : 'max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm border border-line-subtle bg-bg-base px-3 py-2 text-body text-ink-secondary'
                  }
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                        {t('assistant.citationsTitle')}
                      </p>
                      <ul className="space-y-1.5">
                        {m.citations.map((c, i) => (
                          <CitationLink key={i} index={i + 1} citation={c} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line-subtle px-3 py-2">
            {pendingHint && (
              <p className="mb-1 text-[11px] text-accent-measure">{t('assistant.pendingDraftHint')}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder={t('assistant.inputPlaceholder')}
                aria-label={t('assistant.panelTitle')}
                className="scrollbar-thin flex-1 resize-none rounded-lg border border-line-subtle bg-bg-base px-2.5 py-1.5 text-body text-ink-primary placeholder:text-ink-muted/60 focus:border-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                aria-label={t('assistant.sendAria')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-accent-primary/50 bg-accent-primary/10 text-accent-primary transition-colors hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-bg-base disabled:text-ink-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
