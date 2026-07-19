import { expect, test } from '@playwright/test';

async function enterGame(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
}

test('mapa geral carrega sob demanda e atualiza apenas marcadores permitidos', async ({ page }) => {
  await enterGame(page);
  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-gameplay-speed', '2');
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('overview-map.webp')))).toBe(false);

  await page.getByTestId('map-button').click();
  const map = page.getByTestId('overview-map');
  await expect(map).toBeVisible();
  const image = map.locator('img');
  await expect(image).toHaveAttribute('loading', 'lazy');
  await expect(image).toHaveAttribute('src', /overview-map\.webp/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1440);
  await expect(map.getByLabel('Meu veículo')).toBeChecked();
  await expect(map.getByLabel('Funcionários')).toBeChecked();
  await expect(map.getByLabel('Minha frota')).toBeChecked();
  await expect(map.getByLabel('Jogadores online')).toBeChecked();
  await expect(map.getByLabel('Garagens')).toBeChecked();
  await expect(map.locator('.overview-legend')).toHaveCount(5);
  expect(await map.locator('.overview-marker.player').count()).toBe(1);
  expect(await map.locator('.overview-marker').count()).toBeGreaterThanOrEqual(1);
  expect(await map.locator('.overview-marker.npc').count()).toBe(0);

  await map.getByLabel('Minha frota').uncheck();
  expect(await map.locator('.overview-marker.fleet').count()).toBe(0);
  await map.getByRole('button', { name: 'Mostrar tudo' }).click();
  await expect(map.getByLabel('Minha frota')).toBeChecked();
});

test('mapa geral permanece utilizável no mobile sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterGame(page);
  await page.getByTestId('map-button').click();
  const panel = page.locator('.overview-map-panel');
  await expect(panel).toBeVisible();
  const dimensions = await panel.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByTestId('overview-marker-detail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Centralizar em mim' })).toBeVisible();
});
