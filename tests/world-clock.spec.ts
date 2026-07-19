import { expect, test, type Page } from '@playwright/test';

async function enterAsGuest(page: Page) {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  return hud;
}

async function setWorldMinute(page: Page, minute: number) {
  await page.evaluate((nextMinute) => {
    const setter = (window as typeof window & { __RBT_SET_WORLD_TIME__?: (value: number) => void }).__RBT_SET_WORLD_TIME__;
    if (!setter) throw new Error('Controle de horário de desenvolvimento indisponível.');
    setter(nextMinute);
  }, minute);
}

test('relógio de 24 horas respeita todos os limites e transições de pico', async ({ page }) => {
  const hud = await enterAsGuest(page);
  const boundaries = [
    [0, 'madrugada', '00:00', '0.400'],
    [300, 'amanhecer', '05:00', '0.400'],
    [419, 'amanhecer', '06:59', '0.747'],
    [420, 'pico-manha', '07:00', '1.000'],
    [539, 'pico-manha', '08:59', '1.000'],
    [540, 'dia', '09:00', '0.700'],
    [960, 'transicao-tarde', '16:00', '0.700'],
    [1_019, 'transicao-tarde', '16:59', '0.848'],
    [1_020, 'pico-tarde', '17:00', '1.000'],
    [1_139, 'pico-tarde', '18:59', '1.000'],
    [1_140, 'noite', '19:00', '0.650'],
    [1_320, 'noite-avancada', '22:00', '0.500']
  ] as const;

  for (const [minute, period, time, traffic] of boundaries) {
    await setWorldMinute(page, minute);
    await expect(hud).toHaveAttribute('data-world-period', period);
    await expect(hud).toHaveAttribute('data-world-time', time);
    await expect(hud).toHaveAttribute('data-world-traffic-multiplier', traffic);
  }

  await setWorldMinute(page, 419.99);
  await setWorldMinute(page, 420);
  await expect(page.locator('.toast')).toContainText('Horário de pico — trânsito intenso');
  await expect(hud).toHaveAttribute('data-world-flow', 'toward-central');
  await setWorldMinute(page, 1_020);
  await expect(hud).toHaveAttribute('data-world-flow', 'toward-residential');
});

test('oferta criada no pico recebe bônus único de 10%', async ({ page }) => {
  const hud = await enterAsGuest(page);
  await setWorldMinute(page, 450);
  await expect(hud).toHaveAttribute('data-world-demand-bonus', '0.100');
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Gerar corrida', exact: true }).click();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('ride-offer')).toContainText('Demanda de horário de pico: +10%');
  await expect(page.getByTestId('ride-offer').getByText('Demanda de horário de pico: +10%', { exact: true })).toHaveCount(1);
});

test('horário persiste ao recarregar e o HUD móvel não cria rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let hud = await enterAsGuest(page);
  await setWorldMinute(page, 1_260);
  await expect(hud).toHaveAttribute('data-world-period', 'noite');
  await page.reload();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await expect(hud).toHaveAttribute('data-world-period', 'noite');
  await expect(page.locator('.world-clock-chip')).toBeVisible();

  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByLabel('Reduzir faróis, postes e luzes de prédios').check();
  await expect(page.getByLabel('Reduzir faróis, postes e luzes de prédios')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
