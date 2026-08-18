import type { CaptionTrack } from './types';
import { isEnglishLanguageCode } from '../pacing/syllables';
import { isAllowedYouTubeHost } from '../youtube/video-id';

export function isAllowedTimedTextUrl(
  raw: string,
  origin = 'https://www.youtube.com',
): boolean {
  return toSafeTimedTextUrl(raw, origin) !== null;
}

/** Only https YouTube `/api/timedtext` URLs. Rejects credentials, other hosts, and extra paths. */
export function toSafeTimedTextUrl(
  raw: string,
  origin = 'https://www.youtube.com',
): string | null {
  if (!raw || typeof raw !== 'string' || raw.length > 4000) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
  }
  if (url.protocol !== 'https:') {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  if (url.port && url.port !== '443') {
    return null;
  }
  if (!isAllowedYouTubeHost(url.hostname)) {
    return null;
  }
  if (url.pathname !== '/api/timedtext') {
    return null;
  }
  url.searchParams.set('fmt', 'json3');
  url.hash = '';
  return url.toString();
}

export function forceJson3Url(baseUrl: string, origin = 'https://www.youtube.com'): string {
  const safe = toSafeTimedTextUrl(baseUrl, origin);
  if (!safe) {
    throw new Error('Caption URL is not a YouTube timedtext endpoint');
  }
  return safe;
}

export function videoIdFromTimedTextUrl(raw: string): string | null {
  const safe = toSafeTimedTextUrl(raw);
  if (!safe) {
    return null;
  }
  const video = new URL(safe).searchParams.get('v');
  return video && /^[\w-]{11}$/.test(video) ? video : null;
}

export function timedTextBelongsToVideo(raw: string, videoId: string): boolean {
  const safe = toSafeTimedTextUrl(raw);
  if (!safe || !videoId) {
    return false;
  }
  const video = new URL(safe).searchParams.get('v');
  return video === videoId;
}

/** Player caption URLs sometimes omit `v=`; bind them to the watch-page video. */
export function bindTimedTextToVideo(
  raw: string,
  videoId: string,
  origin = 'https://www.youtube.com',
): string | null {
  const safe = toSafeTimedTextUrl(raw, origin);
  if (!safe || !/^[\w-]{11}$/.test(videoId)) {
    return null;
  }
  const url = new URL(safe);
  const existing = url.searchParams.get('v');
  if (existing && existing !== videoId) {
    return null;
  }
  url.searchParams.set('v', videoId);
  return url.toString();
}

const POT_VALUE = /^[\w+/.=-]+$/;
const POTC_VALUE = /^[A-Za-z0-9_-]{1,16}$/;

/** Read a proof-of-origin token from a YouTube request URL. Does not fetch. */
export function potFromYouTubeUrl(
  raw: string,
  origin = 'https://www.youtube.com',
): { pot: string; potc: string | null } | null {
  if (!raw || typeof raw !== 'string' || raw.length > 8000) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return null;
  }
  if (!isAllowedYouTubeHost(url.hostname)) {
    return null;
  }
  const pot = url.searchParams.get('pot');
  if (!pot || pot.length < 8 || pot.length > 2048 || !POT_VALUE.test(pot)) {
    return null;
  }
  const potc = url.searchParams.get('potc');
  return {
    pot,
    potc: potc && POTC_VALUE.test(potc) ? potc : null,
  };
}

/** Attach a harvested pot only when the timedtext URL does not already have one. */
export function withTimedTextPot(
  raw: string,
  pot: string,
  potc?: string | null,
  origin = 'https://www.youtube.com',
): string | null {
  const safe = toSafeTimedTextUrl(raw, origin);
  if (!safe || !POT_VALUE.test(pot) || pot.length < 8 || pot.length > 2048) {
    return safe;
  }
  const url = new URL(safe);
  if (!url.searchParams.get('pot')) {
    url.searchParams.set('pot', pot);
    if (potc && POTC_VALUE.test(potc)) {
      url.searchParams.set('potc', potc);
    }
  }
  if (url.toString().length > 4000) {
    return safe;
  }
  return toSafeTimedTextUrl(url.toString(), origin);
}

export function selectCaptionTrack(
  tracks: CaptionTrack[],
  options: { language: string; preferManual: boolean },
): CaptionTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  const language = options.language.toLowerCase();
  const languageMatches = (track: CaptionTrack) => {
    const code = track.languageCode?.toLowerCase() ?? '';
    return code === language || code.startsWith(`${language}-`);
  };
  const isManual = (track: CaptionTrack) => track.kind !== 'asr';

  const ranked = [...tracks].sort((a, b) => {
    const score = (track: CaptionTrack) => {
      let value = 0;
      if (languageMatches(track)) value += 8;
      if (options.preferManual && isManual(track)) value += 4;
      if (!options.preferManual && !isManual(track)) value += 2;
      if (track.languageCode?.toLowerCase().startsWith('en')) value += 1;
      return value;
    };
    return score(b) - score(a);
  });

  return ranked[0] ?? null;
}

export function isEnglishTrack(track: CaptionTrack | null): boolean {
  return isEnglishLanguageCode(track?.languageCode);
}
