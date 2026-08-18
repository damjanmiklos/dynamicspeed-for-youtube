import { requestFromMain } from '../bridge/isolated';
import type { PlayerSnapshot } from '../bridge/protocol';
import { parseJson3Safe } from '../transcript/parse-json3';
import { bindTimedTextToVideo, selectCaptionTrack } from '../transcript/select-track';
import type { CaptionTrack, WordToken } from '../transcript/types';
import { recallTokens, rememberTokens } from './cache';
import { parseVideoId } from './video-id';
import type { DynamicSpeedSettings } from '../settings/schema';
import { MAX_CAPTION_TRACKS, MAX_TOKENS } from '../transcript/limits';

export type AcquireResult = {
  tokens: WordToken[];
  source: string;
  track: CaptionTrack | null;
  snapshot: PlayerSnapshot;
};

function asTracks(snapshot: PlayerSnapshot, videoId: string): CaptionTrack[] {
  const allowed: CaptionTrack[] = [];
  for (const track of snapshot.tracks.slice(0, MAX_CAPTION_TRACKS)) {
    const baseUrl = bindTimedTextToVideo(track.baseUrl, videoId);
    if (!baseUrl) {
      continue;
    }
    allowed.push({
      baseUrl,
      languageCode: track.languageCode,
      languageName: track.languageName,
      kind: track.kind,
      vssId: track.vssId,
    });
  }
  return allowed;
}

function tokensFromUnknown(
  data: unknown,
  settings: DynamicSpeedSettings,
  language?: string | null,
): WordToken[] {
  return parseJson3Safe(data, {
    syllableWeighting: settings.syllableWeighting,
    language,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readSnapshot(
  pageVideoId: string,
  signal?: AbortSignal,
): Promise<PlayerSnapshot> {
  const empty: PlayerSnapshot = {
    videoId: pageVideoId,
    title: null,
    channelId: null,
    channelName: null,
    duration: null,
    isLive: false,
    isShorts: false,
    isMusic: false,
    tracks: [],
  };
  const deadline = Date.now() + 6000;
  let snapshot = empty;
  while (Date.now() <= deadline) {
    throwIfAborted(signal);
    const rawSnapshot = await requestFromMain<unknown>(
      'GET_PLAYER_SNAPSHOT',
      pageVideoId,
      null,
      3000,
    ).catch(() => null);
    throwIfAborted(signal);
    snapshot = isPlayerSnapshot(rawSnapshot) ? rawSnapshot : empty;
    if (snapshot.videoId === pageVideoId && snapshot.tracks.length > 0) {
      return snapshot;
    }
    await sleep(250);
  }
  return snapshot;
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as PlayerSnapshot;
  if (!Array.isArray(snapshot.tracks) || snapshot.tracks.length > MAX_CAPTION_TRACKS) {
    return false;
  }
  return (
    (snapshot.videoId === null || typeof snapshot.videoId === 'string') &&
    snapshot.tracks.every(
      (track) =>
        track &&
        typeof track === 'object' &&
        typeof track.baseUrl === 'string' &&
        typeof track.languageCode === 'string',
    )
  );
}

export async function acquireTranscript(
  settings: DynamicSpeedSettings,
  options?: { signal?: AbortSignal },
): Promise<AcquireResult> {
  const signal = options?.signal;
  throwIfAborted(signal);
  if (!settings.enabled) {
    throw new Error('DynamicSpeed is off');
  }
  const pageVideoId = parseVideoId(location.href);
  if (!pageVideoId) {
    throw new Error('No video id');
  }
  const snapshot = await readSnapshot(pageVideoId, signal);
  throwIfAborted(signal);
  const trustedId = pageVideoId;

  const track = selectCaptionTrack(asTracks(snapshot, trustedId), {
    language: settings.captionLanguage,
    preferManual: settings.preferManualCaptions,
  });

  if (track) {
    const cached = await recallTokens({
      videoId: trustedId,
      language: track.languageCode,
      trackKind: track.kind ?? 'asr',
    });
    throwIfAborted(signal);
    if (cached && cached.length > 0 && cached.length <= MAX_TOKENS) {
      return { tokens: cached, source: 'cache', track, snapshot };
    }
  }

  throwIfAborted(signal);
  const captured = await requestFromMain<unknown>(
    'ACQUIRE_FALLBACK_TRANSCRIPT',
    trustedId,
    {
      language: settings.captionLanguage,
      preferManual: settings.preferManualCaptions,
      nudgeCaptions: settings.temporarilyEnableCaptions,
    },
    settings.temporarilyEnableCaptions ? 22_000 : 15_000,
  ).catch(() => null);
  throwIfAborted(signal);
  const capturedTokens = tokensFromUnknown(
    captured,
    settings,
    track?.languageCode ?? settings.captionLanguage,
  );
  if (capturedTokens.length > 0) {
    void rememberTokens(
      {
        videoId: trustedId,
        language: track?.languageCode ?? settings.captionLanguage,
        trackKind: track?.kind ?? 'asr',
      },
      capturedTokens,
    );
    return {
      tokens: capturedTokens,
      source: 'capture',
      track,
      snapshot,
    };
  }

  throw new Error('No captions available for this video');
}
