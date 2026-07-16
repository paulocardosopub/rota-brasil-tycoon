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
  await expect(page.getByTestId('ride-offer')).toContainText('garantido');
  await page.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page.getByTestId('objective-card')).toContainText('Busque');
  await expect(page.getByTestId('speedometer')).toContainText('km/h');

  const hud = page.locator('.hud');
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-vehicles'))).toBe(72);
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-buses'))).toBe(9);
  await expect(hud).toHaveAttribute('data-air-traffic', '10');
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
  await expect(page.getByText('CORRIDAS', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar corrida' })).toBeVisible();
  expect(criticalErrors).toEqual([]);
});

test('controle volta após trocar de aba e uma nova corrida continua dirigível', async ({ page, context }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });

  const simulationBeforeTabChange = Number(await hud.getAttribute('data-simulation-seconds'));
  const otherPage = await context.newPage();
  await otherPage.goto('about:blank');
  await otherPage.bringToFront();
  await otherPage.waitForTimeout(2_500);
  await page.bringToFront();
  await expect.poll(async () => Number(await hud.getAttribute('data-simulation-seconds'))).toBeGreaterThan(simulationBeforeTabChange + 1.5);
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
  await expect(page.getByTestId('objective-card')).toContainText('Nova oferta');

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

test('piloto automático dirige sozinho e recolhe os controles no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.mobile-controls')).toBeVisible();

  await page.getByTestId('autopilot-button').click();
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await expect(page.locator('.mobile-controls')).toBeHidden();
  const pilotBox = await page.getByTestId('autopilot-button').boundingBox();
  const menuBox = await page.locator('.bottom-nav').boundingBox();
  expect(pilotBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(pilotBox!.y + pilotBox!.height).toBeLessThanOrEqual(menuBox!.y + 3);
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 8_000 }).toBeGreaterThan(10);
  // O piloto prefere a rua, mas pode atravessar uma pequena falha do mapa para
  // não ficar preso. Curvas e retorno ao asfalto são cobertos pelos testes do mapa.
  await expect.poll(async () => Number(await hud.getAttribute('data-autopilot-min-road-clearance'))).toBeGreaterThan(-6);
  expect(Number(await hud.getAttribute('data-collision-events'))).toBe(0);

  await page.getByTestId('autopilot-button').click();
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'false');
  await expect(page.locator('.mobile-controls')).toBeVisible();
});

test('piloto automático embarca, entrega e aceita a próxima recomendação', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();

  await page.getByRole('button', { name: 'Ir ao passageiro' }).click();
  await expect(page.getByTestId('objective-card')).toContainText('Leve', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Ir ao destino' }).click();
  await expect(page.getByTestId('receipt-card')).toBeVisible({ timeout: 5_000 });
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await expect.poll(async () => Number(await hud.getAttribute('data-autopilot-next-mission-seconds'))).toBeGreaterThan(0);

  await expect(page.getByTestId('receipt-card')).toBeHidden({ timeout: 8_000 });
  await expect(page.getByTestId('objective-card')).toContainText('Busque');
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await expect(page.locator('.mobile-controls')).toBeHidden();
});

test('WASD assume imediatamente a direção manual livre', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('autopilot-button').click();
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await page.keyboard.down('KeyA');
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'false');
  await page.keyboard.up('KeyA');
});

test('uma colisão imobiliza o NPC e gera apenas um impacto enquanto há contato', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'NPC sobre o carro' }).click();
  await expect.poll(async () => Number(await hud.getAttribute('data-collision-events')), { timeout: 5_000 }).toBe(1);
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-stunned'))).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1_500);
  expect(Number(await hud.getAttribute('data-collision-events'))).toBe(1);
});

test('piloto automático freia para tráfego à frente sem bater', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();
  await page.getByRole('button', { name: 'NPC à frente' }).click();
  await expect.poll(async () => await hud.getAttribute('data-auto-brake-reason'), { timeout: 8_000 }).toBe('traffic');
  expect(Number(await hud.getAttribute('data-collision-events'))).toBe(0);
});

