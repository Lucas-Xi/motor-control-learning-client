import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // manualChunks 策略（performance audit R2）：
        // - recharts 不再尝试拆 sub chunk：内部 CategoricalChartWrapper / Tooltip /
        //   CartesianGrid 等被几乎所有 chart 子组件共享，拆细只会让 N 个模块各请求
        //   4-6 个 chunk，反而劣化加载并行度。整体 lazy + 单 chunk 才是最优解
        //   （WaveformPanel 已用 React.lazy 包裹，模块本身也是 lazy）。
        // - three / drei：保留单 chunk，只有 motor-basics / foc-flow 才真正下载
        //   (~302KB gzip)。drei 当前仅用 OrbitControls，tree-shake 已经做到极限。
        // - lucide-react 独立 chunk：44 个文件用到，独立后跨模块复用 + 单次 fetch。
        // - react-vendor：稳定大件，长期缓存友好。
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          charts: ['recharts'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          motion: ['framer-motion'],
          'lucide-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
