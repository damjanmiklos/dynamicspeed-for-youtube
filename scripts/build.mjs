import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  const result = spawnSync(npx, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['wxt', 'build', '-b', 'chrome', '--mv3']);
run(['wxt', 'build', '-b', 'firefox', '--mv3']);

function readManifest(browser) {
  const candidates = [
    join(root, 'dist', `${browser}-mv3`, 'manifest.json'),
    join(root, '.output', `${browser}-mv3`, 'manifest.json'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`Missing ${browser} MV3 manifest. Looked in:\n${candidates.join('\n')}`);
  }
  return { path: found, manifest: JSON.parse(readFileSync(found, 'utf8')) };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const chrome = readManifest('chrome');
const firefox = readManifest('firefox');

assert(chrome.manifest.manifest_version === 3, `Chrome manifest_version must be 3 (${chrome.path})`);
assert(firefox.manifest.manifest_version === 3, `Firefox manifest_version must be 3 (${firefox.path})`);
assert(
  Boolean(chrome.manifest.background?.service_worker),
  `Chrome MV3 manifest must include background.service_worker (${chrome.path})`,
);
assert(
  Boolean(firefox.manifest.browser_specific_settings?.gecko?.id),
  `Firefox MV3 manifest must include browser_specific_settings.gecko.id (${firefox.path})`,
);
const firefoxBackground = firefox.manifest.background ?? {};
assert(
  Boolean(firefoxBackground.service_worker) ||
    (Array.isArray(firefoxBackground.scripts) && firefoxBackground.scripts.length > 0),
  `Firefox MV3 manifest must include a background service_worker or scripts (${firefox.path})`,
);

console.log('DynamicSpeed MV3 builds OK');
console.log(`  Chrome:  ${chrome.path}`);
console.log(`  Firefox: ${firefox.path}`);
