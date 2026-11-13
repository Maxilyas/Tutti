import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

/**
 * Tests de bout en bout : on construit l'application, on la lance en local
 * (même moteur que chez Cloudflare) et on la pilote avec de vrais navigateurs.
 * Il n'existe qu'un salon de jeu : les tests se suivent, un par un.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { TUTTI_SANS_MEMOIRE: '1' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
