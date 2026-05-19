import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单元测试集中在 src/simulation/math/__tests__/，e2e 走 Playwright 的 tests/e2e/
    // 不让 vitest 抓到 tests/ 目录避免和 playwright 冲突。
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'tests/**'],
    environment: 'node',  // 数学纯函数无需 jsdom
    reporters: ['default'],
  },
});
