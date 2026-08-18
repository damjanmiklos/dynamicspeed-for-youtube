import { listenToMainEvents } from '../lib/bridge/isolated';
import { loadSettings, patchSettings, watchSettings } from '../lib/settings/storage';
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
      const settings = await loadSettings();
      controller.setSettings(settings);
      const videoId = parseVideoId(location.href);
      if (!videoId) {
        controller.setTokens([], 'no-video');
        return;
      }
      controller.setTranscriptStatus('loading');
      try {
        const result = await acquireTranscript(settings);
        snapshot = result.snapshot;
        controller.setTokens(result.tokens, 'ready');
      } catch (error) {
        controller.setTokens([], 'missing');
        console.debug(
          '[DynamicSpeed] captions unavailable',
          error instanceof Error ? error.message : error,
        );
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
      controller.setSettings(settings);
      controller.beginSlew();
    });

    const unlisten = listenToMainEvents((name) => {
      if (name === 'VIDEO_ID_CHANGED') {
        snapshot = null;
        void loadForCurrentVideo();
      }
    });

    const onMessage = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => {
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
              targetWpm: Math.min(400, settings.targetWpm + 10),
            });
          } else if (message.command === 'wpm-down') {
            await patchSettings({
              targetWpm: Math.max(80, settings.targetWpm - 10),
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
