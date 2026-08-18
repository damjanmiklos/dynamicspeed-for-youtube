import {
  buildSpeedCurve,
  curveBuildInputFromSettings,
  rateAt,
  RATE_JUMP_EPSILON,
  slewStep,
  wpmAt,
  type SpeedCurve,
} from '../pacing';
import type { DynamicSpeedSettings } from '../settings/schema';
import { resolveForPage, type ResolvedPlaybackSettings } from '../settings/resolve';
import type { WordToken } from '../transcript/types';
import { isAdShowing, findMainVideo } from './ads';
import {
  chipIsCorrectlyPlaced,
  formatRate,
  observePlayerChrome,
  removePlayerChip,
  upsertPlayerChip,
} from './chip';
import { applyPreservesPitch, setPlaybackRate } from './playback';
import { isShortsPath, parseVideoId } from './video-id';
import type { PageState } from '../messaging/protocol';

export type ControllerHooks = {
  getChannel: () => { channelId: string | null; channelName: string | null; title: string | null; isLive: boolean; isMusic: boolean };
};

export function createPlaybackController(hooks: ControllerHooks) {
  let settings: DynamicSpeedSettings | null = null;
  let tokens: WordToken[] = [];
  let curve: SpeedCurve | null = null;
  let applied = 1;
  let slewing = false;
  let overrideUntil = 0;
  let forceHold: number | null = null;
  let lastVideoTime = 0;
  let lastFrame = performance.now();
  let weSetRateUntil = 0;
  let video: HTMLVideoElement | null = null;
  let destroyed = false;
  let transcriptStatus = 'idle';
  let stopChrome: (() => void) | null = null;
  let stopLoop: (() => void) | null = null;
  let onChipClick: (() => void) | null = null;

  function pageIdentity(resolvedVideoId: string | null) {
    const meta = hooks.getChannel();
    return {
      videoId: resolvedVideoId,
      channelId: meta.channelId,
      isShorts: isShortsPath(location.href),
      isMusic: meta.isMusic,
      isLive: meta.isLive,
    };
  }

  function resolved(): ResolvedPlaybackSettings | null {
    if (!settings) {
      return null;
    }
    return resolveForPage(settings, pageIdentity(parseVideoId(location.href)));
  }

  function rebuildCurve(durationHint?: number): void {
    const current = resolved();
    if (!current || tokens.length === 0) {
      curve = null;
      return;
    }
    curve = buildSpeedCurve(
      tokens,
      curveBuildInputFromSettings(current, {
        durationHint,
        causal: hooks.getChannel().isLive,
      }),
    );
  }

  function attachVideo(next: HTMLVideoElement | null): void {
    if (video === next) {
      if (next) {
        applyPreservesPitch(next);
      }
      return;
    }
    video = next;
    if (video) {
      applyPreservesPitch(video);
      applied = video.playbackRate || 1;
      lastVideoTime = video.currentTime;
      video.addEventListener('ratechange', onRateChange);
      video.addEventListener('seeked', onSeeked);
    }
  }

  function onRateChange(): void {
    if (!video) {
      return;
    }
    if (performance.now() < weSetRateUntil) {
      return;
    }
    const current = resolved();
    if (!current) {
      return;
    }
    overrideUntil = performance.now() + current.manualOverrideTimeoutSec * 1000;
    slewing = false;
  }

  function onSeeked(): void {
    if (!video || !curve) {
      return;
    }
    const current = resolved();
    if (!current) {
      return;
    }
    const desired = rateAt(curve, video.currentTime);
    if (Math.abs(desired - applied) > RATE_JUMP_EPSILON) {
      slewing = true;
    } else {
      applied = desired;
    }
  }

  function tick(): void {
    if (destroyed) {
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    const current = resolved();
    const nextVideo = findMainVideo();
    attachVideo(nextVideo);

    if (!current || !video) {
      updateChip(null, current);
      return;
    }

    if (current.ignoreAds && isAdShowing()) {
      updateChip(video.playbackRate, current, 'ad');
      return;
    }

    if (!current.automationAllowed || forceHold != null) {
      if (current.restore1xWhenDisabled && forceHold == null) {
        commitRate(1);
      } else if (forceHold != null) {
        commitRate(forceHold);
      }
      updateChip(video.playbackRate, current);
      return;
    }

    if (now < overrideUntil) {
      updateChip(video.playbackRate, current, 'manual');
      return;
    }

    if (!curve) {
      updateChip(video.playbackRate, current);
      return;
    }

    const desired = rateAt(curve, video.currentTime);
    const jumped =
      Math.abs(video.currentTime - lastVideoTime) > 1 &&
      Math.abs(desired - applied) > RATE_JUMP_EPSILON;
    lastVideoTime = video.currentTime;

    if (jumped) {
      slewing = true;
    }

    if (slewing) {
      applied = slewStep(applied, desired, dt, current.slewRateLimit);
      if (Math.abs(applied - desired) < 0.01) {
        applied = desired;
        slewing = false;
      }
    } else {
      applied = desired;
    }

    commitRate(applied);
    updateChip(applied, current);
  }

  function commitRate(rate: number): void {
    if (!video) {
      return;
    }
    weSetRateUntil = performance.now() + 80;
    setPlaybackRate(video, rate);
  }

  function updateChip(
    rate: number | null,
    current: ResolvedPlaybackSettings | null,
    mode?: string,
  ): void {
    if (!current?.showPlayerChip) {
      removePlayerChip();
      return;
    }
    const spoken = curve && video ? wpmAt(curve, video.currentTime) : null;
    const inactive =
      !current.automationAllowed ||
      Boolean(mode) ||
      transcriptStatus !== 'ready';
    const titleParts = [
      'DynamicSpeed for YouTube',
      `Target ${current.targetWpm} WPM`,
      spoken ? `Speech ~${Math.round(spoken)} WPM` : `Captions: ${transcriptStatus}`,
      current.blockReason ? `Paused: ${current.blockReason}` : '',
      mode ? `Mode: ${mode}` : '',
    ].filter(Boolean);
    upsertPlayerChip({
      label: formatRate(rate, current.chipDecimalPlaces),
      title: current.showWpmInTooltip ? titleParts.join('\n') : 'DynamicSpeed',
      inactive,
      onClick: () => onChipClick?.(),
    });
  }

  function startLoop(): void {
    stopLoop?.();
    let handle = 0;
    const step = () => {
      tick();
      if (destroyed) {
        return;
      }
      if (video && typeof video.requestVideoFrameCallback === 'function') {
        handle = video.requestVideoFrameCallback(step);
      } else {
        handle = requestAnimationFrame(step);
      }
    };
    step();
    stopLoop = () => {
      if (video && typeof video.cancelVideoFrameCallback === 'function') {
        try {
          video.cancelVideoFrameCallback(handle);
        } catch {
          cancelAnimationFrame(handle);
        }
      } else {
        cancelAnimationFrame(handle);
      }
    };
  }

  return {
    setSettings(next: DynamicSpeedSettings) {
      if (settings && next.enabled !== settings.enabled) {
        forceHold = null;
      }
      settings = next;
      rebuildCurve(video?.duration);
      if (curve) {
        slewing = true;
      }
    },
    setTokens(next: WordToken[], status: string) {
      tokens = next;
      transcriptStatus = status;
      rebuildCurve(video?.duration);
    },
    setTranscriptStatus(status: string) {
      transcriptStatus = status;
    },
    setChipClickHandler(handler: () => void) {
      onChipClick = handler;
    },
    beginSlew() {
      slewing = true;
    },
    forceRate(rate: number | null) {
      forceHold = rate;
      if (rate != null) {
        commitRate(rate);
      }
    },
    getPageState(): PageState {
      const current = resolved();
      const meta = hooks.getChannel();
      return {
        isYouTube: true,
        videoId: parseVideoId(location.href),
        channelId: meta.channelId,
        channelName: meta.channelName,
        title: meta.title,
        playbackRate: video?.playbackRate ?? null,
        spokenWpm: curve && video ? wpmAt(curve, video.currentTime) : null,
        hasTranscript: tokens.length > 0,
        transcriptStatus,
        automationActive: Boolean(current?.automationAllowed && curve && performance.now() >= overrideUntil && forceHold == null),
        blockReason: current?.blockReason ?? null,
        isShorts: isShortsPath(location.href),
        isLive: meta.isLive,
        isMusic: meta.isMusic,
      };
    },
    start() {
      startLoop();
      stopChrome = observePlayerChrome(() => {
        if (!chipIsCorrectlyPlaced()) {
          const current = resolved();
          updateChip(video?.playbackRate ?? null, current);
        }
      });
    },
    destroy() {
      destroyed = true;
      stopLoop?.();
      stopChrome?.();
      removePlayerChip();
      if (video) {
        video.removeEventListener('ratechange', onRateChange);
        video.removeEventListener('seeked', onSeeked);
      }
    },
  };
}
