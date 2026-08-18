import { listenToMainEvents } from '../lib/bridge/isolated';
import { loadSettings, patchSettings, watchSettings } from '../lib/settings/storage';
import { captionSourceChanged } from '../lib/settings/diff';
import { LIMITS } from '../lib/settings/limits';
import type { DynamicSpeedSettings } from '../lib/settings/schema';
import {
  EMPTY_PAGE_STATE,
  RUNTIME_SOURCE,
  isRuntimeMessage,
  type RuntimeMessage,
} from '../lib/messaging/protocol';
import { acquireTranscript } from '../lib/youtube/acquire';
import { createPlaybackController } from '../lib/youtube/controller';
import { parseVideoId, YOUTUBE_MATCHES } from '../lib/youtube/video-id';
import type { PlayerSnapshot } from '../lib/bridge/protocol';

export default defineContentScript({
  matches: [...YOUTUBE_MATCHES],
  runAt: 'document_idle',
  main(ctx) {
    let snapshot: PlayerSnapshot | null = null;
    let loadGeneration = 0;
    let appliedSettings: DynamicSpeedSettings | null = null;
    const controller = createPlaybackController({
      getChannel: () => ({
        channelId: snapshot?.channelId ?? null,
        channelName: snapshot?.channelName ?? null,
        title: snapshot?.title ?? document.title,
        isLive: Boolean(snapshot?.isLive),
        isMusic: Boolean(snapshot?.isMusic),
      }),
    });

    const loadForCurrentVideo = async () => {
      const gen = ++loadGeneration;
      const settings = await loadSettings();
      if (gen !== loadGeneration) {
        return;
      }
      appliedSettings = settings;
      controller.setSettings(settings);
      const videoId = parseVideoId(location.href);
      if (!videoId) {
        controller.setTokens([], 'no-video');
        return;
      }
      controller.setTranscriptStatus('loading');
      const deadline = Date.now() + 20_000;
      let lastError: unknown;
      while (Date.now() < deadline && gen === loadGeneration) {
        try {
          const result = await acquireTranscript(settings);
          if (gen !== loadGeneration) {
            return;
          }
          if (result.tokens.length > 0) {
            snapshot = result.snapshot;
            controller.setTokens(result.tokens, 'ready');
            return;
          }
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
      if (gen !== loadGeneration) {
        return;
      }
      controller.setTokens([], 'missing');
      console.debug(
        '[DynamicSpeed] captions unavailable',
        lastError instanceof Error ? lastError.message : lastError,
      );
    };

    const applySettings = (settings: DynamicSpeedSettings) => {
      const previous = appliedSettings;
      appliedSettings = settings;
      controller.setSettings(settings);
      if (previous && captionSourceChanged(previous, settings)) {
        void loadForCurrentVideo();
      }
    };

    controller.setChipClickHandler(() => {
      void loadSettings().then((settings) =>
        patchSettings({ enabled: !settings.enabled }),
      );
    });

    controller.start();
    void loadForCurrentVideo();

    const unwatch = watchSettings((settings) => {
      applySettings(settings);
    });

    const unlisten = listenToMainEvents((name) => {
      if (name === 'VIDEO_ID_CHANGED') {
        if (!parseVideoId(location.href)) {
          return;
        }
        snapshot = null;
        void loadForCurrentVideo();
        return;
      }
      if (name === 'TIMEDTEXT_CAPTURED' || name === 'RAW_TRACKS_RESOLVED') {
        const status = controller.getTranscriptStatus();
        if (status === 'missing' || status === 'idle') {
          void loadForCurrentVideo();
        }
      }
    });

    const onMessage = (
      message: unknown,
      sender: { id?: string },
      sendResponse: (response: unknown) => void,
    ) => {
      if (sender.id && sender.id !== browser.runtime.id) {
        return;
      }
      if (!isRuntimeMessage(message)) {
        return;
      }
      if (message.type === 'GET_PAGE_STATE') {
        sendResponse({
          source: RUNTIME_SOURCE,
          type: 'PAGE_STATE',
          state: controller.getPageState(),
        } satisfies RuntimeMessage);
        return true;
      }
      if (message.type === 'SETTINGS_CHANGED') {
        void loadSettings().then(applySettings);
        sendResponse({
          source: RUNTIME_SOURCE,
          type: 'PAGE_STATE',
          state: controller.getPageState(),
        } satisfies RuntimeMessage);
        return true;
      }
      if (message.type === 'TOGGLE_CHANNEL') {
        void (async () => {
          const state = controller.getPageState();
          if (!state.channelId) {
            sendResponse(state);
            return;
          }
          const settings = await loadSettings();
          const existing = settings.channelOverrides[state.channelId] ?? {};
          const next = {
            ...settings.channelOverrides,
            [state.channelId]: {
              ...existing,
              disabled: !existing.disabled,
              name: state.channelName ?? existing.name,
            },
          };
          await patchSettings({ channelOverrides: next });
          sendResponse(controller.getPageState());
        })();
        return true;
      }
      if (message.type === 'TOGGLE_VIDEO') {
        void (async () => {
          const state = controller.getPageState();
          if (!state.videoId) {
            sendResponse(state);
            return;
          }
          const settings = await loadSettings();
          const disabled = settings.disabledVideoIds.includes(state.videoId)
            ? settings.disabledVideoIds.filter((id) => id !== state.videoId)
            : [...settings.disabledVideoIds, state.videoId];
          await patchSettings({ disabledVideoIds: disabled });
          sendResponse(controller.getPageState());
        })();
        return true;
      }
      if (message.type === 'COMMAND') {
        void (async () => {
          const settings = await loadSettings();
          if (message.command === 'toggle-enabled') {
            await patchSettings({ enabled: !settings.enabled });
          } else if (message.command === 'wpm-up') {
            await patchSettings({
              targetWpm: Math.min(LIMITS.targetWpm.max, settings.targetWpm + 10),
            });
          } else if (message.command === 'wpm-down') {
            await patchSettings({
              targetWpm: Math.max(LIMITS.targetWpm.min, settings.targetWpm - 10),
            });
          } else if (message.command === 'force-1x') {
            controller.forceRate(1);
          } else if (message.command === 'toggle-broll') {
            await patchSettings({
              bRollAcceleration: !settings.bRollAcceleration,
            });
          }
          sendResponse(controller.getPageState());
        })();
        return true;
      }
      sendResponse({
        source: RUNTIME_SOURCE,
        type: 'PAGE_STATE',
        state: EMPTY_PAGE_STATE,
      });
      return true;
    };

    browser.runtime.onMessage.addListener(onMessage);

    ctx.onInvalidated(() => {
      unwatch();
      unlisten();
      browser.runtime.onMessage.removeListener(onMessage);
      controller.destroy();
    });
  },
});
