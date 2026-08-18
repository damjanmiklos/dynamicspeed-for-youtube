import { asVideoId } from './video-id';

export function playerResponseBelongsToVideo(
  response: { videoDetails?: { videoId?: string } } | null | undefined,
  videoId: string | null,
): boolean {
  const expected = asVideoId(videoId);
  const actual = asVideoId(response?.videoDetails?.videoId);
  return Boolean(expected && actual && expected === actual);
}

export function titleFromDocumentTitle(raw: string): string | null {
  let text = raw.trim().replace(/^\(\d+\)\s+/, '');
  text = text.replace(/\s*[-–—]\s*YouTube\s*$/i, '').trim();
  if (!text || /^youtube$/i.test(text)) {
    return null;
  }
  return text;
}

const TITLE_SELECTORS = [
  'h1.ytd-watch-metadata yt-formatted-string',
  'h1.ytd-watch-metadata',
  '#title h1 yt-formatted-string',
  '#title h1',
  'h1.ytd-video-primary-info-renderer yt-formatted-string',
  'h2.ytShortsVideoTitleViewModelShortsVideoTitle span',
  'h2.ytShortsVideoTitleViewModelShortsVideoTitle',
];

/** Live title from the watch page. Does not use ytInitialPlayerResponse. */
export function readVisibleWatchTitle(): string | null {
  for (const selector of TITLE_SELECTORS) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) {
      return text;
    }
  }
  const meta = document.querySelector('meta[name="title"]')?.getAttribute('content')?.trim();
  if (meta) {
    return meta;
  }
  return titleFromDocumentTitle(document.title);
}
