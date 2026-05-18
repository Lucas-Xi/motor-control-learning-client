import { expect, test } from '@playwright/test';

test('diag module 03 sliders', async ({ page }) => {
  await page.goto('/');
  await page.locator('nav button').filter({ hasText: '03 ·' }).click();
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const sliders = page.locator('aside input[type="range"]');
  const count = await sliders.count();
  console.log('SLIDER COUNT:', count);
  for (let i = 0; i < count; i += 1) {
    const s = sliders.nth(i);
    const v = await s.inputValue();
    const visible = await s.isVisible();
    const minAttr = await s.getAttribute('min');
    const maxAttr = await s.getAttribute('max');
    console.log(`[${i}] value=${v} visible=${visible} min=${minAttr} max=${maxAttr}`);
  }
});
