import {
  buildSpeedCurve,
  curveBuildInputFromSettings,
  introRate,
  isSeekJump,
  rateAt,
  slewLimitForStep,
  slewStep,
  wpmAt,
  type SpeedCurve,
} from '../pacing';
import { clamp } from '../pacing/feel';
import { FALLBACK_SLEW_SEC, INTRO_SLEW_SEC, SEEK_SNAP_SEC } from '../settings/limits';
import type { DynamicSpeedSettings } from '../settings/schema';
import { speedCalculationChanged } from '../settings/diff';
import { resolveForPage, type ResolvedPlaybackSettings } from '../settings/resolve';
import { wpmAdjustmentsActive } from '../pacing/wpm-calibration';
import type { WordToken } from '../transcript/types';
import { isAdShowing, findMainVideo } from './ads';
import {
  chipIsCorrectlyPlaced,
  formatRate,
  observePlayerChrome,
  removePlayerChip,
  upsertPlayerChip,
} from './chip';
import { applyPreservesPitch, isExternalRateChange, setPlaybackRate } from './playback';
import { createSpeedConflictTracker, stolenPlaybackRate } from './speed-conflict';
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
  let overrideUntil = 0;
  let forceHold: number | null = null;
  let lastVideoTime = 0;
  let lastFrame = performance.now();
  let weSetRateUntil = 0;
  let lastOwnedRate: number | null = null;
  const speedConflict = createSpeedConflictTracker();
  let video: HTMLVideoElement | null = null;
  let destroyed = false;
  let transcriptStatus = 'idle';
  let introActive = false;
  let introStartedAt = 0;
  let introFrom = 1;
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
    if (video) {
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('seeking', onSeek);
      video.removeEventListener('seeked', onSeek);
    }
    video = next;
    introActive = false;
    lastOwnedRate = null;
    if (video) {
      applyPreservesPitch(video);
      applied = video.playbackRate || 1;
      lastVideoTime = video.currentTime;
      video.addEventListener('ratechange', onRateChange);
      video.addEventListener('seeking', onSeek);
      video.addEventListener('seeked', onSeek);
    }
  }

  function onRateChange(): void {
    if (!video) {
      return;
    }
    if (
      !isExternalRateChange(video.playbackRate, applied, performance.now(), weSetRateUntil)
    ) {
      return;
    }
    const current = resolved();
    if (!current) {
      return;
    }
    overrideUntil = performance.now() + current.manualOverrideTimeoutSec * 1000;
  }

  function automationOwnsRate(current: ResolvedPlaybackSettings): boolean {
    if (!current.automationAllowed || forceHold != null) {
      return false;
    }
    if (performance.now() < overrideUntil) {
      return false;
    }
    if (current.ignoreAds && isAdShowing()) {
      return false;
    }
    return true;
  }

  /** Timeline clicks, skip buttons, and arrow-key nudges all fire seeking/seeked. */
  function onSeek(): void {
    snapRateToPlayhead();
  }

  function snapRateToPlayhead(): void {
    if (!video || !curve) {
      lastVideoTime = video?.currentTime ?? lastVideoTime;
      return;
    }
    const current = resolved();
    if (!current || !automationOwnsRate(current)) {
      lastVideoTime = video.currentTime;
      return;
    }
    applied = rateAt(curve, video.currentTime);
    cancelIntro();
    lastVideoTime = video.currentTime;
    ownRate(applied);
    updateChip(applied, current);
  }

  function cancelIntro(): void {
    introActive = false;
  }

  function fallbackRate(current: ResolvedPlaybackSettings): number {
    return clamp(current.fallbackSpeed, current.minSpeed, current.maxSpeed);
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
      dropRateOwnership();
      updateChip(null, current);
      return;
    }

    if (current.ignoreAds && isAdShowing()) {
      dropRateOwnership();
      updateChip(video.playbackRate, current, 'ad');
      return;
    }

    if (!current.automationAllowed || forceHold != null) {
      cancelIntro();
      dropRateOwnership();
      if (current.restore1xWhenDisabled && forceHold == null) {
        commitRate(1);
      } else if (forceHold != null) {
        commitRate(forceHold);
      }
      updateChip(video.playbackRate, current);
      return;
    }

    if (now < overrideUntil) {
      cancelIntro();
      dropRateOwnership();
      updateChip(video.playbackRate, current, 'manual');
      return;
    }

    if (!curve) {
      cancelIntro();
      const desired = fallbackRate(current);
      const limit = Math.max(
        current.slewRateLimit,
        Math.abs(desired - applied) / FALLBACK_SLEW_SEC,
      );
      applied = slewStep(applied, desired, dt, limit);
      ownRate(applied);
      updateChip(applied, current);
      return;
    }

    const desired = rateAt(curve, video.currentTime);
    const expectedDelta =
      video.paused || video.ended ? 0 : video.playbackRate * dt;
    const skipped = isSeekJump(
      lastVideoTime,
      video.currentTime,
      SEEK_SNAP_SEC,
      expectedDelta,
    );
    lastVideoTime = video.currentTime;

    if (skipped) {
      applied = desired;
      cancelIntro();
    } else if (introActive) {
      const elapsed = (now - introStartedAt) / 1000;
      applied = introRate(introFrom, desired, elapsed, INTRO_SLEW_SEC);
      if (elapsed >= INTRO_SLEW_SEC) {
        cancelIntro();
        applied = desired;
      }
    } else {
      applied = slewStep(
        applied,
        desired,
        dt,
        slewLimitForStep(applied, desired, current.slewRateLimit),
      );
    }

    ownRate(applied);
    updateChip(applied, current);
  }

  function dropRateOwnership(): void {
    lastOwnedRate = null;
  }

  function ownRate(rate: number): void {
    if (!video) {
      return;
    }
    const now = performance.now();
    const before = video.playbackRate;
    commitRate(rate);
    const stolen = stolenPlaybackRate(lastOwnedRate, before, rate, video.playbackRate);
    lastOwnedRate = rate;
    if (stolen != null) {
      speedConflict.noteMismatch(now, stolen);
    } else {
      speedConflict.noteMatch(now);
    }
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
    const wpmUnit = current && wpmAdjustmentsActive(current) ? 'adjusted WPM' : 'WPM';
    const conflict = speedConflict.isActive();
    const inactive =
      !current.automationAllowed ||
      Boolean(mode) ||
      transcriptStatus !== 'ready';
    const titleParts = [
      'DynamicSpeed for YouTube',
      `Target ${current.targetWpm} WPM`,
      spoken ? `Speech ~${Math.round(spoken)} ${wpmUnit}` : `Captions: ${transcriptStatus}`,
      current.blockReason ? `Paused: ${current.blockReason}` : '',
      mode ? `Mode: ${mode}` : '',
      conflict
        ? 'Another extension is forcing a fixed speed. Disable that speed control.'
        : '',
    ].filter(Boolean);
    upsertPlayerChip({
      label: formatRate(rate, current.chipDecimalPlaces),
      title: current.showWpmInTooltip ? titleParts.join('\n') : 'DynamicSpeed',
      inactive,
      conflict,
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
      // rAF keeps running while paused. requestVideoFrameCallback does not, and
      // that used to freeze speed updates until the content script restarted.
      handle = requestAnimationFrame(step);
    };
    step();
    stopLoop = () => {
      cancelAnimationFrame(handle);
    };
  }

  return {
    setSettings(next: DynamicSpeedSettings) {
      const previous = settings;
      if (previous && next.enabled !== previous.enabled) {
        forceHold = null;
      }
      const recalculate =
        !previous || speedCalculationChanged(previous, next);
      settings = next;
      rebuildCurve(video?.duration);
      if (recalculate) {
        overrideUntil = 0;
      }
    },
    setTokens(next: WordToken[], status: string) {
      const hadCurve = Boolean(curve);
      tokens = next;
      transcriptStatus = status;
      rebuildCurve(video?.duration);
      if (!hadCurve && curve) {
        introFrom = applied;
        introStartedAt = performance.now();
        introActive = true;
      } else if (!curve) {
        cancelIntro();
      }
    },
    setTranscriptStatus(status: string) {
      transcriptStatus = status;
    },
    setChipClickHandler(handler: () => void) {
      onChipClick = handler;
    },
    forceRate(rate: number | null) {
      forceHold = rate;
      if (rate != null) {
        commitRate(rate);
      }
    },
    getTranscriptStatus() {
      return transcriptStatus;
    },
    getTokens() {
      return tokens.slice();
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
        speedConflict: speedConflict.isActive(),
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
        video.removeEventListener('seeking', onSeek);
        video.removeEventListener('seeked', onSeek);
      }
    },
  };
}
