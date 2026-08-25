import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const e2eRoot = path.join(fileURLToPath(new URL('.', import.meta.url)), '../..');

export function resolveExtensionPath(): string {
  const candidates = [
    path.join(e2eRoot, 'dist', 'chrome-mv3'),
    path.join(e2eRoot, '.output', 'chrome-mv3'),
  ];
  const found = candidates.find((candidate) => existsSync(path.join(candidate, 'manifest.json')));
  if (!found) {
    throw new Error('Chrome MV3 build is missing. Run npm run build:chrome');
  }
  return found.replaceAll('\\', '/');
}
