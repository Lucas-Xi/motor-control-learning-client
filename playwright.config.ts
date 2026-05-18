import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // i18n: 默认 zh-CN，让现有 e2e 断言（搜索中文字符串）继续通过。
    // 用户首次访问时由 useI18nStore 按 navigator.language 探测；这里把浏览器 locale
    // 固定到 zh-CN，避免 Chromium 默认 en-US 导致首屏渲染英文。
    locale: 'zh-CN',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
