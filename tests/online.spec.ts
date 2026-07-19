import { expect, test } from '@playwright/test';

test('dois clientes se veem, sincronizam, reconectam e preservam o modo solo', async ({ browser }, testInfo) => {
  test.setTimeout(60_000);
  const configuredBase = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173/');
  const onlineUrl = `${configuredBase}${configuredBase.includes('?') ? '&' : '?'}onlineTransport=mock`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await Promise.all([pageA.goto(onlineUrl), pageB.goto(onlineUrl)]);
    await Promise.all([pageA.getByTestId('guest-button').click(), pageB.getByTestId('guest-button').click()]);
    const hudA = pageA.locator('[data-game-ready="true"]');
    const hudB = pageB.locator('[data-game-ready="true"]');
    await Promise.all([expect(hudA).toBeVisible({ timeout: 25_000 }), expect(hudB).toBeVisible({ timeout: 25_000 })]);
    await Promise.all([expect(hudA).toHaveAttribute('data-online-state', 'ONLINE'), expect(hudB).toHaveAttribute('data-online-state', 'ONLINE')]);
    await expect.poll(async () => {
      const minuteA = Number(await hudA.getAttribute('data-world-minute'));
      const minuteB = Number(await hudB.getAttribute('data-world-minute'));
      return Math.abs(minuteA - minuteB);
    }).toBeLessThan(0.5);
    await expect(hudA).toHaveAttribute('data-world-period', await hudB.getAttribute('data-world-period') ?? '');
    await expect.poll(async () => Number(await hudA.getAttribute('data-online-nearby-players'))).toBe(1);
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(1);

    await pageA.keyboard.down('w');
    await pageA.waitForTimeout(1_200);
    await pageA.keyboard.up('w');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-npc-replacements')), { timeout: 6_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-receive-rate')), { timeout: 6_000 }).toBeGreaterThan(0);
    await pageB.getByTestId('map-button').click();
    await expect(pageB.getByTestId('overview-map').locator('.overview-marker.online')).toHaveCount(1);
    await pageB.locator('.overview-map-panel').getByRole('button', { name: 'Fechar' }).click();

    await pageA.getByRole('button', { name: 'Configurações' }).click();
    await pageA.getByTestId('online-mode-select').selectOption('solo');
    await expect(hudA).toHaveAttribute('data-online-state', 'SOLO');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(0);
    await pageB.getByTestId('map-button').click();
    await expect(pageB.getByTestId('overview-map').locator('.overview-marker.online')).toHaveCount(0);
    await pageB.locator('.overview-map-panel').getByRole('button', { name: 'Fechar' }).click();
    const soloMinute = Number(await hudA.getAttribute('data-world-minute'));
    await pageA.waitForTimeout(1_100);
    await expect.poll(async () => Number(await hudA.getAttribute('data-world-minute'))).toBeGreaterThan(soloMinute);

    await pageA.getByTestId('online-mode-select').selectOption('online');
    await expect(hudA).toHaveAttribute('data-online-state', 'ONLINE');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(1);
    await pageB.getByTestId('map-button').click();
    await expect(pageB.getByTestId('overview-map').locator('.overview-marker.online')).toHaveCount(1);
    await pageB.locator('.overview-map-panel').getByRole('button', { name: 'Fechar' }).click();
    await expect.poll(async () => {
      const minuteA = Number(await hudA.getAttribute('data-world-minute'));
      const minuteB = Number(await hudB.getAttribute('data-world-minute'));
      return Math.abs(minuteA - minuteB);
    }).toBeLessThan(0.5);

    await pageB.getByRole('button', { name: 'Configurações' }).click();
    await pageB.getByTestId('online-mode-select').selectOption('solo');
    await expect(hudB).toHaveAttribute('data-online-state', 'SOLO');
    await expect(hudB).toHaveAttribute('data-online-npc-replacements', '0');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('duas abas não controlam o mesmo veículo e a aba proprietária libera o lease ao fechar', async ({ browser }, testInfo) => {
  test.setTimeout(45_000);
  const configuredBase = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173/');
  const onlineUrl = `${configuredBase}${configuredBase.includes('?') ? '&' : '?'}onlineTransport=mock`;
  const context = await browser.newContext();
  const ownerPage = await context.newPage();
  const spectatorPage = await context.newPage();
  try {
    await ownerPage.goto(onlineUrl);
    await ownerPage.getByTestId('guest-button').click();
    await expect(ownerPage.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
    await expect(ownerPage.locator('[data-game-ready="true"]')).toHaveAttribute('data-online-state', 'ONLINE');
    await expect.poll(() => ownerPage.evaluate(() => Boolean(localStorage.getItem('rota-brasil-tycoon-save'))), { timeout: 10_000 }).toBe(true);

    await spectatorPage.goto(onlineUrl);
    await spectatorPage.getByRole('button', { name: 'Continuar' }).click();
    await expect(spectatorPage.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
    expect(await spectatorPage.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('rbt-control-lease:')).length)).toBe(1);
    await expect(spectatorPage.getByTestId('online-badge')).toHaveAttribute('title', /outra aba/);

    await ownerPage.close();
    await expect.poll(() => spectatorPage.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('rbt-control-lease:')).length)).toBe(0);
  } finally {
    await spectatorPage.close();
    await context.close();
  }
});
