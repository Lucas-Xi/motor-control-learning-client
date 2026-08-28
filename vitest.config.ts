import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 单元测试集中在 src/simulation/math/__tests__/，e2e 走 Playwright 的 tests/e2e/
    // 不让 vitest 抓到 tests/ 目录避免和 playwright 冲突。
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'tests/**'],
    environment: 'node',  // 数学纯函数无需 jsdom
    // 钉住 i18n locale = zh-CN：CI runner（en-US）与本地（zh-CN）的
    // navigator.language 不同，断言中文文案的测试会环境相关地失败。
    setupFiles: ['src/test/setup-i18n.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/simulation/math/**', 'src/store/**', 'src/utils/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'src/simulation/math/biquad.test.ts', // 测试本身不应计入覆盖率
      ],
      reportsDirectory: './coverage',
    },
  },
});
