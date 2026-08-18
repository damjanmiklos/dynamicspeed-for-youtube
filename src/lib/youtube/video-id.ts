export function parseVideoId(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.searchParams.get('v')) {
      return url.searchParams.get('v');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const kind = parts[0];
    if (kind === 'shorts' || kind === 'embed' || kind === 'live' || kind === 'v') {
      return parts[1] ?? null;
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
  '*://*.youtube.com/*',
  '*://youtube.com/*',
  '*://*.youtube-nocookie.com/*',
] as const;
