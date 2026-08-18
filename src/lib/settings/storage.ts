import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, migrateSettings } from './defaults';
import {
  SETTINGS_STORAGE_KEY,
  type DynamicSpeedSettings,
} from './schema';

export async function loadSettings(): Promise<DynamicSpeedSettings> {
  const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  return migrateSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(
  settings: DynamicSpeedSettings,
): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export async function patchSettings(
  patch: Partial<DynamicSpeedSettings>,
): Promise<DynamicSpeedSettings> {
  const current = await loadSettings();
  const next = migrateSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
}

export async function resetSettings(): Promise<DynamicSpeedSettings> {
  await saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export function watchSettings(
  listener: (settings: DynamicSpeedSettings) => void,
): () => void {
  const handler = (
    changes: Record<string, { newValue?: unknown }>,
    area?: string,
  ) => {
    if (area && area !== 'local') {
      return;
    }
    const change = changes[SETTINGS_STORAGE_KEY];
    if (!change) {
      return;
    }
    listener(migrateSettings(change.newValue));
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

export { DEFAULT_SETTINGS, migrateSettings, parseSettings } from './defaults';
