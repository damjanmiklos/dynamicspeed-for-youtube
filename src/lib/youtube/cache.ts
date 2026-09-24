import { loadSettings } from '../settings/storage';
import { TRANSCRIPT_CACHE_KEY } from '../settings/schema';
import {
  estimateTokenBytes,
  fromCompactTokens,
  toCompactTokens,
} from '../transcript/compact';
import type { CompactWordToken, WordToken } from '../transcript/types';
import { MAX_TOKENS } from '../transcript/limits';
import { RUNTIME_SOURCE } from '../messaging/protocol';

export const CACHE_BYTE_BUDGET = 4 * 1024 * 1024;
export const CACHE_MAX_VIDEOS = 15;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TOUCH_MIN_MS = 12 * 60 * 60 * 1000;

export type TranscriptCacheEntry = {
  key: string;
  videoId: string;
  language: string;
  trackKind: string;
  savedAt: number;
  bytes: number;
  tokens: CompactWordToken[];
};

export type TranscriptCacheStore = {
  entries: TranscriptCacheEntry[];
};

const memory = new Map<string, WordToken[]>();

export function cacheKey(videoId: string, language: string, trackKind: string): string {
  return `${videoId}:${language}:${trackKind}`;
}

export function memoryGet(key: string): WordToken[] | null {
  return memory.get(key) ?? null;
}

/** Per-tab LRU of parsed tokens; evictions now happen in the background. */
export function memorySet(key: string, tokens: WordToken[]): void {
  memory.delete(key);
  memory.set(key, tokens);
  while (memory.size > CACHE_MAX_VIDEOS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    memory.delete(oldest);
  }
}

export function emptyCache(): TranscriptCacheStore {
  return { entries: [] };
}

export function evictCache(
  store: TranscriptCacheStore,
  byteBudget = CACHE_BYTE_BUDGET,
  maxVideos = CACHE_MAX_VIDEOS,
): TranscriptCacheStore {
  const entries = [...store.entries].sort((a, b) => a.savedAt - b.savedAt);
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  while (
    entries.length > 0 &&
    (entries.length > maxVideos || bytes > byteBudget)
  ) {
    const removed = entries.shift();
    if (removed) {
      bytes -= removed.bytes;
    }
  }
  return { entries };
}

export function putCacheEntry(
  store: TranscriptCacheStore,
  entry: Omit<TranscriptCacheEntry, 'bytes' | 'savedAt'> & {
    bytes?: number;
    savedAt?: number;
  },
): TranscriptCacheStore {
  const tokens = entry.tokens;
  const next: TranscriptCacheEntry = {
    ...entry,
    bytes: entry.bytes ?? estimateTokenBytes(tokens),
    savedAt: entry.savedAt ?? Date.now(),
  };
  const without = store.entries.filter((item) => item.key !== next.key);
  return evictCache({ entries: [...without, next] });
}

export function expireCache(
  store: TranscriptCacheStore,
  now = Date.now(),
  maxAgeMs = CACHE_MAX_AGE_MS,
): TranscriptCacheStore {
  const cutoff = now - maxAgeMs;
  return {
    entries: store.entries.filter(
      (entry) => Number.isFinite(entry.savedAt) && entry.savedAt > cutoff,
    ),
  };
}

export function touchCacheEntry(
  store: TranscriptCacheStore,
  key: string,
  now = Date.now(),
): TranscriptCacheStore {
  let changed = false;
  const entries = store.entries.map((entry) => {
    if (entry.key !== key) {
      return entry;
    }
    changed = true;
    return { ...entry, savedAt: now };
  });
  return changed ? { entries } : store;
}

export function getCacheEntry(
  store: TranscriptCacheStore,
  key: string,
): TranscriptCacheEntry | null {
  return store.entries.find((entry) => entry.key === key) ?? null;
}

