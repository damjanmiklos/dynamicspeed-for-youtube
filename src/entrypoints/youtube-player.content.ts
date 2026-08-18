import { emitBridgeEvent, listenToIsolatedRequests } from '../lib/bridge/main';
import type { CaptionTrackPayload, PlayerSnapshot } from '../lib/bridge/protocol';
import { forceJson3Url } from '../lib/transcript/select-track';
import { parseVideoId, isShortsPath, YOUTUBE_MATCHES } from '../lib/youtube/video-id';

type PlayerResponse = {
  videoDetails?: {
    videoId?: string;
    title?: string;
    channelId?: string;
    author?: string;
    isLiveContent?: boolean;
    shortDescription?: string;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      category?: string;
      ownerChannelName?: string;
      lengthSeconds?: string;
      liveBroadcastDetails?: { isLiveNow?: boolean };
    };
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{
        baseUrl?: string;
        languageCode?: string;
        kind?: string;
        vssId?: string;
        name?: { simpleText?: string };
      }>;
    };
  };
};

type YTPlayer = {
  getPlayerResponse?: () => PlayerResponse;
  getVideoData?: () => { video_id?: string; title?: string; author?: string };
  getDuration?: () => number;
  setOption?: (module: string, option: string, value: unknown) => void;
};

declare global {
  interface Window {
    ytInitialPlayerResponse?: PlayerResponse;
    ytcfg?: { get: (key: string) => unknown };
  }
}

function moviePlayer(): YTPlayer | null {
  return document.getElementById('movie_player') as unknown as YTPlayer | null;
}

function readPlayerResponse(): PlayerResponse | null {
  try {
    const fromPlayer = moviePlayer()?.getPlayerResponse?.();
    if (fromPlayer) {
      return fromPlayer;
    }
  } catch {
    // player not ready
  }
  return window.ytInitialPlayerResponse ?? null;
}

function tracksFrom(response: PlayerResponse | null): CaptionTrackPayload[] {
  const tracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks
    .filter((track) => track.baseUrl)
    .map((track) => ({
      baseUrl: track.baseUrl as string,
      languageCode: track.languageCode ?? 'en',
      languageName: track.name?.simpleText,
      kind: track.kind,
      vssId: track.vssId,
    }));
}

function parseClock(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] ?? 0;
}

function scrapeDomTranscript(): unknown | null {
  const rows = [
    ...document.querySelectorAll(
      'ytd-transcript-segment-renderer, ytd-transcript-body-renderer ytd-transcript-segment-renderer',
    ),
  ];
  if (rows.length === 0) {
    return null;
  }
  const events = rows.map((row, index) => {
    const text =
      row.querySelector('.segment-text, yt-formatted-string')?.textContent?.trim() ??
      '';
    const stamp =
      row.querySelector('.segment-timestamp, div[class*="timestamp"]')?.textContent ??
      '';
    const t0 = parseClock(stamp);
    const nextStamp =
      rows[index + 1]
        ?.querySelector('.segment-timestamp, div[class*="timestamp"]')
        ?.textContent ?? '';
    const t1 = nextStamp ? parseClock(nextStamp) : t0 + 2;
    return {
      tStartMs: t0 * 1000,
      dDurationMs: Math.max(0.3, t1 - t0) * 1000,
      segs: [{ utf8: text }],
    };
  });
  return { events };
}

