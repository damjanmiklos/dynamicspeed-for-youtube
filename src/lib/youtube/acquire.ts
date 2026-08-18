import { requestFromMain } from '../bridge/isolated';
import type { PlayerSnapshot } from '../bridge/protocol';
import { parseJson3Safe } from '../transcript/parse-json3';
import { forceJson3Url, selectCaptionTrack } from '../transcript/select-track';
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

function asTracks(snapshot: PlayerSnapshot): CaptionTrack[] {
  return snapshot.tracks.map((track) => ({
    baseUrl: track.baseUrl,
    languageCode: track.languageCode,
    languageName: track.languageName,
    kind: track.kind,
    vssId: track.vssId,
  }));
}

function tokensFromUnknown(
  data: unknown,
  settings: DynamicSpeedSettings,
): WordToken[] {
  return parseJson3Safe(data, {
    syllableWeighting: settings.syllableWeighting,
  });
}

export async function acquireTranscript(
  settings: DynamicSpeedSettings,
): Promise<AcquireResult> {
  const snapshot = await requestFromMain<PlayerSnapshot>(
    'GET_PLAYER_SNAPSHOT',
    parseVideoId(location.href) ?? '',
    null,
  );
  const videoId = snapshot.videoId ?? parseVideoId(location.href);
  if (!videoId) {
    throw new Error('No video id');
  }

  const track = selectCaptionTrack(asTracks(snapshot), {
    language: settings.captionLanguage,
    preferManual: settings.preferManualCaptions,
  });

  if (track) {
    const cached = await recallTokens({
      videoId,
      language: track.languageCode,
      trackKind: track.kind ?? 'asr',
    });
    if (cached && cached.length > 0) {
      return { tokens: cached, source: 'cache', track, snapshot };
    }

    try {
      const json = await requestFromMain<unknown>(
        'FETCH_TIMEDTEXT',
        videoId,
        { url: forceJson3Url(track.baseUrl) },
      );
      const tokens = tokensFromUnknown(json, settings);
      if (tokens.length > 0) {
        await rememberTokens(
          {
            videoId,
            language: track.languageCode,
            trackKind: track.kind ?? 'asr',
          },
          tokens,
        );
        return { tokens, source: 'timedtext', track, snapshot };
      }
    } catch {
      // fall through to captured / innertube payload already on snapshot
    }
  }

  const captured = await requestFromMain<unknown>(
    'FETCH_TIMEDTEXT',
    videoId,
    { url: '', waitForCapture: true },
  ).catch(() => null);
  const capturedTokens = tokensFromUnknown(captured, settings);
  if (capturedTokens.length > 0) {
    await rememberTokens(
      {
        videoId,
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
