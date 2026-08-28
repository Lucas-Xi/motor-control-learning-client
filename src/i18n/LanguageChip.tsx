import { Languages } from 'lucide-react';
import { useI18n } from './useI18n';

/**
 * 语言切换 chip。
 *
 * 视觉：accent.primary 主态边框 + 当前语言的两字母指示。
 * 行为：点击即在 zh-CN ↔ en-US 之间切换；状态走 useI18nStore。
 *
 * 摆放位置：TopBar 顶部一行右侧（紧贴运行控制组）。
 */
export function LanguageChip({ className = '' }: { className?: string }) {
  const { locale, toggleLocale, t } = useI18n();
  const isZh = locale === 'zh-CN';
  const ariaLabel = isZh ? t('common.switchToEnglish') : t('common.switchToChinese');
  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-testid="language-chip"
      className={`mobile-touch-target inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption transition-colors ${
        isZh
          ? 'border-line-subtle bg-bg-base text-ink-secondary hover:border-accent-primary/60 hover:text-accent-primary'
          : 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
      } ${className}`}
    >
      <Languages className="h-3.5 w-3.5" aria-hidden />
      <span className="font-mono font-medium">
        {t('common.languageChip')} / {t('common.languageChipOther')}
      </span>
    </button>
  );
}