export function formatCacheBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function utf8JsonBytes(value: unknown): number {
  if (value == null) {
    return 0;
  }
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export async function measureTranscriptCacheUsage(): Promise<{
  bytes: number;
  videos: number;
}> {
  const store = await loadTranscriptCache();
  const videos = store.entries.length;
  const { browser } = await import('wxt/browser');
  try {
    const area = browser.storage.local as {
      getBytesInUse?: (keys?: string | string[]) => Promise<number>;
    };
    if (typeof area.getBytesInUse === 'function') {
      const bytes = await area.getBytesInUse(TRANSCRIPT_CACHE_KEY);
      if (Number.isFinite(bytes) && bytes >= 0) {
        return { bytes, videos };
      }
    }
  } catch {
    // Firefox and some test environments omit getBytesInUse.
  }
  const stored = await browser.storage.local.get(TRANSCRIPT_CACHE_KEY);
  return { bytes: utf8JsonBytes(stored[TRANSCRIPT_CACHE_KEY]), videos };
}

function readCacheStore(value: unknown): TranscriptCacheStore {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as TranscriptCacheStore).entries)
  ) {
    return emptyCache();
  }
  const entries = (value as TranscriptCacheStore).entries.filter(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.key === 'string' &&
      typeof entry.videoId === 'string' &&
      Array.isArray(entry.tokens),
  );
  return { entries };
}

function cacheSignature(store: TranscriptCacheStore): string {
  return store.entries
    .map((entry) => `${entry.key}:${entry.savedAt}`)
    .sort()
    .join('|');
}

function forgetDropped(
  before: TranscriptCacheStore,
  after: TranscriptCacheStore,
): void {
  const keep = new Set(after.entries.map((entry) => entry.key));
  for (const entry of before.entries) {
    if (!keep.has(entry.key)) {
      memory.delete(entry.key);
    }
  }
}

async function applyCachePolicy(
  store: TranscriptCacheStore,
  now = Date.now(),
  expire?: boolean,
): Promise<TranscriptCacheStore> {
  const budgeted = evictCache(store);
  const shouldExpire =
    expire ?? (await loadSettings()).expireCaptionCacheAfterWeek;
  return shouldExpire ? expireCache(budgeted, now) : budgeted;
}

async function persistTranscriptCache(
  store: TranscriptCacheStore,
): Promise<void> {
  const { browser } = await import('wxt/browser');
  if (store.entries.length === 0) {
    await browser.storage.local.remove(TRANSCRIPT_CACHE_KEY);
    return;
  }
  await browser.storage.local.set({ [TRANSCRIPT_CACHE_KEY]: store });
}

/**
 * Read-only view with eviction/expiry applied in memory. It never writes:
 * every write goes through the single writer below, so a tab that only
 * reads cannot clobber another tab's fresh entry.
 */
export async function loadTranscriptCache(): Promise<TranscriptCacheStore> {
  const { browser } = await import('wxt/browser');
  const stored = await browser.storage.local.get(TRANSCRIPT_CACHE_KEY);
  const raw = readCacheStore(stored[TRANSCRIPT_CACHE_KEY]);
  const next = await applyCachePolicy(raw);
  forgetDropped(raw, next);
  return next;
}

export type CacheMutation =
  | {
      kind: 'put';
      videoId: string;
      language: string;
      trackKind: string;
      tokens: CompactWordToken[];
    }
  | { kind: 'touch'; key: string }
  | { kind: 'prune'; expire?: boolean }
  | { kind: 'clear' };

let mutationQueue: Promise<unknown> = Promise.resolve();

/**
 * Apply one read-modify-write to the shared cache key, strictly one at a
 * time. The background runs these for every tab and extension page; two tabs
 * writing the whole store at once used to drop one tab's entry.
 */
export function applyCacheMutation(mutation: CacheMutation): Promise<void> {
  const run = mutationQueue.then(() => runCacheMutation(mutation));
  mutationQueue = run.catch(() => undefined);
  return run;
}

