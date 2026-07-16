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
  await page.getByTestId('rides-button').click();
  await expect(page.getByText('CORRIDA ATIVA')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar corrida' })).toBeVisible();
  expect(criticalErrors).toEqual([]);
});
