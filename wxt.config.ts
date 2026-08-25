import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import { patchReactDomInnerHTMLPlugin } from './scripts/patch-react-innerhtml.mjs';
import { YOUTUBE_MATCHES } from './src/lib/youtube/video-id';

const SCRATCH_IGNORED = [
  '**/scratch/**',
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
];

function isScratchPath(target: fs.PathLike): boolean {
  const normalized = path.resolve(String(target)).replaceAll('\\', '/');
  return normalized.includes('/scratch/');
}

/** Chrome profile files under scratch/ lock fs.watch and crash Vite. */
function ignoreScratchFsWatch() {
  const originalWatch = fs.watch;
  fs.watch = ((filename: fs.PathLike, ...rest: unknown[]) => {
    if (isScratchPath(filename)) {
      const watcher = new EventEmitter() as fs.FSWatcher;
      watcher.close = () => undefined;
      watcher.ref = () => watcher;
      watcher.unref = () => watcher;
      return watcher;
    }
    return (originalWatch as (...args: unknown[]) => fs.FSWatcher)(
      filename,
      ...rest,
    );
  }) as typeof fs.watch;

  return { name: 'ignore-scratch-fs-watch' };
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  zip: {
    excludeSources: [
      'scratch/**',
      'test-results/**',
      'playwright-report/**',
      'playwright/.cache/**',
      'coverage/**',
      'blob-report/**',
    ],
  },
  vite: () => ({
    plugins: [ignoreScratchFsWatch(), patchReactDomInnerHTMLPlugin(), tailwindcss()],
    server: {
      watch: {
        ignored: SCRATCH_IGNORED,
      },
    },
  }),
  manifest: {
    name: 'DynamicSpeed for YouTube',
    short_name: 'DynamicSpeed',
    description:
      'Automatically match YouTube playback speed to your target words-per-minute.',
    permissions: ['storage'],
    host_permissions: [...YOUTUBE_MATCHES],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'self';",
    },
    browser_specific_settings: {
      gecko: {
        id: 'dynamicspeed-for-youtube@dynamicspeed',
        // data_collection_permissions: Firefox 140 desktop / 142 Android.
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
    commands: {
      'toggle-enabled': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Toggle DynamicSpeed',
      },
      'wpm-up': {
        suggested_key: { default: 'Alt+Shift+W' },
        description: 'Increase target WPM by 10',
      },
      'wpm-down': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Decrease target WPM by 10',
      },
      'force-1x': {
        description: 'Pause automation and set 1×',
      },
      'toggle-broll': {
        description: 'Toggle b-roll acceleration',
      },
    },
    action: {
      default_title: 'DynamicSpeed for YouTube',
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
