import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wxtCli = join(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');

function run(args) {
  const result = spawnSync(process.execPath, [wxtCli, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['build', '-b', 'chrome', '--mv3']);
run(['build', '-b', 'firefox', '--mv3']);

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

function listJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function hasInnerHTMLAssignment(code) {
  return /\.innerHTML\s*=(?!=)/.test(code);
}

function assertNoInnerHTMLAssignment(dir) {
  const offenders = listJsFiles(dir).filter((file) =>
    hasInnerHTMLAssignment(readFileSync(file, 'utf8')),
  );
  assert(
    offenders.length === 0,
    `Firefox build still assigns innerHTML (addons-linter warning):\n${offenders.join('\n')}`,
  );
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
assert(
  firefox.manifest.browser_specific_settings?.gecko?.strict_min_version === '142.0',
  `Firefox gecko.strict_min_version must be 142.0 for data_collection_permissions (${firefox.path})`,
);
assertNoInnerHTMLAssignment(dirname(firefox.path));
const firefoxBackground = firefox.manifest.background ?? {};
assert(
  Boolean(firefoxBackground.service_worker) ||
    (Array.isArray(firefoxBackground.scripts) && firefoxBackground.scripts.length > 0),
  `Firefox MV3 manifest must include a background service_worker or scripts (${firefox.path})`,
);

console.log('DynamicSpeed MV3 builds OK');
console.log(`  Chrome:  ${chrome.path}`);
console.log(`  Firefox: ${firefox.path}`);
