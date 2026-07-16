import { expect, test } from '@playwright/test';

test('auditoria visual desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('objective-card')).toBeInViewport();
  await expect(page.getByTestId('autopilot-button')).toBeInViewport();
  if (!process.env.CI) {
    await expect.poll(async () => Number(await page.locator('.hud').getAttribute('data-fps'))).toBeGreaterThan(30);
  }
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
});

test('auditoria visual mobile com piloto', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('autopilot-button').click();
  await expect(page.locator('.mobile-controls')).toBeHidden();
  await expect(page.locator('.bottom-nav')).toBeInViewport();
  if (!process.env.CI) {
    await expect.poll(async () => Number(await hud.getAttribute('data-fps'))).toBeGreaterThan(28);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-pilot.png'), fullPage: true });
});
