import type { CaptionTrack } from './types';
import { isEnglishLanguageCode } from '../pacing/syllables';
import { isAsrCaptionTrack } from './spoken-language';
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

function trackLabel(track: Pick<CaptionTrack, 'languageName' | 'vssId'>): string {
  return `${track.languageName ?? ''} ${track.vssId ?? ''}`.toLowerCase();
}

export function captionTrackDisplayName(track: {
  languageName?: string;
  trackName?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
}): string | undefined {
  const fromRuns = track.name?.runs?.map((run) => run.text ?? '').join('') ?? '';
  for (const raw of [track.languageName, track.trackName, track.name?.simpleText, fromRuns]) {
    const text = raw?.trim();
    if (text) {
      return text.slice(0, 80);
    }
  }
  return undefined;
}

/** YouTube "English - Animated" (and similar) karaoke/kinetic tracks. */
export function isAnimatedCaptionTrack(
  track: Pick<CaptionTrack, 'languageName' | 'vssId'> | null | undefined,
): boolean {
  if (!track) {
    return false;
  }
  return trackLabel(track).includes('animated');
}

export function isStandardCaptionTrack(
  track: Pick<CaptionTrack, 'languageName' | 'vssId'> | null | undefined,
): boolean {
  if (!track) {
    return false;
  }
  const label = trackLabel(track);
  return label.includes('standard') && !label.includes('animated');
}

/** Cache slice so Animated / Standard / ASR for the same language do not collide. */
export function cacheTrackKind(
  track: Pick<CaptionTrack, 'kind' | 'languageName' | 'vssId'> | null | undefined,
): string {
  if (!track) {
    return 'asr';
  }
  if (isAsrCaptionTrack(track)) {
    return 'asr';
  }
  if (isAnimatedCaptionTrack(track)) {
    return 'animated';
  }
  if (isStandardCaptionTrack(track)) {
    return 'standard';
  }
  const vss = (track.vssId ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '').slice(0, 24);
  return vss || 'manual';
}

function captionTrackScore(
  track: CaptionTrack,
  options: { language: string; preferManual: boolean },
): number {
  const language = options.language.toLowerCase();
  const code = track.languageCode?.toLowerCase() ?? '';
  const languageMatches = code === language || code.startsWith(`${language}-`);
  const asr = isAsrCaptionTrack(track);
  const animated = isAnimatedCaptionTrack(track);
  const standard = isStandardCaptionTrack(track);
  let value = 0;
  if (languageMatches) value += 8;
  if (animated) {
    value -= 6;
  } else if (options.preferManual && !asr) {
    value += 4;
    if (standard) value += 2;
  } else if (!options.preferManual && asr) {
    value += 3;
  } else if (!options.preferManual && !asr) {
    value += 1;
    if (standard) value += 1;
  }
  if (code.startsWith('en')) value += 1;
  return value;
}

export function rankCaptionTracks(
  tracks: CaptionTrack[],
  options: { language: string; preferManual: boolean },
): CaptionTrack[] {
  return tracks
    .map((track, index) => ({ track, index, score: captionTrackScore(track, options) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.track);
}

export function selectCaptionTrack(
  tracks: CaptionTrack[],
  options: { language: string; preferManual: boolean },
): CaptionTrack | null {
  return rankCaptionTracks(tracks, options)[0] ?? null;
}

export function isEnglishTrack(track: CaptionTrack | null): boolean {
  return isEnglishLanguageCode(track?.languageCode);
}
