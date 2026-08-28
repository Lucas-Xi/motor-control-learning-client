import { Sun, Moon, Eye, Projector, Glasses } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { THEME_ORDER, useThemeStore, type Theme } from '../../store/themeStore';

/** 5 主题 chip 元数据（图标 + 翻译 key，短标签 / 长描述在渲染时由 t() 取）。 */
const META: Record<Theme, { labelKey: TKey; descKey: TKey; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  dark: { labelKey: 'shell.themeLabelDark', descKey: 'shell.themeDescDark', Icon: Moon },
  light: { labelKey: 'shell.themeLabelLight', descKey: 'shell.themeDescLight', Icon: Sun },
  'high-contrast': { labelKey: 'shell.themeLabelHighContrast', descKey: 'shell.themeDescHighContrast', Icon: Eye },
  projector: { labelKey: 'shell.themeLabelProjector', descKey: 'shell.themeDescProjector', Icon: Projector },
  colorblind: { labelKey: 'shell.themeLabelColorblind', descKey: 'shell.themeDescColorblind', Icon: Glasses },
};

/**
 * 主题切换：5 段 segmented control。
 * 当前态 aria-pressed="true"；点击任一段直接 setTheme。
 * 不再用 framer-motion 的 AnimatePresence 旋转过渡，纯 CSS hover 即可。
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="group"
      aria-label={t('shell.themeToggleAria')}
      className="inline-flex items-center gap-0.5 rounded-full border border-line-subtle bg-bg-surface p-0.5"
    >
      {THEME_ORDER.map((id) => {
        const { labelKey, descKey, Icon } = META[id];
        const active = theme === id;
        const description = `${t(labelKey)} · ${t(descKey)}`;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            aria-label={description}
            title={description}
            onClick={() => setTheme(id)}
            data-theme-chip={id}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-caption transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
              active
                ? 'bg-accent-primary/15 text-accent-primary'
                : 'text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;
