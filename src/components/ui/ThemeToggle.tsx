import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

/**
 * 主题切换按钮：圆形小按钮，深色态显示 Sun（提示「点亮」），明色态显示 Moon。
 * 使用 framer-motion 旋转 90deg 过渡。
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? '切换到明色主题（演示/打印）' : '切换到深色主题（工程仪表盘）'}
      aria-label={isDark ? '切换到明色主题' : '切换到深色主题'}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-subtle bg-bg-surface text-ink-secondary transition-colors hover:border-accent-primary hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="inline-flex"
          >
            <Sun size={16} strokeWidth={2} />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="inline-flex"
          >
            <Moon size={16} strokeWidth={2} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default ThemeToggle;
