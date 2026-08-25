import { listenToMainEvents, requestFromMain } from '../lib/bridge/isolated';
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
import { buildTranscriptExport } from '../lib/transcript/export';
import { readVisibleWatchTitle } from '../lib/youtube/watch-meta';
import type { PlayerSnapshot } from '../lib/bridge/protocol';

export default defineContentScript({
  matches: [...YOUTUBE_MATCHES],
  runAt: 'document_idle',
  main(ctx) {
    let snapshot: PlayerSnapshot | null = null;
    let loadGeneration = 0;
    let loadAbort: AbortController | null = null;
    let appliedSettings: DynamicSpeedSettings | null = null;
    const controller = createPlaybackController({
      getChannel: () => {
        const videoId = parseVideoId(location.href);
        const snapshotMatches = snapshot?.videoId === videoId;
        return {
          channelId: snapshotMatches ? snapshot?.channelId ?? null : null,
          channelName: snapshotMatches ? snapshot?.channelName ?? null : null,
          title: readVisibleWatchTitle() ?? (snapshotMatches ? snapshot?.title ?? null : null),
          isLive: snapshotMatches ? Boolean(snapshot?.isLive) : false,
          isMusic: snapshotMatches ? Boolean(snapshot?.isMusic) : false,
        };
      },
    });

    const setMainCaptureEnabled = async (enabled: boolean) => {
      const videoId = parseVideoId(location.href) ?? '';
      await requestFromMain('SET_CAPTURE_ENABLED', videoId, { enabled }, 2000).catch(
        () => undefined,
      );
    };

    const stopCaptionWork = () => {
      loadGeneration += 1;
      loadAbort?.abort();
      loadAbort = null;
      void setMainCaptureEnabled(false);
      controller.setTokens([], 'idle');
    };

    const loadForCurrentVideo = async () => {
      loadAbort?.abort();
      controller.setTokens([], 'loading');
      const abort = new AbortController();
      loadAbort = abort;
      const gen = ++loadGeneration;
      const settings = await loadSettings();
      if (gen !== loadGeneration) {
        return;
      }
      appliedSettings = settings;
      if (!settings.enabled) {
        void setMainCaptureEnabled(false);
        controller.setTokens([], 'idle');
        controller.setSettings(settings);
        return;
      }
      await setMainCaptureEnabled(true);
      if (gen !== loadGeneration) {
        return;
      }
      controller.setSettings(settings);
      const videoId = parseVideoId(location.href);
      if (!videoId) {
        controller.setTokens([], 'no-video');
        return;
      }
      const deadline = Date.now() + (settings.temporarilyEnableCaptions ? 50_000 : 28_000);
      let lastError: unknown;
      while (Date.now() < deadline && gen === loadGeneration && !abort.signal.aborted) {
        try {
          const result = await acquireTranscript(settings, { signal: abort.signal });
          if (gen !== loadGeneration) {
            return;
          }
          if (result.tokens.length > 0) {
            snapshot = result.snapshot;
            controller.setTokens(result.tokens, 'ready');
            return;
          }
        } catch (error) {
          if (abort.signal.aborted || gen !== loadGeneration) {
            return;
          }
          lastError = error;
        }
        if (gen !== loadGeneration || abort.signal.aborted) {
          return;
        }
        await new Promise((resolve) =>
          window.setTimeout(resolve, settings.temporarilyEnableCaptions ? 900 : 400),
        );
      }
      if (gen !== loadGeneration || abort.signal.aborted) {
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
      const turningOn = Boolean(previous && !previous.enabled && settings.enabled);
      appliedSettings = settings;
      if (!settings.enabled) {
        stopCaptionWork();
        controller.setSettings(settings);
        return;
      }
      controller.setSettings(settings);
      if (turningOn || (previous && captionSourceChanged(previous, settings))) {
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
        snapshot = null;
        controller.setTokens([], 'loading');
        if (appliedSettings && !appliedSettings.enabled) {
          return;
        }
        if (!parseVideoId(location.href)) {
          return;
        }
        void loadForCurrentVideo();
        return;
      }
      if (appliedSettings && !appliedSettings.enabled) {
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
      if (message.type === 'GET_TRANSCRIPT') {
        const state = controller.getPageState();
        sendResponse({
          source: RUNTIME_SOURCE,
          type: 'TRANSCRIPT',
          transcript: buildTranscriptExport({
            videoId: state.videoId,
            title: state.title,
            transcriptStatus: state.transcriptStatus,
            tokens: controller.getTokens(),
          }),
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
      stopCaptionWork();
      unwatch();
      unlisten();
      browser.runtime.onMessage.removeListener(onMessage);
      controller.destroy();
    });
  },
});
