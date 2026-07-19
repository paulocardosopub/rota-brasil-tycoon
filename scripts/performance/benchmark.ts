import { chromium, type Page } from '@playwright/test';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = process.argv[2] ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });

type ResourceTotals = {
  transferredBytes: number;
  encodedBytes: number;
  mapTransferredBytes: number;
  mapEncodedBytes: number;
  requests: number;
};

try {
  const results = [];
  for (const preset of [
    { name: 'desktop-1440x900', width: 1440, height: 900, autopilot: false },
    { name: 'mobile-390x844-pilot', width: 390, height: 844, autopilot: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: preset.width, height: preset.height } });
    const page = await context.newPage();
    results.push(await measure(page, preset, 'cold'));
    await page.waitForTimeout(500);
    results.push(await measure(page, preset, 'warm'));
    await context.close();
  }
  console.table(results.map((result) => ({
    preset: result.preset,
    cache: result.cache,
    interfaceMs: result.interfaceMs,
    gameReadyMs: result.gameReadyMs,
    mapBeforeReadyMB: toMB(result.beforeReady.mapEncodedBytes),
    dataBeforeReadyMB: toMB(result.beforeReady.encodedBytes),
    networkBeforeReadyMB: toMB(result.beforeReady.transferredBytes),
    dataSessionMB: toMB(result.afterSettle.encodedBytes),
    networkSessionMB: toMB(result.afterSettle.transferredBytes),
    heapUsedMB: result.heapUsedMB,
    minimumFps: result.minimumFps,
    medianFps: result.medianFps,
    maximumFps: result.maximumFps
  })));

  const artifacts = await artifactStats();
  const report = {
    version: '0.8.6',
    measuredAt: new Date().toISOString(),
    target,
    baseline085: {
      desktop: { interfaceMs: 142, gameReadyMs: 7_901, medianFps: 35 },
      mobile: { interfaceMs: 151, gameReadyMs: 4_030, medianFps: 54 },
      initialBundleBytes: 1_910_005,
      routingCoreBytes: 16_284_335,
      publishedChunkBytes: 161_267_637
    },
    artifacts,
    results
  };
  await writeFile(path.resolve('docs/performance-0.8.6.json'), `${JSON.stringify(report, null, 2)}\n`);
  const failed = results.some((result) => result.medianFps < 30
    || result.traffic !== 72
    || result.terrestrialEntities > 350
    || (result.cache === 'cold' && result.preset.startsWith('desktop') && result.gameReadyMs > 3_000)
    || (result.cache === 'cold' && result.preset.startsWith('mobile') && result.gameReadyMs > 5_000));
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}

async function measure(
  page: Page,
  preset: { name: string; autopilot: boolean },
  cache: 'cold' | 'warm'
) {
  const startedAt = Date.now();
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('guest-button').waitFor({ state: 'visible' });
  const interfaceMs = Date.now() - startedAt;
  await page.getByTestId('guest-button').click();
  const hud = page.locator('[data-game-ready="true"]');
  await hud.waitFor({ state: 'visible', timeout: 25_000 });
  const gameReadyMs = Date.now() - startedAt;
  const beforeReady = await resourceTotals(page);
  if (preset.autopilot) await page.getByTestId('autopilot-button').click();
  await page.waitForTimeout(2_500);
  const fps = await collectFps(page, hud);
  const afterSettle = await resourceTotals(page);
  const heapUsedMB = await page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null;
  });
  return {
    preset: preset.name,
    cache,
    interfaceMs,
    gameReadyMs,
    beforeReady,
    afterSettle,
    heapUsedMB,
    minimumFps: Math.min(...fps),
    medianFps: median(fps),
    maximumFps: Math.max(...fps),
    traffic: Number(await hud.getAttribute('data-traffic-vehicles')),
    buses: Number(await hud.getAttribute('data-traffic-buses')),
    airTraffic: Number(await hud.getAttribute('data-air-traffic')),
    terrestrialEntities: Number(await hud.getAttribute('data-terrestrial-entities'))
  };
}

async function resourceTotals(page: Page): Promise<ResourceTotals> {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return resources.reduce((totals, resource) => {
      const map = resource.name.includes('/data/cities/brasilia/');
      totals.transferredBytes += resource.transferSize;
      totals.encodedBytes += resource.encodedBodySize;
      totals.requests += 1;
      if (map) {
        totals.mapTransferredBytes += resource.transferSize;
        totals.mapEncodedBytes += resource.encodedBodySize;
      }
      return totals;
    }, { transferredBytes: 0, encodedBytes: 0, mapTransferredBytes: 0, mapEncodedBytes: 0, requests: 0 });
  });
}

async function artifactStats() {
  const assetDirectory = path.resolve('dist/assets');
  const assets = await readdir(assetDirectory);
  const sizes = await Promise.all(assets.map(async (name) => ({ name, bytes: (await stat(path.join(assetDirectory, name))).size })));
  const initial = sizes.filter((asset) => asset.name.startsWith('index-'));
  const graphFile = path.resolve('public/data/cities/brasilia/routing-core-0.8.6.json.gz');
  const manifest = JSON.parse(await readFile(path.resolve('public/data/cities/brasilia/manifest.json'), 'utf8')) as { chunks: Array<{ file: string }> };
  const chunkBytes = (await Promise.all(manifest.chunks.map(async (chunk) =>
    (await stat(path.resolve('public/data/cities/brasilia', chunk.file))).size
  ))).reduce((sum, bytes) => sum + bytes, 0);
  return {
    initialBundleBytes: initial.reduce((sum, asset) => sum + asset.bytes, 0),
    applicationBundleBytes: sizes.reduce((sum, asset) => sum + asset.bytes, 0),
    routingCoreBytes: (await stat(graphFile)).size,
    publishedChunkBytes: chunkBytes,
    publishedMapBytes: chunkBytes + (await stat(graphFile)).size
  };
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

function toMB(bytes: number) {
  return Math.round(bytes / 10_486) / 100;
}
