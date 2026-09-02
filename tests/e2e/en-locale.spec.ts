import { expect, test, type Page } from '@playwright/test';

/**
 * 英文界面零中文守护（EN DOM 扫描）。
 *
 * 背景：v0.1.2 双语化后用户实测 EN 模式仍有 309 处中文——组件层 t() 覆盖
 * 不到数据层（guidedExperiments / parameterSchemas / visualAssets /
 * codelab starter）直渲染的字符串，grep 源码无法发现。本测试用真实 DOM
 * 作为唯一事实源：EN locale 下逐模块提取可见文本，断言零 CJK。
 *
 * 新增 UI 若本测试红：数据层补 En 字段（+ localize 辅助）或组件侧建
 * TKey 映射，见 docs 或 git log "英文界面中文残留清零" 提交。
 */

const MODULE_STAGES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'];

/** CJK 统一表意 + 全角标点 + 注音 */
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

async function openModuleEn(page: Page, stage: string) {
  // v0.2 图标栏：按钮可见文本含 stage 号
  await page.locator('nav button').filter({ hasText: stage }).first().click();
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.getByText('Loading module').first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

test('EN locale renders zero Chinese across all 16 modules', async ({ page }) => {
  test.setTimeout(240_000);
  // zustand persist 的 localStorage 形状：{state:{locale},version}
  await page.addInitScript(() => {
    localStorage.setItem('compressor-bench-locale', '{"state":{"locale":"en-US"},"version":1}');
  });

  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('/');
  // 首屏即验：侧栏应已英文
  const asideText = await page.locator('aside').first().textContent();
  expect(asideText).toContain('3-Phase');

  const offenders: string[] = [];
  for (const stage of MODULE_STAGES) {
    await openModuleEn(page, stage);
    const hits = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const el of document.body.querySelectorAll('*')) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join(' ');
        if (!own || !re.test(own)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const key = own.slice(0, 50);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`[${el.tagName.toLowerCase()}] ${own.slice(0, 80)}`);
      }
      return out;
    }, CJK_RE.source);
    for (const h of hits) offenders.push(`module ${stage}: ${h}`);
  }

  expect(offenders, `EN 界面中文残留（数据层缺 En 字段？）:\n${offenders.join('\n')}`).toEqual([]);
  // 顺带守护：EN 模式不应产生新的 console error
  const realErrors = consoleErrors.filter((e) => !e.includes('GL Driver Message'));
  expect(realErrors).toEqual([]);

  // —— 课程主线视图（16 模块之外的扫描盲区补漏）——
  await page.goto('/');
  await page.getByRole('button', { name: 'Curriculum' }).first().click();
  await page.waitForTimeout(500);
  const curriculumHits = await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join(' ');
      if (!own || !re.test(own)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const key = own.slice(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`[${el.tagName.toLowerCase()}] ${own.slice(0, 80)}`);
    }
    return out;
  }, CJK_RE.source);
  expect(curriculumHits, `课程视图 EN 中文残留:\n${curriculumHits.join('\n')}`).toEqual([]);
});
