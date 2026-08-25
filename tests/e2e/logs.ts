import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, ConsoleMessage, Page, Worker } from '@playwright/test';
import { e2eRoot } from './paths';

export type CapturedLog = {
  source: 'page-console' | 'pageerror' | 'worker-console' | 'cdp-exception';
  type: string;
  text: string;
  url?: string;
  stack?: string;
};

const BENIGN_EXTENSION = [
  /Download the React DevTools/i,
  /service worker.*restarted/i,
  /preload for .+ is found, but is not used because it is a cross-world extension resource mismatch/i,
];

export function installLogCollectors(context: BrowserContext, logs: CapturedLog[]): void {
  const hookPage = (page: Page) => {
    page.on('console', (msg) => logs.push(fromConsole('page-console', msg)));
    page.on('pageerror', (error) => {
      logs.push({
        source: 'pageerror',
        type: 'error',
        text: error.message,
        stack: error.stack,
      });
    });
    void attachCdpExceptions(page, logs);
  };

  const hookWorker = (worker: Worker) => {
    worker.on('console', (msg) => logs.push(fromConsole('worker-console', msg)));
  };

  context.pages().forEach(hookPage);
  context.on('page', hookPage);
  context.serviceWorkers().forEach(hookWorker);
  context.on('serviceworker', hookWorker);
}

export function extensionFailures(logs: CapturedLog[], extensionId: string): CapturedLog[] {
  return logs.filter((log) => isActionableExtensionFailure(log, extensionId));
}

export function isActionableExtensionFailure(log: CapturedLog, extensionId: string): boolean {
  if (!isSevere(log.type) && log.source !== 'pageerror' && log.source !== 'cdp-exception') {
    return false;
  }
  if (!isExtensionSourced(log, extensionId)) {
    return false;
  }
  const haystack = `${log.text}\n${log.stack ?? ''}`;
  return !BENIGN_EXTENSION.some((pattern) => pattern.test(haystack));
}

export function dumpLogs(fileStem: string, payload: unknown): string {
  const dir = path.join(e2eRoot, 'scratch');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${fileStem}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function isSevere(type: string): boolean {
  return type === 'error' || type === 'warning' || type === 'assert' || type === 'exception';
}

function isExtensionSourced(log: CapturedLog, extensionId: string): boolean {
  const haystack = `${log.url ?? ''}\n${log.text}\n${log.stack ?? ''}`;
  return (
    haystack.includes(`chrome-extension://${extensionId}`) || haystack.includes('[DynamicSpeed]')
  );
}

function fromConsole(
  source: CapturedLog['source'],
  msg: ConsoleMessage,
): CapturedLog {
  const location = msg.location();
  return {
    source,
    type: msg.type(),
    text: msg.text(),
    url: location.url,
    stack: `${location.url}:${location.lineNumber}:${location.columnNumber}`,
  };
}

async function attachCdpExceptions(page: Page, logs: CapturedLog[]): Promise<void> {
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('Runtime.enable');
    session.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      const description =
        exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'exception';
      const frames = exceptionDetails.stackTrace?.callFrames ?? [];
      logs.push({
        source: 'cdp-exception',
        type: 'exception',
        text: description,
        url: exceptionDetails.url ?? frames[0]?.url,
        stack: frames.map((frame) => `${frame.url}:${frame.lineNumber}:${frame.columnNumber}`).join('\n'),
      });
    });
  } catch {
    // Page may already be closed.
  }
}
