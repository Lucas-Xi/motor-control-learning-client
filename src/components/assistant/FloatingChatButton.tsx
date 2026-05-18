import { Lightbulb, X } from 'lucide-react';
import { useAssistantStore } from '../../store/assistantStore';
import { useI18n } from '../../i18n/useI18n';

/**
 * 右下角浮动按钮 —— 切换 AssistantPanel 显隐。
 * 用 z-40，低于全局帮助叠层（z-100）但高于普通模块内容。
 * 全屏模式（store.fullScreen）时也保留，方便随时呼出助手。
 */
export function FloatingChatButton() {
  const open = useAssistantStore((s) => s.open);
  const toggleOpen = useAssistantStore((s) => s.toggleOpen);
  const { t } = useI18n();

  const Icon = open ? X : Lightbulb;
  return (
    <button
      type="button"
      onClick={toggleOpen}
      aria-label={t('assistant.fabAria')}
      aria-expanded={open}
      aria-controls="assistant-panel"
      className={
        'fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border px-4 text-body font-medium shadow-lg transition-colors '
        + (open
          ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25'
          : 'border-line-subtle bg-bg-surface text-ink-primary hover:border-accent-primary/60 hover:text-accent-primary'
        )
        + ' focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary'
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{t('assistant.fabLabel')}</span>
    </button>
  );
}
