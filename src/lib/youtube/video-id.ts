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

export const YOUTUBE_MATCHES = [
  '*://*.youtube.com/*',
  '*://youtube.com/*',
  '*://*.youtube-nocookie.com/*',
] as const;
