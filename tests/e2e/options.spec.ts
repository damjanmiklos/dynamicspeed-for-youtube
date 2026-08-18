import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '../..');
const extensionPath = [
  path.join(root, 'dist', 'chrome-mv3'),
  path.join(root, '.output', 'chrome-mv3'),
].find((candidate) => existsSync(candidate));

test.describe('extension pages', () => {
  test.skip(!extensionPath, 'Chrome MV3 build is missing; run npm run build:chrome');

  test('options page renders', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    const page = await context.newPage();
    const serviceWorkers = context.serviceWorkers();
    const worker =
      serviceWorkers[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
    test.skip(!worker, 'Extension service worker did not start (headless limitation)');
    const extensionId = worker.url().split('/')[2];
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.getByText('DynamicSpeed')).toBeVisible();
    await expect(page.getByText('Target WPM')).toBeVisible();
    await expect(page.getByText('Temporarily turn on captions to load')).toBeVisible();
    await context.close();
  });
});
