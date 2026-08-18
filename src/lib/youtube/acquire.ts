import { requestFromMain } from '../bridge/isolated';
import type { PlayerSnapshot } from '../bridge/protocol';
import { parseJson3Safe } from '../transcript/parse-json3';
import {
  selectCaptionTrack,
  timedTextBelongsToVideo,
  toSafeTimedTextUrl,
} from '../transcript/select-track';
import type { CaptionTrack, WordToken } from '../transcript/types';
import { recallTokens, rememberTokens } from './cache';
import { parseVideoId } from './video-id';
import type { DynamicSpeedSettings } from '../settings/schema';

export type AcquireResult = {
  tokens: WordToken[];
  source: string;
  track: CaptionTrack | null;
  snapshot: PlayerSnapshot;
};

function asTracks(snapshot: PlayerSnapshot, videoId: string): CaptionTrack[] {
  const allowed: CaptionTrack[] = [];
  for (const track of snapshot.tracks) {
    const baseUrl = toSafeTimedTextUrl(track.baseUrl);
    if (!baseUrl || !timedTextBelongsToVideo(baseUrl, videoId)) {
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
): WordToken[] {
  return parseJson3Safe(data, {
    syllableWeighting: settings.syllableWeighting,
  });
}

async function fetchTimedTextJson(baseUrl: string): Promise<unknown | null> {
  const safe = toSafeTimedTextUrl(baseUrl);
  if (!safe) {
    return null;
  }
  const response = await fetch(safe, { credentials: 'include' });
  if (!response.ok) {
    return null;
  }
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readSnapshot(pageVideoId: string): Promise<PlayerSnapshot> {
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
  const deadline = Date.now() + 4000;
  let snapshot = empty;
  while (Date.now() <= deadline) {
    const rawSnapshot = await requestFromMain<unknown>(
      'GET_PLAYER_SNAPSHOT',
      pageVideoId,
      null,
      3000,
    ).catch(() => null);
    snapshot = isPlayerSnapshot(rawSnapshot) ? rawSnapshot : empty;
    if (snapshot.tracks.length > 0) {
      return snapshot;
    }
    await sleep(250);
  }
  return snapshot;
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as PlayerSnapshot).tracks),
  );
}

export async function acquireTranscript(
  settings: DynamicSpeedSettings,
): Promise<AcquireResult> {
  const pageVideoId = parseVideoId(location.href);
  if (!pageVideoId) {
    throw new Error('No video id');
  }
  const snapshot = await readSnapshot(pageVideoId);
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
    if (cached && cached.length > 0) {
      return { tokens: cached, source: 'cache', track, snapshot };
    }

    try {
      const json = await fetchTimedTextJson(track.baseUrl);
      const tokens = tokensFromUnknown(json, settings);
      if (tokens.length > 0) {
        await rememberTokens(
          {
            videoId: trustedId,
            language: track.languageCode,
            trackKind: track.kind ?? 'asr',
          },
          tokens,
        );
        return { tokens, source: 'timedtext', track, snapshot };
      }
    } catch {
      // fall through to MAIN fallback that never takes a client URL
    }
  }

  const captured = await requestFromMain<unknown>(
    'ACQUIRE_FALLBACK_TRANSCRIPT',
    trustedId,
    null,
    15_000,
  ).catch(() => null);
  const capturedTokens = tokensFromUnknown(captured, settings);
  if (capturedTokens.length > 0) {
    await rememberTokens(
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
