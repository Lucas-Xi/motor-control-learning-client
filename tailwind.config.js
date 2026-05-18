/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 语义化背景层 —— 走 `rgb(var(--xxx-rgb) / <alpha-value>)` 让 tailwind 的
        // `/<opacity>` modifier 仍然生效（如 `bg-accent-primary/10`），由 index.css
        // 里 :root / .light / .high-contrast / .projector 切主题。同时保留 `--xxx`
        // 完整 hex 变量，供直接 CSS `var(--xxx)` 使用（不带 opacity 的场景）。
        bg: {
          base: 'rgb(var(--bg-base-rgb) / <alpha-value>)',
          surface: 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
          raised: 'rgb(var(--bg-raised-rgb) / <alpha-value>)',
        },
        line: {
          subtle: 'rgb(var(--line-subtle-rgb) / <alpha-value>)',
          strong: 'rgb(var(--line-strong-rgb) / <alpha-value>)',
        },
        ink: {
          primary: 'rgb(var(--ink-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted-rgb) / <alpha-value>)',
        },
        accent: {
          primary: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',   // 交互主态（按钮、激活、当前选中）
          measure: 'rgb(var(--accent-measure-rgb) / <alpha-value>)',   // 测量值 / 目标 / 正确状态
          warn: 'rgb(var(--accent-warn-rgb) / <alpha-value>)',         // 警告 / 接近极限
          fault: 'rgb(var(--accent-fault-rgb) / <alpha-value>)',       // 故障 / 饱和
        },

        // —— 兼容 alias，过渡期保留 ——
        obsidian: 'rgb(var(--bg-base-rgb) / <alpha-value>)',
        panel: 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        panel2: 'rgb(var(--bg-raised-rgb) / <alpha-value>)',
        cyanline: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
        mintline: 'rgb(var(--accent-measure-rgb) / <alpha-value>)',
        amberline: 'rgb(var(--accent-warn-rgb) / <alpha-value>)',
        dangerline: 'rgb(var(--accent-fault-rgb) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Bahnschrift', 'DIN Alternate', 'Microsoft YaHei UI', 'sans-serif'],
        body: ['Microsoft YaHei UI', 'Aptos', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        // 紧凑工程阶梯 —— 字号走 CSS variable + fallback，让 projector /
        // high-contrast 主题整体放大不必改各组件的 className
        caption: ['var(--fs-caption, 12px)', { lineHeight: 'var(--lh-caption, 1.4)', letterSpacing: '0.01em' }],
        body: ['var(--fs-body, 14px)', { lineHeight: 'var(--lh-body, 1.5)' }],
        title: ['var(--fs-title, 16px)', { lineHeight: 'var(--lh-title, 1.4)', fontWeight: '600' }],
        display: ['var(--fs-display, 24px)', { lineHeight: 'var(--lh-display, 1.25)', fontWeight: '700' }],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
};
