import { defineConfig, devices } from '@playwright/test';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const path = process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : '/';
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Um runner compartilhado não representa desempenho gráfico e dois jogos
  // Phaser simultâneos tornam a direção automática artificialmente instável.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}${path}`,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
