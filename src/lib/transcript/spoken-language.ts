import { CAPTION_LANGUAGE_AUTO } from '../settings/caption-languages';

export type CaptionTrackLike = {
  languageCode?: string;
  kind?: string;
  vssId?: string;
};

export type CaptionAudioTrackLike = {
  captionTrackIndices?: number[];
  languageCode?: string;
  audioTrackId?: string;
};

export type CaptionListMeta = {
  captionTracks?: CaptionTrackLike[];
  audioTracks?: CaptionAudioTrackLike[];
  defaultAudioTrackIndex?: number;
};

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value) || length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, Math.floor(value)));
}

export function isAutoCaptionLanguage(code: string | null | undefined): boolean {
  const normalized = (code ?? '').trim().toLowerCase();
  return normalized === CAPTION_LANGUAGE_AUTO || normalized === 'spoken';
}

export function primaryLanguageTag(code: string | null | undefined): string {
  const raw = (code ?? '').trim().toLowerCase();
  if (raw.length < 2) {
    return '';
  }
  return raw.split(/[-_]/)[0] ?? '';
}

export function isAsrCaptionTrack(track: CaptionTrackLike | null | undefined): boolean {
  if (!track) {
    return false;
  }
  if (track.kind === 'asr') {
    return true;
  }
  const vss = track.vssId?.trim().toLowerCase() ?? '';
  return vss.startsWith('a.');
}

function uniqueTags(codes: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of codes) {
    const tag = primaryLanguageTag(code);
    if (tag.length < 2 || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function languageFromAudioTrack(audio: CaptionAudioTrackLike | undefined): string {
  const direct = primaryLanguageTag(audio?.languageCode);
  if (direct.length >= 2) {
    return direct;
  }
  const id = audio?.audioTrackId?.trim().toLowerCase() ?? '';
  if (!id || id === 'original' || id === 'default' || id === 'und') {
    return '';
  }
  const match = /^([a-z]{2,3})(?:[-_][a-z0-9]+)?(?:[._]|$)/i.exec(id);
  return match?.[1]?.toLowerCase() ?? '';
}

function asrTagsAmong(
  tracks: CaptionTrackLike[],
  indices: number[] | undefined,
): string[] {
  const subset =
    indices && indices.length > 0
      ? indices
          .filter((index) => Number.isInteger(index) && index >= 0 && index < tracks.length)
          .map((index) => tracks[index])
      : tracks;
  return uniqueTags(
    subset.filter(isAsrCaptionTrack).map((track) => track.languageCode),
  );
}

/**
 * Best-effort spoken/heard language for this video.
 * Prefers the default audio track’s ASR captions. Does not use YouTube’s
 * defaultCaptionTrackIndex, which follows the account caption language
 * (the bilingual English-on-German problem).
 */
export function spokenLanguageFromCaptionList(
  list: CaptionListMeta | null | undefined,
): string | null {
  const tracks = list?.captionTracks ?? [];
  const audioTracks = list?.audioTracks ?? [];
  const audio =
    audioTracks.length > 0
      ? audioTracks[clampIndex(list?.defaultAudioTrackIndex ?? 0, audioTracks.length)]
      : undefined;
  const audioLang = languageFromAudioTrack(audio);
  const indexedAsr = asrTagsAmong(tracks, audio?.captionTrackIndices);
  if (indexedAsr.length === 1) {
    return indexedAsr[0];
  }
  if (audioLang && indexedAsr.includes(audioLang)) {
    return audioLang;
  }
  if (audioLang && tracks.some((track) => primaryLanguageTag(track.languageCode) === audioLang)) {
    return audioLang;
  }
  const allAsr = asrTagsAmong(tracks, undefined);
  if (allAsr.length === 1) {
    return allAsr[0];
  }
  if (audioLang && allAsr.includes(audioLang)) {
    return audioLang;
  }
  return allAsr[0] ?? null;
}

export function resolveCaptionLanguage(
  preference: string,
  spoken: string | null | undefined,
  tracks: CaptionTrackLike[] = [],
): string {
  if (!isAutoCaptionLanguage(preference)) {
    const pinned = preference.trim();
    return pinned.length >= 2 ? pinned.slice(0, 16) : 'en';
  }
  const spokenTag = (spoken ?? '').trim();
  if (spokenTag.length >= 2) {
    return spokenTag.slice(0, 16);
  }
  const asr = tracks.find(isAsrCaptionTrack)?.languageCode?.trim();
  if (asr && asr.length >= 2) {
    return asr.slice(0, 16);
  }
  const first = tracks[0]?.languageCode?.trim();
  if (first && first.length >= 2) {
    return first.slice(0, 16);
  }
  return 'en';
}
