import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Rota Brasil Tycoon',
        short_name: 'Rota Brasil',
        description: 'Construa seu império de transporte começando ao volante de um carro velho.',
        theme_color: '#102a43',
        background_color: '#071521',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        globIgnores: ['data/cities/brasilia/chunks/**'],
        runtimeCaching: [{
          urlPattern: /\/data\/cities\/brasilia\/(?:chunks\/|lane-graph\.json\.gz)/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'brasilia-map-0.7',
            expiration: { maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 }
          }
        }],
        navigateFallback: 'index.html'
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