test('piloto automático se solta depois de uma colisão sem repetir impactos', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();
  await page.getByRole('button', { name: 'NPC sobre o carro' }).click();

  await expect.poll(async () => Number(await hud.getAttribute('data-collision-events')), { timeout: 5_000 }).toBe(1);
  await expect.poll(async () => Number(await hud.getAttribute('data-traffic-ghosted'))).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 7_000 }).toBeGreaterThan(5);
  expect(Number(await hud.getAttribute('data-collision-events'))).toBe(1);
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
});

test('piloto automático resolve um impasse de frente com outro veículo', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();
  await page.getByRole('button', { name: 'NPC de frente' }).click();

  await expect.poll(async () => Number(await hud.getAttribute('data-autopilot-deadlock-recoveries')), { timeout: 9_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 7_000 }).toBeGreaterThan(5);
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
});

test('colisão moderada usa gravidade e velocidade relativa no HUD', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Colisão moderada' }).click();
  await expect(hud).toHaveAttribute('data-collision-severity', 'moderate', { timeout: 5_000 });
  await expect.poll(async () => Number(await hud.getAttribute('data-collision-relative-speed-kmh'))).toBeGreaterThan(20);
});

test('recarregar preserva a corrida em andamento sem duplicar progresso', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir ao passageiro' }).click();
  await expect(page.getByTestId('objective-card')).toContainText('Leve', { timeout: 5_000 });
  await page.waitForTimeout(5_500);

  await page.reload();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('[data-game-ready="true"]')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('objective-card')).toContainText('Leve');
  await expect(page.getByTestId('receipt-card')).toBeHidden();
});

test('pagamento da corrida entra uma vez no ledger e persiste no save v4', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir ao passageiro' }).click();
  await page.getByRole('button', { name: 'Ir ao destino' }).click();
  await expect(page.getByTestId('receipt-card')).toBeVisible({ timeout: 5_000 });
  const ledgerCount = Number(await hud.getAttribute('data-ledger-count'));
  expect(ledgerCount).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(5_500);
  await page.reload();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const restored = page.locator('[data-game-ready="true"]');
  await expect(restored).toBeVisible({ timeout: 25_000 });
  await expect.poll(async () => Number(await restored.getAttribute('data-ledger-count'))).toBe(ledgerCount);
});

test('piloto entra no posto real, para e abastece somente após confirmação', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  const fuelBefore = Number(await hud.getAttribute('data-fuel'));
  await page.getByTestId('city-button').click();
  await page.getByRole('button', { name: /Posto Eixo Norte/ }).click();
  await expect(hud).toHaveAttribute('data-selected-service', 'fuel-shn-br');
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir à entrada do serviço' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();
  await expect(hud).toHaveAttribute('data-nearby-service', 'fuel-shn-br', { timeout: 15_000 });
  await expect.poll(async () => Number(await hud.getAttribute('data-speed-kmh')), { timeout: 10_000 }).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: /5 L/ }).click();
  const confirmation = page.locator('.confirm-strip');
  await expect(confirmation).toContainText('Confirmar 5 L');
  await confirmation.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => Number(await hud.getAttribute('data-fuel'))).toBeGreaterThan(fuelBefore + 4.5);
  await expect.poll(async () => Number(await hud.getAttribute('data-ledger-count'))).toBeGreaterThanOrEqual(1);
  await expect(hud).toHaveAttribute('data-selected-service', 'none');
});

test('oficina real recebe o piloto e registra reparo sem atravessar prédio', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Dano +25' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('city-button').click();
  await page.getByRole('button', { name: /Oficina Central do Eixo/ }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir à entrada do serviço' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('autopilot-button').click();
  await expect(hud).toHaveAttribute('data-nearby-service', 'workshop-shn-central', { timeout: 15_000 });
  await page.getByRole('button', { name: /Reparo rápido/ }).click();
  await page.locator('.confirm-strip').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => Number(await hud.getAttribute('data-ledger-count'))).toBeGreaterThanOrEqual(1);
  await expect(hud).toHaveAttribute('data-selected-service', 'none');
});

test('alertas de combustível e reparo traçam a rota e ligam o piloto', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Combustível 0' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('fuel-route-alert').click();
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await expect(hud).not.toHaveAttribute('data-selected-service', 'none');

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Tanque cheio' }).click();
  await page.getByRole('button', { name: 'Dano +25' }).click();
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('repair-route-alert').click();
  await expect(hud).toHaveAttribute('data-autopilot-enabled', 'true');
  await expect(hud).not.toHaveAttribute('data-selected-service', 'none');
});