async function innertubePlayer(videoId: string, client: 'WEB' | 'ANDROID'): Promise<PlayerResponse | null> {
  const ytcfg = window.ytcfg;
  const apiKey =
    (ytcfg?.get?.('INNERTUBE_API_KEY') as string | undefined) ??
    'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
  const clientVersion =
    client === 'WEB'
      ? ((ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') as string | undefined) ??
        '2.20240815.00.00')
      : '19.09.37';
  const body = {
    context: {
      client:
        client === 'WEB'
          ? { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' }
          : {
              clientName: 'ANDROID',
              clientVersion,
              androidSdkVersion: 30,
              hl: 'en',
              gl: 'US',
            },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
  const response = await fetch(
    `/youtubei/v1/player?prettyPrint=false&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    },
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as PlayerResponse;
}

function snapshotFrom(response: PlayerResponse | null): PlayerSnapshot {
  const href = location.href;
  const details = response?.videoDetails;
  const micro = response?.microformat?.playerMicroformatRenderer;
  const videoId = details?.videoId ?? parseVideoId(href);
  return {
    videoId,
    title: details?.title ?? document.title,
    channelId: details?.channelId ?? null,
    channelName: details?.author ?? micro?.ownerChannelName ?? null,
    duration: micro?.lengthSeconds ? Number(micro.lengthSeconds) : moviePlayer()?.getDuration?.() ?? null,
    isLive: Boolean(details?.isLiveContent || micro?.liveBroadcastDetails?.isLiveNow),
    isShorts: isShortsPath(href),
    isMusic: (micro?.category ?? '').toLowerCase() === 'music',
    tracks: tracksFrom(response),
  };
}

let lastCapture: { videoId: string; data: unknown } | null = null;

function installTimedtextObserver(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const raw = args[0];
      const url =
        typeof raw === 'string'
          ? raw
          : raw instanceof URL
            ? raw.toString()
            : raw instanceof Request
              ? raw.url
              : '';
      if (url.includes('/api/timedtext')) {
        const clone = response.clone();
        void clone.json().then((data) => {
          const videoId = parseVideoId(location.href) ?? '';
          lastCapture = { videoId, data };
          emitBridgeEvent('TIMEDTEXT_CAPTURED', videoId, data);
        });
      }
    } catch {
      // ignore observer errors
    }
    return response;
  };
}

async function waitForCapture(videoId: string, timeoutMs: number): Promise<unknown> {
  const start = Date.now();
  try {
    moviePlayer()?.setOption?.('captions', 'track', { languageCode: 'en' });
  } catch {
    document.querySelector<HTMLButtonElement>('.ytp-subtitles-button')?.click();
  }
  while (Date.now() - start < timeoutMs) {
    if (lastCapture && lastCapture.videoId === videoId) {
      return lastCapture.data;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  return lastCapture?.data ?? null;
}

export default defineContentScript({
  matches: [...YOUTUBE_MATCHES],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installTimedtextObserver();
    listenToIsolatedRequests({
      getSnapshot() {
        return snapshotFrom(readPlayerResponse());
      },
      async fetchTimedText(url: string) {
        const videoId = parseVideoId(location.href) ?? '';
        if (!url) {
          const captured = await waitForCapture(videoId, 5000);
          if (captured) {
            return captured;
          }
          let response = readPlayerResponse();
          if (!tracksFrom(response).length && videoId) {
            response =
              (await innertubePlayer(videoId, 'WEB')) ??
              (await innertubePlayer(videoId, 'ANDROID')) ??
              response;
          }
          const track = tracksFrom(response)[0];
          if (track) {
            const timed = await fetch(forceJson3Url(track.baseUrl), {
              credentials: 'include',
            });
            if (timed.ok) {
              return timed.json();
            }
          }
          return scrapeDomTranscript();
        }
        const timed = await fetch(forceJson3Url(url), { credentials: 'include' });
        if (!timed.ok) {
          throw new Error(`timedtext HTTP ${timed.status}`);
        }
        return timed.json();
      },
    });

    let lastId = parseVideoId(location.href);
    const emitNav = () => {
      const id = parseVideoId(location.href);
      if (id && id !== lastId) {
        lastId = id;
        emitBridgeEvent('VIDEO_ID_CHANGED', id, snapshotFrom(readPlayerResponse()));
      }
    };
    document.addEventListener('yt-navigate-finish', emitNav);
    window.setInterval(emitNav, 1000);
  },
});
