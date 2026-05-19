import { Sun, Moon, Eye, Projector, Glasses } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { THEME_ORDER, useThemeStore, type Theme } from '../../store/themeStore';

/** 5 主题 chip 元数据（图标 + 中文短标签 + 长描述）。 */
const META: Record<Theme, { label: string; description: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  dark: { label: '深色', description: '深色 · 工程仪表盘', Icon: Moon },
  light: { label: '明色', description: '明色 · 打印 / 演示', Icon: Sun },
  'high-contrast': { label: '高对比', description: '高对比 · 视障辅助', Icon: Eye },
  projector: { label: '投影', description: '投影 · 大屏教学', Icon: Projector },
  colorblind: { label: '色盲友好', description: '色盲友好 · Wong/IBM 安全调色板', Icon: Glasses },
};

/**
 * 主题切换：5 段 segmented control。
 * 当前态 aria-pressed="true"；点击任一段直接 setTheme。
 * 不再用 framer-motion 的 AnimatePresence 旋转过渡，纯 CSS hover 即可。
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="group"
      aria-label="主题切换"
      className="inline-flex items-center gap-0.5 rounded-full border border-line-subtle bg-bg-surface p-0.5"
    >
      {THEME_ORDER.map((id) => {
        const { label, description, Icon } = META[id];
        const active = theme === id;
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
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ThemeToggle;
