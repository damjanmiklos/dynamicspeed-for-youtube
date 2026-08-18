import { TRANSCRIPT_CACHE_KEY } from '../settings/schema';
import {
  estimateTokenBytes,
  fromCompactTokens,
  toCompactTokens,
} from '../transcript/compact';
import type { CompactWordToken, WordToken } from '../transcript/types';

export const CACHE_BYTE_BUDGET = 4 * 1024 * 1024;
export const CACHE_MAX_VIDEOS = 15;

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

export function memorySet(key: string, tokens: WordToken[]): void {
  memory.set(key, tokens);
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

export function getCacheEntry(
  store: TranscriptCacheStore,
  key: string,
): TranscriptCacheEntry | null {
  return store.entries.find((entry) => entry.key === key) ?? null;
}

export async function loadTranscriptCache(): Promise<TranscriptCacheStore> {
  const { browser } = await import('wxt/browser');
  const stored = await browser.storage.local.get(TRANSCRIPT_CACHE_KEY);
  const value = stored[TRANSCRIPT_CACHE_KEY] as TranscriptCacheStore | undefined;
  if (!value || !Array.isArray(value.entries)) {
    return emptyCache();
  }
  const entries = value.entries.filter(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.key === 'string' &&
      typeof entry.videoId === 'string' &&
      Array.isArray(entry.tokens),
  );
  return evictCache({ entries });
}

export async function saveTranscriptCache(
  store: TranscriptCacheStore,
): Promise<void> {
  const { browser } = await import('wxt/browser');
  await browser.storage.local.set({ [TRANSCRIPT_CACHE_KEY]: evictCache(store) });
}

export async function clearTranscriptCache(): Promise<void> {
  memory.clear();
  const { browser } = await import('wxt/browser');
  await browser.storage.local.remove(TRANSCRIPT_CACHE_KEY);
}

export async function rememberTokens(
  keyParts: { videoId: string; language: string; trackKind: string },
  tokens: WordToken[],
): Promise<void> {
  const key = cacheKey(keyParts.videoId, keyParts.language, keyParts.trackKind);
  memorySet(key, tokens);
  const store = await loadTranscriptCache();
  const next = putCacheEntry(store, {
    key,
    videoId: keyParts.videoId,
    language: keyParts.language,
    trackKind: keyParts.trackKind,
    tokens: toCompactTokens(tokens),
  });
  await saveTranscriptCache(next);
}

export async function recallTokens(
  keyParts: { videoId: string; language: string; trackKind: string },
): Promise<WordToken[] | null> {
  const key = cacheKey(keyParts.videoId, keyParts.language, keyParts.trackKind);
  const hot = memoryGet(key);
  if (hot) {
    return hot;
  }
  const store = await loadTranscriptCache();
  const entry = getCacheEntry(store, key);
  if (!entry) {
    return null;
  }
  const tokens = fromCompactTokens(entry.tokens);
  memorySet(key, tokens);
  return tokens;
}
