import { chromium, type Page } from '@playwright/test';

const target = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });

try {
  const results = [];
  for (const preset of [
    { name: 'desktop-1440x900', width: 1440, height: 900, autopilot: false },
    { name: 'mobile-390x844-pilot', width: 390, height: 844, autopilot: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: preset.width, height: preset.height } });
    const page = await context.newPage();
    const startedAt = Date.now();
    await page.goto(target);
    const documentLoadMs = Date.now() - startedAt;
    await page.getByTestId('guest-button').click();
    const hud = page.locator('[data-game-ready="true"]');
    await hud.waitFor({ state: 'visible', timeout: 25_000 });
    const gameReadyMs = Date.now() - startedAt;
    if (preset.autopilot) await page.getByTestId('autopilot-button').click();
    // Descarta a compilação inicial dos gráficos/chunks pela GPU. A medição
    // representa a partida estabilizada, não a tela de carregamento.
    await page.waitForTimeout(2_500);
    const fps = await collectFps(page, hud);
    const heapUsedMB = await page.evaluate(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null;
    });
    results.push({
      preset: preset.name,
      documentLoadMs,
      gameReadyMs,
      heapUsedMB,
      minimumFps: Math.min(...fps),
      medianFps: median(fps),
      maximumFps: Math.max(...fps),
      traffic: Number(await hud.getAttribute('data-traffic-vehicles')),
      buses: Number(await hud.getAttribute('data-traffic-buses')),
      airTraffic: Number(await hud.getAttribute('data-air-traffic')),
      terrestrialEntities: Number(await hud.getAttribute('data-terrestrial-entities'))
    });
    await context.close();
  }
  console.table(results);
  if (results.some((result) => result.medianFps < 30 || result.traffic !== 72 || result.terrestrialEntities > 350)) process.exitCode = 1;
} finally {
  await browser.close();
}

async function collectFps(page: Page, hud: ReturnType<Page['locator']>) {
  const samples: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.waitForTimeout(750);
    samples.push(Number(await hud.getAttribute('data-fps')));
  }
  return samples;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
