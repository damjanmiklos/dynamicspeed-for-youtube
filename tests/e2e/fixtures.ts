import { test as base, chromium, type BrowserContext } from '@playwright/test';
import {
  dumpLogs,
  extensionFailures,
  installLogCollectors,
  type CapturedLog,
} from './logs';
import { resolveExtensionPath } from './paths';

const headed = process.env.CI !== 'true' && process.env.E2E_HEADLESS !== '1';
const cdpUrl = process.env.E2E_CDP;

async function findDynamicSpeedId(context: BrowserContext, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const worker of context.serviceWorkers()) {
      const id = worker.url().split('/')[2];
      if (!id) {
        continue;
      }
      const probe = await context.newPage();
      try {
        const response = await probe.goto(`chrome-extension://${id}/manifest.json`, {
          waitUntil: 'domcontentloaded',
          timeout: 4_000,
        });
        const manifest = (await response?.json()) as { name?: string; short_name?: string };
        if (manifest?.short_name === 'DynamicSpeed' || manifest?.name?.includes('DynamicSpeed')) {
          return id;
        }
      } catch {
        // Not this extension, or the worker is restarting.
      } finally {
        await probe.close();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return '';
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  extensionLogs: CapturedLog[];
}>({
  extensionLogs: async ({}, use) => {
    const logs: CapturedLog[] = [];
    await use(logs);
  },

  context: async ({ extensionLogs }, use, testInfo) => {
    if (cdpUrl) {
      const browser = await chromium.connectOverCDP(cdpUrl);
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error(`No browser context at ${cdpUrl}`);
      }
      if (!(await findDynamicSpeedId(context, 2_000))) {
        try {
          const cdp = await browser.newBrowserCDPSession();
          await cdp.send('Extensions.loadUnpacked', { path: resolveExtensionPath() });
        } catch {
          // Already loaded, or this Chrome was not started with --enable-unsafe-extension-debugging.
        }
      }
      installLogCollectors(context, extensionLogs);
      await use(context);
      dumpLogs('e2e-last-run', { test: testInfo.title, cdpUrl, logs: extensionLogs });
      return;
    }

    const extensionPath = resolveExtensionPath();
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !headed,
      viewport: { width: 1440, height: 900 },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--no-first-run',
        '--disable-sync',
      ],
    });
    installLogCollectors(context, extensionLogs);
    await use(context);
    const dump = dumpLogs('e2e-last-run', {
      test: testInfo.title,
      headed,
      logs: extensionLogs,
    });
    await testInfo.attach('extension-logs', {
      path: dump,
      contentType: 'application/json',
    });
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    if (!cdpUrl) {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
      const id = worker.url().split('/')[2] ?? '';
      if (!id) {
        throw new Error('DynamicSpeed service worker did not start');
      }
      await use(id);
      return;
    }

    const extensionId = await findDynamicSpeedId(context, 20_000);
    if (!extensionId) {
      throw new Error('Could not find DynamicSpeed in the attached Chrome session');
    }
    await use(extensionId);
  },
});

export const expect = test.expect;

export function expectNoExtensionFailures(logs: CapturedLog[], extensionId: string): void {
  const failures = extensionFailures(logs, extensionId);
  expect(
    failures,
    failures.map((item) => `[${item.source} ${item.type}] ${item.text}`).join('\n'),
  ).toEqual([]);
}
