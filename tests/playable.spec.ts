import { expect, test } from '@playwright/test';

test('visitante entra e encontra a primeira corrida jogável', async ({ page }) => {
  const criticalErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') criticalErrors.push(message.text()); });
  page.on('pageerror', (error) => criticalErrors.push(error.message));
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  await expect(page.locator('[data-vehicle-name="Hatch 1998"]')).toBeVisible();
  await expect(page.getByTestId('objective-card')).toContainText('Busque');
  await expect(page.getByTestId('speedometer')).toContainText('km/h');

  const hud = page.locator('.hud');
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-vehicles'))).toBeGreaterThanOrEqual(30);
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-buses'))).toBeGreaterThanOrEqual(4);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 6_000 }).toBeGreaterThan(5);
  const headingBeforeManualTurn = Number(await hud.getAttribute('data-vehicle-heading'));
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => {
    const currentHeading = Number(await hud.getAttribute('data-vehicle-heading'));
    return Math.abs(currentHeading - headingBeforeManualTurn);
  }, { timeout: 4_000 }).toBeGreaterThan(0.08);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');

  await page.getByTestId('rides-button').click();
  await expect(page.getByText('CORRIDA ATIVA')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar corrida' })).toBeVisible();
  expect(criticalErrors).toEqual([]);
});

test('controle volta após trocar de aba e uma nova corrida continua dirigível', async ({ page, context }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });

  const otherPage = await context.newPage();
  await otherPage.goto('about:blank');
  await otherPage.bringToFront();
  await page.bringToFront();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 6_000 }).toBeGreaterThan(5);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir ao passageiro' }).click();
  await expect(page.getByTestId('objective-card')).toContainText('Leve', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Ir ao destino' }).click();
  await expect(page.getByTestId('receipt-card')).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Próxima corrida' }).click();
  await expect(page.getByTestId('receipt-card')).toBeHidden();
  await expect(page.getByTestId('objective-card')).toContainText('Busque');

  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 6_000 }).toBeGreaterThan(5);
  await page.keyboard.up('ArrowUp');
  await otherPage.close();
});

test('controles móveis aceleram o Hatch continuamente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  const accelerator = page.getByRole('button', { name: 'Acelerar' });
  const box = await accelerator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 6_000 }).toBeGreaterThan(5);
  await page.mouse.up();
});
