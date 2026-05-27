import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../app/src/main/assets');

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'on-first-retry',
    },
    webServer: {
        command: `npx --yes http-server "${assetsDir}" -p 4173 -c-1 --silent`,
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
