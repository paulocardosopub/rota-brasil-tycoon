import { expect, test } from '@playwright/test';

test('auditoria visual desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
  const renderSize = await page.getByTestId('game-canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    return { pixelsWide: canvas.width, pixelsHigh: canvas.height, cssWide: bounds.width, cssHigh: bounds.height };
  });
  expect(renderSize.pixelsWide).toBeGreaterThanOrEqual(Math.floor(renderSize.cssWide * 0.94));
  expect(renderSize.pixelsHigh).toBeGreaterThanOrEqual(Math.floor(renderSize.cssHigh * 0.94));
  await expect(page.getByTestId('objective-card')).toBeInViewport();
  await expect(page.getByTestId('autopilot-button')).toBeInViewport();
  if (testInfo.config.workers !== 1) {
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
  if (testInfo.config.workers !== 1) {
    await expect.poll(async () => Number(await hud.getAttribute('data-fps'))).toBeGreaterThan(28);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile-pilot.png'), fullPage: true });
});

test('auditoria visual do funcionário identificado em rota', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Cumprir requisitos' }).click();
  await page.getByRole('button', { name: 'Regularizar', exact: true }).click();
  await page.getByRole('button', { name: 'Converter Hatch' }).click();
  await page.getByRole('button', { name: 'Contratar Bia' }).click();
  await page.getByRole('button', { name: 'Comprar Sedan' }).click();
  await page.getByRole('button', { name: 'Atribuir motorista' }).click();
  await page.getByRole('button', { name: 'Iniciar turno' }).click();
  await page.keyboard.press('Control+Shift+D');

  await page.getByTestId('fleet-button').click();
  await page.getByRole('button', { name: 'Localizar veículo' }).click();
  await expect(hud).toHaveAttribute('data-fleet-driver-identification', 'Motorista Bia Rocha');
  await expect.poll(async () => Number(await hud.getAttribute('data-fleet-route-remaining')), { timeout: 10_000 }).toBeGreaterThan(120);
  await page.getByTestId('fleet-button').click();
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: testInfo.outputPath('fleet-driver.png'), fullPage: true });
});