async function runCacheMutation(mutation: CacheMutation): Promise<void> {
  const { browser } = await import('wxt/browser');
  if (mutation.kind === 'clear') {
    memory.clear();
    await browser.storage.local.remove(TRANSCRIPT_CACHE_KEY);
    return;
  }
  const stored = await browser.storage.local.get(TRANSCRIPT_CACHE_KEY);
  const raw = readCacheStore(stored[TRANSCRIPT_CACHE_KEY]);
  let changed = raw;
  if (mutation.kind === 'put') {
    const { videoId, language, trackKind } = mutation;
    if (
      !/^[\w-]{11}$/.test(videoId) ||
      typeof language !== 'string' ||
      language.length < 2 ||
      language.length > 16 ||
      typeof trackKind !== 'string' ||
      trackKind.length === 0 ||
      trackKind.length > 24 ||
      !Array.isArray(mutation.tokens) ||
      mutation.tokens.length > MAX_TOKENS
    ) {
      return;
    }
    const tokens = toCompactTokens(fromCompactTokens(mutation.tokens));
    if (tokens.length === 0) {
      return;
    }
    changed = putCacheEntry(raw, {
      key: cacheKey(videoId, language, trackKind),
      videoId,
      language,
      trackKind,
      tokens,
    });
  } else if (mutation.kind === 'touch') {
    if (typeof mutation.key !== 'string' || mutation.key.length > 64) {
      return;
    }
    changed = touchCacheEntry(raw, mutation.key);
  }
  const next = await applyCachePolicy(
    changed,
    Date.now(),
    mutation.kind === 'prune' ? mutation.expire : undefined,
  );
  forgetDropped(raw, next);
  if (cacheSignature(raw) !== cacheSignature(next)) {
    await persistTranscriptCache(next);
  }
}

/** Hand a write to the background (the single writer); run it here if it is unreachable. */
async function requestCacheMutation(mutation: CacheMutation): Promise<void> {
  const { browser } = await import('wxt/browser');
  try {
    const response = (await browser.runtime.sendMessage({
      source: RUNTIME_SOURCE,
      type: 'CACHE_MUTATION',
      mutation,
    })) as { ok?: unknown } | undefined;
    if (response?.ok === true) {
      return;
    }
  } catch {
    // No background listener (tests, or the extension is reloading).
  }
  await applyCacheMutation(mutation);
}

export async function pruneExpiredTranscriptCache(expire?: boolean): Promise<void> {
  await requestCacheMutation({ kind: 'prune', expire });
}

export async function clearTranscriptCache(): Promise<void> {
  memory.clear();
  await requestCacheMutation({ kind: 'clear' });
}

export async function rememberTokens(
  keyParts: { videoId: string; language: string; trackKind: string },
  tokens: WordToken[],
): Promise<void> {
  const key = cacheKey(keyParts.videoId, keyParts.language, keyParts.trackKind);
  memorySet(key, tokens);
  await requestCacheMutation({
    kind: 'put',
    videoId: keyParts.videoId,
    language: keyParts.language,
    trackKind: keyParts.trackKind,
    tokens: toCompactTokens(tokens),
  });
}

export async function recallTokens(
  keyParts: { videoId: string; language: string; trackKind: string },
): Promise<WordToken[] | null> {
  const key = cacheKey(keyParts.videoId, keyParts.language, keyParts.trackKind);
  const store = await loadTranscriptCache();
  const entry = getCacheEntry(store, key);
  if (!entry) {
    memory.delete(key);
    return null;
  }
  const tokens = memoryGet(key) ?? fromCompactTokens(entry.tokens);
  memorySet(key, tokens);
  if (Date.now() - entry.savedAt >= CACHE_TOUCH_MIN_MS) {
    void requestCacheMutation({ kind: 'touch', key }).catch(() => undefined);
  }
  return tokens;
}
