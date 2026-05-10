/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 语义化背景层（深色工程仪表盘）
        bg: {
          base: '#07111f',
          surface: '#0d1929',
          raised: '#11203b',
        },
        line: {
          subtle: '#1e2a3d',
          strong: '#2c3d57',
        },
        ink: {
          primary: '#e7f3ff',
          secondary: '#9eb5cb',
          muted: '#5d7793',
        },
        accent: {
          primary: '#34d6ff',   // 交互主态（按钮、激活、当前选中）
          measure: '#43f7b5',   // 测量值 / 目标 / 正确状态
          warn: '#ffb84d',      // 警告 / 接近极限
          fault: '#ff5c7a',     // 故障 / 饱和
        },

        // —— 兼容 alias，过渡期保留 ——
        obsidian: '#07111f',
        panel: '#0d1929',
        panel2: '#11203b',
        cyanline: '#34d6ff',
        mintline: '#43f7b5',
        amberline: '#ffb84d',
        dangerline: '#ff5c7a',
      },
      fontFamily: {
        display: ['Bahnschrift', 'DIN Alternate', 'Microsoft YaHei UI', 'sans-serif'],
        body: ['Microsoft YaHei UI', 'Aptos', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        // 紧凑工程阶梯
        caption: ['12px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        body: ['14px', { lineHeight: '1.5' }],
        title: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        display: ['24px', { lineHeight: '1.25', fontWeight: '700' }],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
    },
  },
  plugins: [],
};
