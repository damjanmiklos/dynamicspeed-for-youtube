import type { CaptionTrack } from './types';

export function forceJson3Url(baseUrl: string, origin = 'https://www.youtube.com'): string {
  const url = new URL(baseUrl, origin);
  url.searchParams.set('fmt', 'json3');
  return url.toString();
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
