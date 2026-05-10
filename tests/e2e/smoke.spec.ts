import { expect, test, type Page } from '@playwright/test';

const modules = [
  ['01', '电机基础'],
  ['02', '三相正弦波与旋转磁场'],
  ['03', 'Clarke 变换'],
  ['04', 'Park 变换'],
  ['05', 'PID 控制'],
  ['06', 'FOC 总体流程'],
  ['07', 'SVPWM'],
  ['08', '三相逆变器'],
  ['09', '电流环 / 速度环 / 位置环'],
  ['10', '无感 FOC / 观测器'],
  ['11', '弱磁控制'],
  ['12', '故障与调试'],
  ['13', 'HFI 高频注入低速无感'],
  ['14', '压缩机启动状态机'],
  ['15', 'APF 前级 PFC'],
  ['16', '制冷系统台架'],
] as const;

const APP_TITLE = '压缩机变频器控制';

async function openModule(page: Page, stage: string) {
  await page.locator('nav button').filter({ hasText: `${stage} ·` }).click();
}

test('all learning modules render and controls remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(APP_TITLE).first()).toBeVisible();

  for (const [stage, title] of modules) {
    await openModule(page, stage);
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
    await expect(page.getByText('参数控制台')).toBeVisible();
    await expect(page.getByText('教学讲义')).toBeVisible();
  }
});

test('module sliders update their displayed values without console errors', async ({ page }) => {
  test.setTimeout(60_000);  // 16 模块 × 3 滑块需要更多时间
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (message.type() === 'warning') consoleWarnings.push(message.text());
  });

  await page.goto('/');
  for (const [stage] of modules) {
    await openModule(page, stage);
    const sliders = page.locator('aside input[type="range"]');
    const count = await sliders.count();
    for (let i = 0; i < Math.min(count, 3); i += 1) {
      const slider = sliders.nth(i);
      const before = await slider.inputValue();
      const curve = stage === '02' && i === 0 ? page.locator('.recharts-line-curve').first() : null;
      const curveBefore = curve ? await curve.getAttribute('d') : null;
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      await expect(slider).not.toHaveValue(before);
      if (curve && curveBefore) {
        await expect(curve).not.toHaveAttribute('d', curveBefore);
      }
    }
  }
  expect(consoleErrors).toEqual([]);
  expect(consoleWarnings).toEqual([]);
});

test('desktop and mobile layouts render critical UI', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/');
  await expect(page.getByText('参数控制台')).toBeVisible();
  await expect(page.getByText('底部波形观察区')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText(APP_TITLE).first()).toBeVisible();
  await expect(page.getByText('参数控制台')).toBeVisible();
  await expect(page.getByRole('button', { name: /全屏/ })).toBeVisible();
});

test('guided experiment steps load real parameter presets', async ({ page }) => {
  await page.goto('/');
  await openModule(page, '02');
  // 引导现在在 SimulationPanel 里的 GuidedExperimentBar，不在 aside
  await page.getByRole('button', { name: /注入畸变/ }).first().click();
  await expect(page.getByText(/55(\.0)?\s*Hz/).first()).toBeVisible();

  await openModule(page, '07');
  await page.getByRole('button', { name: /进入过调制/ }).first().click();
  await expect(page.getByText(/280(\.0)?\s*V/).first()).toBeVisible();
});

// Playwright 的 page.mouse 在某些 Chromium 版本下不会把 buttons=1 透传给 React PointerEvent。
// 我们直接用 dispatchEvent 模拟拖拽，等价于真实用户交互。
async function dragOnSvg(page: Page, fromX: number, fromY: number, toX: number, toY: number) {
  await page.evaluate(async ({ fx, fy, tx, ty }) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const svg = document.querySelector('svg.cursor-crosshair') as SVGElement | null;
    if (!svg) throw new Error('no cursor-crosshair svg');
    const rect = svg.getBoundingClientRect();
    const cx = rect.x + rect.width * fx;
    const cy = rect.y + rect.height * fy;
    const ex = rect.x + rect.width * tx;
    const ey = rect.y + rect.height * ty;
    svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, pointerId: 1, button: 0, buttons: 1, bubbles: true, cancelable: true }));
    await wait(40);
    for (let k = 1; k <= 8; k += 1) {
      const x = cx + (ex - cx) * (k / 8);
      const y = cy + (ey - cy) * (k / 8);
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, buttons: 1, bubbles: true }));
      await wait(20);
    }
    svg.dispatchEvent(new PointerEvent('pointerup', { clientX: ex, clientY: ey, pointerId: 1, buttons: 0, bubbles: true }));
    await wait(120);
  }, { fx: fromX, fy: fromY, tx: toX, ty: toY });
}

test('vector planes support direct drag interaction', async ({ page }) => {
  await page.goto('/');
  await openModule(page, '03');
  await page.waitForTimeout(400);
  const ia = page.locator('aside input[type="range"]').first();
  const beforeIa = await ia.inputValue();
  await expect(page.locator('svg.cursor-crosshair').first()).toBeVisible();
  await dragOnSvg(page, 0.5, 0.5, 0.82, 0.28);
  await expect(ia).not.toHaveValue(beforeIa);

  await openModule(page, '07');
  await page.waitForTimeout(400);
  const sliders = page.locator('aside input[type="range"]');
  const beforeSliderValues = await Promise.all(
    Array.from({ length: await sliders.count() }, (_, i) => sliders.nth(i).inputValue()),
  );
  await expect(page.locator('svg.cursor-crosshair').first()).toBeVisible();
  await dragOnSvg(page, 0.5, 0.5, 0.78, 0.32);
  const afterSliderValues = await Promise.all(
    Array.from({ length: await sliders.count() }, (_, i) => sliders.nth(i).inputValue()),
  );
  expect(afterSliderValues).not.toEqual(beforeSliderValues);

  await openModule(page, '11');
  await page.waitForTimeout(400);
  const idSlider = page.locator('aside input[type="range"]').nth(2);
  const beforeId = await idSlider.inputValue();
  await expect(page.locator('svg.cursor-crosshair').first()).toBeVisible();
  await dragOnSvg(page, 0.5, 0.5, 0.28, 0.34);
  await expect(idSlider).not.toHaveValue(beforeId);
});
