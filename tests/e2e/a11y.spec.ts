import { expect, test, type Page } from '@playwright/test';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 无障碍审查脚本：在每个核心模块路由下注入 axe-core 跑 axe.run()，并把结果写到
 * tmp/a11y-results.json 供后续生成 docs/AUDIT_A11Y.md。
 *
 * 同时验证：
 *  - Tab 顺序能遍历到关键交互（按钮、滑块、tabs）
 *  - KeyHelpOverlay 能用 ? 打开、Esc 关闭
 *  - P-h 拖拽是否提供键盘替代（pointer-only 时用 axe + 自定义检查）
 */

// 本地缓存 axe-core，避免每次跑测试时联网下载
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
const AXE_CACHE = resolve(__dirname, '..', '..', 'node_modules', '.cache', 'axe-core.min.js');

async function ensureAxe(): Promise<string> {
  if (existsSync(AXE_CACHE)) return readFileSync(AXE_CACHE, 'utf-8');
  // 通过 fetch 下载到本地缓存
  const res = await fetch(AXE_CDN);
  if (!res.ok) throw new Error(`failed to fetch axe-core: ${res.status}`);
  const src = await res.text();
  mkdirSync(resolve(AXE_CACHE, '..'), { recursive: true });
  writeFileSync(AXE_CACHE, src, 'utf-8');
  return src;
}

interface AxeViolation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodes: Array<{ target: string[]; html: string; failureSummary: string }>;
}

interface AxeResults {
  violations: AxeViolation[];
  passes: { id: string }[];
  incomplete: { id: string }[];
}

async function runAxe(page: Page): Promise<AxeResults> {
  const axeSrc = await ensureAxe();
  await page.evaluate((src) => {
    const s = document.createElement('script');
    s.text = src;
    document.head.appendChild(s);
  }, axeSrc);
  return await page.evaluate(async () => {
    // @ts-expect-error - axe is injected at runtime
    const r = await window.axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      resultTypes: ['violations', 'passes', 'incomplete'],
    });
    return {
      violations: r.violations.map((v: AxeViolation) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        helpUrl: v.helpUrl,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 200),
          failureSummary: n.failureSummary,
        })),
      })),
      passes: r.passes.map((p: { id: string }) => ({ id: p.id })),
      incomplete: r.incomplete.map((p: { id: string }) => ({ id: p.id })),
    };
  });
}

const MODULES_TO_AUDIT: Array<readonly [string, string]> = [
  ['01', '电机基础'],
  ['03', 'Clarke 变换'],
  ['05', 'PID 控制'],
  ['07', 'SVPWM'],
  ['11', '弱磁控制'],
  ['16', '制冷系统台架'],
];

async function openModule(page: Page, stage: string) {
  // v0.2 图标栏：按钮可见文本含 stage 号（"01"…）
  await page.locator('nav button').filter({ hasText: stage }).first().click();
  await page.locator('text=模块加载中').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
}

const RESULTS: Record<string, AxeResults> = {};
const KEYBOARD_FINDINGS: Record<string, unknown> = {};

test.describe.configure({ mode: 'serial' });

test('axe-core scan over modules', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  for (const [stage, title] of MODULES_TO_AUDIT) {
    await openModule(page, stage);
    const results = await runAxe(page);
    RESULTS[`${stage}-${title}`] = results;
  }

  // 输出到 tmp/a11y-results.json
  mkdirSync(resolve(__dirname, '..', '..', 'tmp'), { recursive: true });
  writeFileSync(
    resolve(__dirname, '..', '..', 'tmp', 'a11y-results.json'),
    JSON.stringify(RESULTS, null, 2),
    'utf-8',
  );
});

test('keyboard tab navigation reaches key controls', async ({ page }) => {
  // 测试链路：50 次 Tab + '?' + Esc + openModule('16')（含 15+15s 等待）+ PhDiagram evaluate；
  // 默认 30s 不够（尤其是 release:audit 串行跑到此时 dev server 已经热但 chunk 还要冷加载）。
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // 收集前 50 个 tab 焦点
  const visited: string[] = [];
  for (let i = 0; i < 50; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return `${el.tagName.toLowerCase()}|${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''}`;
    });
    if (info) visited.push(info);
  }
  KEYBOARD_FINDINGS['tabSequence'] = visited;

  // 检查能否定位到 input[type=range] 滑块
  const sliderHit = visited.some((v) => v.startsWith('input|') || v.includes('range'));
  KEYBOARD_FINDINGS['canTabToSlider'] = sliderHit;

  // 检查 ? 打开帮助、Esc 关闭。
  // Tab 50 次后焦点可能落在 walkthrough/quiz 内部按钮，body 没焦点。
  // 显式聚焦到 body 再发送 ? 让全局 keydown 监听器接到。
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  // 不同 Playwright 版本 keyboard.press('?') 对 Shift+/ 字符派发可能差异；
  // 用 down/press/up 显式发 Shift + Slash 保证生成 e.key === '?'。
  await page.keyboard.down('Shift');
  await page.keyboard.press('Slash');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(600);
  const helpVisible = await page.locator('text=键盘快捷键').isVisible().catch(() => false);
  KEYBOARD_FINDINGS['helpOverlayOpensWithQuestion'] = helpVisible;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const helpClosed = !(await page.locator('text=键盘快捷键').isVisible().catch(() => false));
  KEYBOARD_FINDINGS['helpOverlayClosesWithEsc'] = helpClosed;

  // 进入 16 号台架，检查 P-h 拖拽是否有键盘替代
  await openModule(page, '16');
  await page.waitForTimeout(500);
  const phSvg = page.locator('svg[aria-label="P-h diagram"]').first();
  const dragPointTabbable = await phSvg.evaluate((svg: SVGElement) => {
    const circles = Array.from(svg.querySelectorAll('circle'));
    return circles.some((c) => c.getAttribute('tabindex') !== null || c.getAttribute('role') === 'slider');
  }).catch(() => false);
  KEYBOARD_FINDINGS['phDragHasKeyboardAlternative'] = dragPointTabbable;

  writeFileSync(
    resolve(__dirname, '..', '..', 'tmp', 'a11y-keyboard.json'),
    JSON.stringify(KEYBOARD_FINDINGS, null, 2),
    'utf-8',
  );
  expect(KEYBOARD_FINDINGS['helpOverlayOpensWithQuestion']).toBeTruthy();
});
