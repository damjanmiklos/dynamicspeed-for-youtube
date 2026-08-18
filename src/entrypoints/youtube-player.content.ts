import { emitBridgeEvent, listenToIsolatedRequests } from '../lib/bridge/main';
import type { CaptionTrackPayload, PlayerSnapshot } from '../lib/bridge/protocol';
import {
  bindTimedTextToVideo,
  potFromYouTubeUrl,
  selectCaptionTrack,
  toSafeTimedTextUrl,
  videoIdFromTimedTextUrl,
  withTimedTextPot,
} from '../lib/transcript/select-track';
import { MAX_CAPTION_BYTES } from '../lib/transcript/limits';
import { parseVideoId, isShortsPath, YOUTUBE_MATCHES } from '../lib/youtube/video-id';
import {
  playerResponseBelongsToVideo,
  readVisibleWatchTitle,
} from '../lib/youtube/watch-meta';
import {
  captionTrackOptionForLanguage,
  enableCaptionsForCapture,
  hideCaptionFlash,
  parseAcquireCaptionPrefs,
  readSavedCaptionState,
  restoreSavedCaptionState,
  showCaptionFlash,
  userWantedCaptionsOn,
  type CaptionPlayer,
} from '../lib/youtube/caption-nudge';

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

type YTPlayer = CaptionPlayer & {
  getPlayerResponse?: () => PlayerResponse;
  getVideoData?: () => { video_id?: string; title?: string; author?: string };
  getDuration?: () => number;
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
  const videoId = parseVideoId(location.href);
  try {
    const fromPlayer = moviePlayer()?.getPlayerResponse?.();
    if (playerResponseBelongsToVideo(fromPlayer, videoId)) {
      return fromPlayer ?? null;
    }
  } catch {
    // player not ready
  }
  const initial = window.ytInitialPlayerResponse;
  if (playerResponseBelongsToVideo(initial, videoId)) {
    return initial ?? null;
  }
  return null;
}

function titleFromPlayer(): string | null {
  try {
    const title = moviePlayer()?.getVideoData?.()?.title?.trim();
    return title || null;
  } catch {
    return null;
  }
}

