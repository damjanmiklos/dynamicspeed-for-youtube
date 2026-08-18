import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  outDir: 'dist',
  manifestVersion: 3,
  suppressWarnings: {
    firefoxDataCollection: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'DynamicSpeed for YouTube',
    short_name: 'DynamicSpeed',
    description:
      'Automatically match YouTube playback speed to your target words-per-minute.',
    permissions: ['storage'],
    host_permissions: [
      '*://*.youtube.com/*',
      '*://youtube.com/*',
      '*://*.youtube-nocookie.com/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'dynamicspeed-for-youtube@dynamicspeed',
        strict_min_version: '121.0',
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
