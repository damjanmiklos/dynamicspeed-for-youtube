import { loadSettings, migrateSettings, saveSettings } from '../lib/settings/storage';
import { SETTINGS_STORAGE_KEY } from '../lib/settings/schema';
import { pruneExpiredTranscriptCache } from '../lib/youtube/cache';
import { YOUTUBE_MATCHES } from '../lib/youtube/video-id';
import { RUNTIME_SOURCE, type RuntimeMessage } from '../lib/messaging/protocol';

async function notifyYouTubeTabs(): Promise<void> {
  const tabs = await browser.tabs.query({
    url: [...YOUTUBE_MATCHES],
  });
  const message: RuntimeMessage = {
    source: RUNTIME_SOURCE,
    type: 'SETTINGS_CHANGED',
  };
  await Promise.all(
    tabs.map((tab) =>
      tab.id != null
        ? browser.tabs.sendMessage(tab.id, message).catch(() => undefined)
        : Promise.resolve(),
    ),
  );
}

export default defineBackground(() => {
  void (async () => {
    const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    const migrated = migrateSettings(stored[SETTINGS_STORAGE_KEY]);
    await saveSettings(migrated);
    await pruneExpiredTranscriptCache();
  })();

  browser.runtime.onInstalled.addListener(() => {
    void loadSettings().then(saveSettings);
  });

  browser.runtime.onStartup.addListener(() => {
    void pruneExpiredTranscriptCache();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area && area !== 'local') {
      return;
    }
    if (!changes[SETTINGS_STORAGE_KEY]) {
      return;
    }
    void notifyYouTubeTabs();
    void pruneExpiredTranscriptCache();
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
