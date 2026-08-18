import { emitBridgeEvent, listenToIsolatedRequests } from '../lib/bridge/main';
import type { CaptionTrackPayload, PlayerSnapshot } from '../lib/bridge/protocol';
import { toSafeTimedTextUrl, videoIdFromTimedTextUrl } from '../lib/transcript/select-track';
import { MAX_CAPTION_BYTES } from '../lib/transcript/limits';
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
  loadModule?: (module: string) => void;
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
  const allowed: CaptionTrackPayload[] = [];
  for (const track of tracks) {
    if (!track.baseUrl) {
      continue;
    }
    const baseUrl = toSafeTimedTextUrl(track.baseUrl);
    if (!baseUrl) {
      continue;
    }
    allowed.push({
      baseUrl,
      languageCode: track.languageCode ?? 'en',
      languageName: track.name?.simpleText,
      kind: track.kind,
      vssId: track.vssId,
    });
  }
  return allowed;
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
  ].slice(0, 8_000);
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

function readYtcfg(key: string): string | null {
  const ytcfg = window.ytcfg;
  try {
    const fromGet = ytcfg?.get?.(key);
    if (typeof fromGet === 'string' && fromGet.length > 0) {
      return fromGet;
    }
  } catch {
    // ytcfg may not be ready
  }
  const data = (ytcfg as { data_?: Record<string, unknown> } | undefined)?.data_;
  const fromData = data?.[key];
  return typeof fromData === 'string' && fromData.length > 0 ? fromData : null;
}

async function innertubePlayer(videoId: string, client: 'WEB' | 'ANDROID'): Promise<PlayerResponse | null> {
  if (!/^[\w-]{11}$/.test(videoId)) {
    return null;
  }
  const apiKey = readYtcfg('INNERTUBE_API_KEY');
  if (!apiKey) {
    return null;
  }
  const clientVersion = readYtcfg('INNERTUBE_CLIENT_VERSION');
  if (!clientVersion) {
    return null;
  }
  const body = {
    context: {
      client:
        client === 'WEB'
          ? { clientName: 'WEB' as const, clientVersion, hl: 'en', gl: 'US' }
          : {
              clientName: 'ANDROID' as const,
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
    `/youtubei/v1/player?prettyPrint=false&key=${encodeURIComponent(apiKey)}`,
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
  const videoId = parseVideoId(href) ?? details?.videoId ?? null;
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

async function fetchAllowlistedTimedText(baseUrl: string): Promise<unknown | null> {
  const safe = toSafeTimedTextUrl(baseUrl);
  if (!safe) {
    return null;
  }
  const timed = await fetch(safe, { credentials: 'include' });
  if (!timed.ok) {
    return null;
  }
  const declared = Number(timed.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_CAPTION_BYTES) {
    return null;
  }
  const text = await timed.text();
  if (text.length > MAX_CAPTION_BYTES) {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

let lastCapture: { videoId: string; data: unknown } | null = null;

function rememberTimedTextBody(url: string, body: unknown): void {
  if (!toSafeTimedTextUrl(url) || body == null) {
    return;
  }
  let data: object | null = null;
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.length > MAX_CAPTION_BYTES) {
      return;
    }
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        data = parsed;
      }
    } catch {
      return;
    }
  } else if (typeof body === 'object') {
    data = body;
  }
  if (!data) {
    return;
  }
  const videoId =
    videoIdFromTimedTextUrl(url) ?? parseVideoId(location.href) ?? '';
  lastCapture = { videoId, data };
  if (videoId) {
    emitBridgeEvent('TIMEDTEXT_CAPTURED', videoId, null);
  }
}

const FETCH_HOOK_FLAG = '__dsTimedTextFetchHooked';

function installTimedtextObserver(): void {
  const hooked = window as Window & { [FETCH_HOOK_FLAG]?: boolean };
  if (hooked[FETCH_HOOK_FLAG]) {
    return;
  }
  hooked[FETCH_HOOK_FLAG] = true;

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
      if (toSafeTimedTextUrl(url)) {
        const clone = response.clone();
        void clone.text().then((text) => {
          if (text.length <= MAX_CAPTION_BYTES) {
            rememberTimedTextBody(url, text);
          }
        });
      }
    } catch {
      // ignore observer errors
    }
    return response;
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = args[1];
    (this as XMLHttpRequest & { __dsTimedTextUrl?: string }).__dsTimedTextUrl =
      typeof url === 'string' ? url : String(url ?? '');
    return xhrOpen.apply(this, args as Parameters<XMLHttpRequest['open']>);
  };
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url =
      (this as XMLHttpRequest & { __dsTimedTextUrl?: string }).__dsTimedTextUrl ??
      '';
    if (toSafeTimedTextUrl(url)) {
      this.addEventListener('load', () => {
        const payload =
          this.responseType === 'json' ? this.response : this.responseText;
        rememberTimedTextBody(url, payload);
      });
    }
    return xhrSend.call(this, body);
  };
}

