import type { CaptionTrack } from './types';

const TIMEDTEXT_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'music.youtube.com',
]);

export const YOUTUBE_PAGE_HOSTS = TIMEDTEXT_HOSTS;

export function isAllowedYouTubeHost(hostname: string): boolean {
  return TIMEDTEXT_HOSTS.has(hostname.toLowerCase());
}

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

export function timedTextBelongsToVideo(raw: string, videoId: string): boolean {
  const safe = toSafeTimedTextUrl(raw);
  if (!safe || !videoId) {
    return false;
  }
  const video = new URL(safe).searchParams.get('v');
  return !video || video === videoId;
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
  const code = track?.languageCode?.toLowerCase() ?? '';
  return code === 'en' || code.startsWith('en-');
}
