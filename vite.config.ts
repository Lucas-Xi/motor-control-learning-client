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
        // - recharts 不再拆 sub chunk：内部 CategoricalChartWrapper / Tooltip / CartesianGrid 等
        //   被几乎所有 chart 子组件共享，拆细只会让 N 个模块各请求 4-6 个 chunk，
        //   反而劣化加载并行度。整体 lazy + 单 chunk 是最优解（已通过 React.lazy 边界保证）。
        // - three：保留一个 chunk，只有 motor-basics / foc-flow 才真正加载 (~302KB gzip)。
        //   drei 当前用到 OrbitControls，tree-shake 已经做到极限；进一步切分意义不大。
        // - lucide-react 单独立 chunk：44 个文件用到，独立后跨模块复用、单次 fetch。
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
