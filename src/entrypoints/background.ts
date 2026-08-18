import { loadSettings, migrateSettings, saveSettings } from '../lib/settings/storage';
import { SETTINGS_STORAGE_KEY } from '../lib/settings/schema';
import { RUNTIME_SOURCE, type RuntimeMessage } from '../lib/messaging/protocol';

export default defineBackground(() => {
  void (async () => {
    const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    const migrated = migrateSettings(stored[SETTINGS_STORAGE_KEY]);
    await saveSettings(migrated);
  })();

  browser.runtime.onInstalled.addListener(() => {
    void loadSettings().then(saveSettings);
  });

  browser.commands.onCommand.addListener(async (command) => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId == null) {
      return;
    }
    const message: RuntimeMessage = {
      source: RUNTIME_SOURCE,
      type: 'COMMAND',
      command,
    };
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      if (command === 'toggle-enabled') {
        const settings = await loadSettings();
        await saveSettings({ ...settings, enabled: !settings.enabled });
      }
    }
  });
});