function captionsAlreadyVisible(): boolean {
  const button = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
  const label = button?.getAttribute('aria-label') ?? '';
  return (
    button?.getAttribute('aria-pressed') === 'true' &&
    !/unavailable/i.test(label)
  );
}

function captureMatchesVideo(videoId: string): unknown | null {
  if (!lastCapture?.data || !videoId) {
    return null;
  }
  if (!lastCapture.videoId || lastCapture.videoId === videoId) {
    return lastCapture.data;
  }
  return null;
}

function requestCaptionTrack(): void {
  const player = moviePlayer();
  const language =
    tracksFrom(readPlayerResponse())[0]?.languageCode ?? 'en';
  try {
    player?.loadModule?.('captions');
  } catch {
    // module loader is optional
  }
  try {
    player?.setOption?.('captions', 'track', { languageCode: language });
    return;
  } catch {
    document.querySelector<HTMLButtonElement>('.ytp-subtitles-button')?.click();
  }
}

function hideCaptionTrack(): void {
  try {
    moviePlayer()?.setOption?.('captions', 'track', {});
  } catch {
    const button = document.querySelector<HTMLButtonElement>('.ytp-subtitles-button');
    if (button?.getAttribute('aria-pressed') === 'true') {
      button.click();
    }
  }
}

async function waitForCapture(videoId: string, timeoutMs: number): Promise<unknown> {
  const existing = captureMatchesVideo(videoId);
  if (existing) {
    return existing;
  }
  const start = Date.now();
  const keepCaptionsOn = captionsAlreadyVisible();
  let lastRequestAt = 0;
  while (Date.now() - start < timeoutMs) {
    const hit = captureMatchesVideo(videoId);
    if (hit) {
      if (!keepCaptionsOn) {
        hideCaptionTrack();
      }
      return hit;
    }
    if (Date.now() - lastRequestAt > 400) {
      requestCaptionTrack();
      lastRequestAt = Date.now();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  if (!keepCaptionsOn) {
    hideCaptionTrack();
  }
  return captureMatchesVideo(videoId);
}

let fallbackInFlight: Promise<unknown> | null = null;

async function acquireFallbackTranscriptNow(): Promise<unknown> {
  const videoId = parseVideoId(location.href) ?? '';
  const captured = await waitForCapture(videoId, 8000);
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
    const json = await fetchAllowlistedTimedText(track.baseUrl);
    if (json) {
      return json;
    }
  }
  return scrapeDomTranscript();
}

async function acquireFallbackTranscript(): Promise<unknown> {
  if (fallbackInFlight) {
    return fallbackInFlight;
  }
  fallbackInFlight = acquireFallbackTranscriptNow().finally(() => {
    fallbackInFlight = null;
  });
  return fallbackInFlight;
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
      acquireFallbackTranscript,
    });

    let lastId = parseVideoId(location.href);
    let lastTrackKey = '';
    const emitNav = () => {
      const id = parseVideoId(location.href);
      if (id && id !== lastId) {
        lastId = id;
        lastCapture = null;
        lastTrackKey = '';
        emitBridgeEvent('VIDEO_ID_CHANGED', id, null);
      }
      const snapshot = snapshotFrom(readPlayerResponse());
      const videoId = snapshot.videoId ?? id;
      if (videoId && snapshot.tracks.length > 0) {
        const key = `${videoId}:${snapshot.tracks.length}`;
        if (key !== lastTrackKey) {
          lastTrackKey = key;
          emitBridgeEvent('RAW_TRACKS_RESOLVED', videoId, {
            count: snapshot.tracks.length,
          });
        }
      }
    };
    document.addEventListener('yt-navigate-finish', emitNav);
    window.setInterval(emitNav, 500);
  },
});