test('táxi oficial, funcionário e segundo veículo sobrevivem ao recarregamento', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('./');
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await expect(hud).toBeVisible({ timeout: 25_000 });

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Cumprir requisitos' }).click();
  await page.getByRole('button', { name: 'Regularizar', exact: true }).click();
  await page.getByRole('button', { name: 'Converter Hatch' }).click();
  await expect(hud).toHaveAttribute('data-professional-status', 'licensed-taxi');
  await expect(hud).toHaveAttribute('data-taxi-license', 'licensed');

  await page.getByRole('button', { name: 'Gerar corrida de táxi' }).click();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('ride-offer')).toContainText('TÁXI OFICIAL');
  await page.getByRole('button', { name: 'Aceitar', exact: true }).click();
  await expect(page.getByTestId('taxi-meter')).toBeVisible();
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir ao passageiro' }).click();
  await page.keyboard.press('Control+Shift+D');
  await expect(hud).toHaveAttribute('data-taxi-meter-state', /occupied|waiting/, { timeout: 5_000 });
  await page.waitForTimeout(600);
  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Ir ao destino' }).click();
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByTestId('receipt-card')).toContainText('CORRIDA OFICIAL CONCLUÍDA');
  await expect(hud).toHaveAttribute('data-taxi-meter-state', 'finished');
  await page.getByRole('button', { name: 'Próxima corrida' }).click();

  await page.keyboard.press('Control+Shift+D');
  await page.getByRole('button', { name: 'Contratar Bia' }).click();
  await page.getByRole('button', { name: 'Comprar Sedan' }).click();
  await page.getByRole('button', { name: 'Atribuir motorista' }).click();
  await page.getByRole('button', { name: 'Iniciar turno' }).click();
  await page.keyboard.press('Control+Shift+D');
  await expect(hud).toHaveAttribute('data-fleet-employees', '1');
  await expect(hud).toHaveAttribute('data-fleet-vehicles', '2');
  await expect(hud).toHaveAttribute('data-fleet-shift', /starting-shift|seeking-trip|with-passenger/);
  await page.getByTestId('fleet-button').click();
  await page.getByRole('button', { name: 'Localizar veículo' }).click();
  await expect(hud).toHaveAttribute('data-fleet-vehicle-visible', 'true');
  await expect(hud).toHaveAttribute('data-traffic-reserved-slots', '1');
  await expect(hud).toHaveAttribute('data-fleet-driver-identification', 'Motorista Bia Rocha');
  await expect(page.getByText('Motorista Bia Rocha', { exact: true })).toBeVisible();
  await expect.poll(async () => Number(await hud.getAttribute('data-fleet-route-remaining')), { timeout: 10_000 }).toBeGreaterThan(120);
  const targetBefore = await hud.getAttribute('data-fleet-route-target');
  const stopsBefore = await hud.getAttribute('data-fleet-completed-stops');
  const remainingBefore = Number(await hud.getAttribute('data-fleet-route-remaining'));
  await expect.poll(async () => Math.abs(Number(await hud.getAttribute('data-fleet-route-remaining')) - remainingBefore), { timeout: 10_000 })
    .toBeGreaterThan(2);
  await expect(hud).toHaveAttribute('data-fleet-route-target', targetBefore!);
  await expect(hud).toHaveAttribute('data-fleet-completed-stops', stopsBefore!);

  await expect(page.getByTestId('active-fleet-shift')).toBeVisible();
  await page.getByRole('button', { name: 'Encerrar turno' }).click();
  await expect(page.getByTestId('fleet-report')).toBeVisible();

  await page.waitForTimeout(5_500);
  await page.reload();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const restored = page.locator('[data-game-ready="true"]');
  await expect(restored).toBeVisible({ timeout: 25_000 });
  await expect(restored).toHaveAttribute('data-fleet-employees', '1');
  await expect(restored).toHaveAttribute('data-fleet-vehicles', '2');
  await page.getByTestId('fleet-button').click();
  await expect(page.getByTestId('fleet-report')).toBeVisible();
});
