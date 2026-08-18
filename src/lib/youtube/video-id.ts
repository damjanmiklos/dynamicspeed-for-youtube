const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function asVideoId(value: string | null | undefined): string | null {
  return value && VIDEO_ID_PATTERN.test(value) ? value : null;
}

export function parseVideoId(href: string): string | null {
  try {
    const url = new URL(href);
    const fromQuery = asVideoId(url.searchParams.get('v'));
    if (fromQuery) {
      return fromQuery;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const kind = parts[0];
    if (kind === 'shorts' || kind === 'embed' || kind === 'live' || kind === 'v') {
      return asVideoId(parts[1]);
    }
    return null;
  } catch {
    return null;
  }
}

export function isShortsPath(href: string): boolean {
  try {
    return new URL(href).pathname.startsWith('/shorts/');
  } catch {
    return false;
  }
}

const YOUTUBE_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'music.youtube.com',
]);

export function isAllowedYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase());
}

/** True only for http(s) URLs whose host is YouTube, not a substring match. */
export function isYouTubeTabUrl(raw: string | undefined | null): boolean {
  if (!raw) {
    return false;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }
    return isAllowedYouTubeHost(url.hostname);
  } catch {
    return false;
  }
}

export const YOUTUBE_MATCHES = [
  '*://www.youtube.com/*',
  '*://youtube.com/*',
  '*://m.youtube.com/*',
  '*://music.youtube.com/*',
  '*://www.youtube-nocookie.com/*',
  '*://youtube-nocookie.com/*',
] as const;
