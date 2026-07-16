import { defineConfig, devices } from '@playwright/test';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const path = process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : '/';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  // Um runner compartilhado não representa desempenho gráfico e dois jogos
  // Phaser simultâneos tornam a direção automática artificialmente instável.
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: `http://127.0.0.1:4173${path}`,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
