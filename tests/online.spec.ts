import { expect, test } from '@playwright/test';

test('dois clientes se veem, sincronizam, reconectam e preservam o modo solo', async ({ browser }, testInfo) => {
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
    }).toBeLessThan(0.25);
    await expect(hudA).toHaveAttribute('data-world-period', await hudB.getAttribute('data-world-period') ?? '');
    await expect.poll(async () => Number(await hudA.getAttribute('data-online-nearby-players'))).toBe(1);
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(1);

    await pageA.keyboard.down('w');
    await pageA.waitForTimeout(1_200);
    await pageA.keyboard.up('w');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-npc-replacements')), { timeout: 6_000 }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-receive-rate')), { timeout: 6_000 }).toBeGreaterThan(0);

    await pageA.getByRole('button', { name: 'Configurações' }).click();
    await pageA.getByTestId('online-mode-select').selectOption('solo');
    await expect(hudA).toHaveAttribute('data-online-state', 'SOLO');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(0);
    const soloMinute = Number(await hudA.getAttribute('data-world-minute'));
    await pageA.waitForTimeout(1_100);
    await expect.poll(async () => Number(await hudA.getAttribute('data-world-minute'))).toBeGreaterThan(soloMinute);

    await pageA.getByTestId('online-mode-select').selectOption('online');
    await expect(hudA).toHaveAttribute('data-online-state', 'ONLINE');
    await expect.poll(async () => Number(await hudB.getAttribute('data-online-nearby-players'))).toBe(1);
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