function tracksFrom(response: PlayerResponse | null): CaptionTrackPayload[] {
  const videoId = parseVideoId(location.href);
  const tracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const allowed: CaptionTrackPayload[] = [];
  for (const track of tracks) {
    if (!track.baseUrl) {
      continue;
    }
    const baseUrl = videoId
      ? bindTimedTextToVideo(track.baseUrl, videoId)
      : toSafeTimedTextUrl(track.baseUrl);
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

/** Public Android player client string, not a secret. WEB version on ANDROID often fails. */
const ANDROID_INNERTUBE_VERSION = '19.47.7';
const MAX_TRACK_ATTEMPTS = 2;

async function innertubePlayer(
  videoId: string,
  client: 'WEB' | 'ANDROID',
  signal?: AbortSignal,
): Promise<PlayerResponse | null> {
  if (!/^[\w-]{11}$/.test(videoId)) {
    return null;
  }
  const apiKey = readYtcfg('INNERTUBE_API_KEY');
  if (!apiKey) {
    return null;
  }
  const webVersion = readYtcfg('INNERTUBE_CLIENT_VERSION');
  if (client === 'WEB' && !webVersion) {
    return null;
  }
  const body = {
    context: {
      client:
        client === 'WEB'
          ? { clientName: 'WEB' as const, clientVersion: webVersion, hl: 'en', gl: 'US' }
          : {
              clientName: 'ANDROID' as const,
              clientVersion: ANDROID_INNERTUBE_VERSION,
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
      signal,
    },
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as PlayerResponse;
}

function snapshotFrom(response: PlayerResponse | null): PlayerSnapshot {
  const href = location.href;
  const videoId = parseVideoId(href);
  const matched = playerResponseBelongsToVideo(response, videoId) ? response : null;
  const details = matched?.videoDetails;
  const micro = matched?.microformat?.playerMicroformatRenderer;
  return {
    videoId,
    title: details?.title ?? titleFromPlayer() ?? readVisibleWatchTitle(),
    channelId: details?.channelId ?? null,
    channelName: details?.author ?? micro?.ownerChannelName ?? null,
    duration: micro?.lengthSeconds ? Number(micro.lengthSeconds) : moviePlayer()?.getDuration?.() ?? null,
    isLive: Boolean(details?.isLiveContent || micro?.liveBroadcastDetails?.isLiveNow),
    isShorts: isShortsPath(href),
    isMusic: (micro?.category ?? '').toLowerCase() === 'music',
    tracks: tracksFrom(matched),
  };
}

function parseTimedTextBody(text: string): unknown | null {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function xhrGetText(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 5000,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs;
    xhr.withCredentials = true;
    const finish = (text: string | null) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(text);
    };
    const onAbort = () => {
      xhr.abort();
      finish(null);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.onload = () => {
      finish(xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null);
    };
    xhr.onerror = () => finish(null);
    xhr.ontimeout = () => finish(null);
    xhr.send();
  });
}

let lastCapture: { videoId: string; data: unknown } | null = null;
let lastPot: { pot: string; potc: string | null } | null = null;
let captureEnabled = false;
let captureHold = false;
let fallbackAbort: AbortController | null = null;

function shouldCloneTimedText(): boolean {
  return captureEnabled || captureHold;
}

function noteYouTubeUrl(url: string): void {
  const pot = potFromYouTubeUrl(url);
  if (pot) {
    lastPot = pot;
  }
}

function rememberTimedTextBody(url: string, body: unknown): void {
  if (!shouldCloneTimedText() || !toSafeTimedTextUrl(url) || body == null) {
    return;
  }
  let data: object | null = null;
  if (typeof body === 'string') {
    const parsed = parseTimedTextBody(body);
    if (parsed && typeof parsed === 'object') {
      data = parsed;
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

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function fetchAllowlistedTimedText(
  baseUrl: string,
  signal?: AbortSignal,
  timeoutMs = 5000,
): Promise<unknown | null> {
  const videoId = parseVideoId(location.href) ?? '';
  const bound = videoId ? bindTimedTextToVideo(baseUrl, videoId) : toSafeTimedTextUrl(baseUrl);
  if (!bound) {
    return null;
  }
  const withPot =
    lastPot && !new URL(bound).searchParams.get('pot')
      ? withTimedTextPot(bound, lastPot.pot, lastPot.potc)
      : null;
  for (const url of uniqueUrls([withPot, bound])) {
    if (signal?.aborted) {
      return null;
    }
    try {
      const text = await xhrGetText(url, signal, timeoutMs);
      const json = text ? parseTimedTextBody(text) : null;
      if (json) {
        return json;
      }
    } catch {
      if (signal?.aborted) {
        return null;
      }
    }
  }
  return null;
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
    const raw = args[0];
    const url =
      typeof raw === 'string'
        ? raw
        : raw instanceof URL
          ? raw.toString()
          : raw instanceof Request
            ? raw.url
            : '';
    noteYouTubeUrl(url);
    const response = await originalFetch(...args);
    try {
      if (shouldCloneTimedText() && toSafeTimedTextUrl(url)) {
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
    const href = typeof url === 'string' ? url : String(url ?? '');
    (this as XMLHttpRequest & { __dsTimedTextUrl?: string }).__dsTimedTextUrl = href;
    noteYouTubeUrl(href);
    return xhrOpen.apply(this, args as Parameters<XMLHttpRequest['open']>);
  };
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url =
      (this as XMLHttpRequest & { __dsTimedTextUrl?: string }).__dsTimedTextUrl ??
      '';
    if (shouldCloneTimedText() && toSafeTimedTextUrl(url)) {
      this.addEventListener('load', () => {
        const payload =
          this.responseType === 'json' ? this.response : this.responseText;
        rememberTimedTextBody(url, payload);
      });
    }
    return xhrSend.call(this, body);
  };
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

function rankTracks(
  tracks: CaptionTrackPayload[],
  prefs: { language: string; preferManual: boolean },
): CaptionTrackPayload[] {
  const selected = selectCaptionTrack(tracks, prefs);
  if (!selected) {
    return tracks;
  }
  return [selected, ...tracks.filter((track) => track.baseUrl !== selected.baseUrl)];
}

async function jsonFromTracks(
  tracks: CaptionTrackPayload[],
  prefs: { language: string; preferManual: boolean },
  signal?: AbortSignal,
  timeoutMs = 5000,
): Promise<unknown | null> {
  for (const track of rankTracks(tracks, prefs).slice(0, MAX_TRACK_ATTEMPTS)) {
    if (signal?.aborted) {
      return null;
    }
    const json = await fetchAllowlistedTimedText(track.baseUrl, signal, timeoutMs);
    if (json) {
      return json;
    }
  }
  return null;
}

async function waitForPlayer(signal: AbortSignal, timeoutMs: number): Promise<YTPlayer | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      return null;
    }
    const player = moviePlayer();
    if (player) {
      return player;
    }
    await sleep(80);
  }
  return moviePlayer();
}

async function waitForCapture(
  videoId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<unknown | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      return null;
    }
    const hit = captureMatchesVideo(videoId);
    if (hit) {
      return hit;
    }
    await sleep(80);
  }
  return captureMatchesVideo(videoId);
}

let captionSession = Promise.resolve();

async function withCaptionSession<T>(work: () => Promise<T>): Promise<T> {
  const previous = captionSession;
  let release: () => void = () => undefined;
  captionSession = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function captureViaCaptionNudge(
  videoId: string,
  prefs: { language: string; preferManual: boolean },
  signal: AbortSignal,
): Promise<unknown | null> {
  return withCaptionSession(async () => {
    const player = await waitForPlayer(signal, 2000);
    if (!player || signal.aborted) {
      return null;
    }
    const saved = readSavedCaptionState(player, document);
    const hideFlash = !userWantedCaptionsOn(saved);
    captureHold = true;
    if (hideFlash) {
      hideCaptionFlash(document);
    }
    const selected = selectCaptionTrack(tracksFrom(readPlayerResponse()), prefs);
    const option = captionTrackOptionForLanguage(selected, prefs.language);
    const languageFallbacks = uniqueUrls([
      option.languageCode,
      prefs.language,
      prefs.language.includes('-') ? prefs.language.slice(0, 2) : `${prefs.language}-US`,
    ]).filter((code) => code.length >= 2);

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (signal.aborted) {
          return null;
        }
        const languageCode = languageFallbacks[attempt] ?? option.languageCode;
        await enableCaptionsForCapture(
          player,
          document,
          { ...option, languageCode },
          sleep,
        );
        const hit = await waitForCapture(videoId, signal, 2200 + attempt * 600);
        if (hit) {
          return hit;
        }
        const afterPot = await jsonFromTracks(
          tracksFrom(readPlayerResponse()),
          prefs,
          signal,
          2500,
        );
        if (afterPot) {
          return afterPot;
        }
      }
      return captureMatchesVideo(videoId);
    } finally {
      captureHold = false;
      try {
        await restoreSavedCaptionState(player, document, saved, sleep);
      } finally {
        showCaptionFlash(document);
      }
    }
  });
}

async function acquireFallbackTranscriptNow(payload: unknown): Promise<unknown> {
  fallbackAbort?.abort();
  const abort = new AbortController();
  fallbackAbort = abort;
  const prefs = parseAcquireCaptionPrefs(payload);
  const videoId = parseVideoId(location.href) ?? '';
  const captured = captureMatchesVideo(videoId);
  if (captured) {
    return captured;
  }

  const tryTracks = async (tracks: CaptionTrackPayload[], timeoutMs = 5000) => {
    if (abort.signal.aborted) {
      return null;
    }
    return jsonFromTracks(tracks, prefs, abort.signal, timeoutMs);
  };

  const playerTracks = tracksFrom(readPlayerResponse());
  const fromPlayer = await tryTracks(playerTracks, prefs.nudgeCaptions ? 2000 : 5000);
  if (fromPlayer) {
    return fromPlayer;
  }

  if (prefs.nudgeCaptions && videoId) {
    try {
      const nudged = await captureViaCaptionNudge(videoId, prefs, abort.signal);
      if (nudged) {
        return nudged;
      }
    } catch {
      if (abort.signal.aborted) {
        return null;
      }
    }
  }

  if (videoId) {
    try {
      const android = await innertubePlayer(videoId, 'ANDROID', abort.signal);
      const fromAndroid = await tryTracks(tracksFrom(android));
      if (fromAndroid) {
        return fromAndroid;
      }
    } catch {
      if (abort.signal.aborted) {
        return null;
      }
    }
    try {
      const web = await innertubePlayer(videoId, 'WEB', abort.signal);
      const fromWeb = await tryTracks(tracksFrom(web));
      if (fromWeb) {
        return fromWeb;
      }
    } catch {
      if (abort.signal.aborted) {
        return null;
      }
    }
  }

  if (abort.signal.aborted) {
    return null;
  }
  const fromDom = scrapeDomTranscript();
  if (fromDom) {
    return fromDom;
  }

  if (prefs.nudgeCaptions && videoId && !abort.signal.aborted) {
    try {
      return await captureViaCaptionNudge(videoId, prefs, abort.signal);
    } catch {
      return captureMatchesVideo(videoId);
    }
  }
  return captureMatchesVideo(videoId);
}

async function acquireFallbackTranscript(payload: unknown): Promise<unknown> {
  return acquireFallbackTranscriptNow(payload);
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
      setCaptureEnabled(enabled) {
        captureEnabled = enabled;
        if (!enabled) {
          lastCapture = null;
          fallbackAbort?.abort();
          fallbackAbort = null;
        }
      },
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
      if (captureEnabled && videoId && snapshot.tracks.length > 0) {
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
