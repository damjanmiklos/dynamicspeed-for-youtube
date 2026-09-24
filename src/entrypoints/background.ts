import { loadSettings, migrateSettings, saveSettings } from '../lib/settings/storage';
import { SETTINGS_STORAGE_KEY } from '../lib/settings/schema';
import { applyCacheMutation } from '../lib/youtube/cache';
import { YOUTUBE_MATCHES } from '../lib/youtube/video-id';
import {
  RUNTIME_SOURCE,
  isRuntimeMessage,
  type RuntimeMessage,
} from '../lib/messaging/protocol';

/** Background-side prune; it is the cache's single writer. */
function pruneTranscriptCache(): Promise<void> {
  return applyCacheMutation({ kind: 'prune' }).catch(() => undefined);
}

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
    await pruneTranscriptCache();
  })();

  browser.runtime.onInstalled.addListener(() => {
    void loadSettings().then(saveSettings);
  });

  browser.runtime.onStartup.addListener(() => {
    void pruneTranscriptCache();
  });

  // Every tab and extension page routes caption-cache writes here so they are
  // serialized instead of racing on the single storage key.
  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: { id?: string },
      sendResponse: (response: unknown) => void,
    ) => {
      if (sender.id !== browser.runtime.id) {
        return;
      }
      if (!isRuntimeMessage(message) || message.type !== 'CACHE_MUTATION') {
        return;
      }
      applyCacheMutation(message.mutation).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true;
    },
  );

  browser.storage.onChanged.addListener((changes, area) => {
    if (area && area !== 'local') {
      return;
    }
    if (!changes[SETTINGS_STORAGE_KEY]) {
      return;
    }
    void notifyYouTubeTabs();
    void pruneTranscriptCache();
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
