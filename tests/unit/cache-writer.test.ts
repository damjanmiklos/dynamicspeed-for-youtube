import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { TRANSCRIPT_CACHE_KEY } from '../../src/lib/settings/schema';
import {
  applyCacheMutation,
  cacheKey,
  loadTranscriptCache,
  rememberTokens,
  type TranscriptCacheStore,
} from '../../src/lib/youtube/cache';
import { isRuntimeMessage } from '../../src/lib/messaging/protocol';
import type { WordToken } from '../../src/lib/transcript/types';

function tokens(count = 20): WordToken[] {
  return Array.from({ length: count }, (_, i) => ({
    t0: i * 0.4,
    t1: i * 0.4 + 0.4,
    text: `word${i}`,
    syllables: 1,
    jargon: false,
    meta: false,
  }));
}

async function storedKeys(): Promise<string[]> {
  const stored = await fakeBrowser.storage.local.get(TRANSCRIPT_CACHE_KEY);
  const store = stored[TRANSCRIPT_CACHE_KEY] as TranscriptCacheStore | undefined;
  return (store?.entries ?? []).map((entry) => entry.key).sort();
}

describe('caption cache single writer', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    // Stand-in for the background script: apply each mutation in its queue.
    fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
      if (!isRuntimeMessage(message) || message.type !== 'CACHE_MUTATION') {
        return undefined;
      }
      return applyCacheMutation(message.mutation).then(() => ({ ok: true }));
    });
  });

  it('keeps every entry when several tabs save at the same time', async () => {
    const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'];
    await Promise.all(
      ids.map((videoId) =>
        rememberTokens({ videoId, language: 'en', trackKind: 'asr' }, tokens()),
      ),
    );
    expect(await storedKeys()).toEqual(ids.map((id) => cacheKey(id, 'en', 'asr')).sort());
  });

  it('does not write when only reading', async () => {
    const old = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stale: TranscriptCacheStore = {
      entries: [
        {
          key: cacheKey('aaaaaaaaaaa', 'en', 'asr'),
          videoId: 'aaaaaaaaaaa',
          language: 'en',
          trackKind: 'asr',
          savedAt: old,
          bytes: 10,
          tokens: [{ t0: 0, t1: 1, w: 'hi', s: 1 }],
        },
      ],
    };
    await fakeBrowser.storage.local.set({ [TRANSCRIPT_CACHE_KEY]: stale });
    const view = await loadTranscriptCache();
    // Expired entries are hidden from the reader...
    expect(view.entries).toHaveLength(0);
    // ...but only the single writer removes them from storage.
    expect(await storedKeys()).toEqual([cacheKey('aaaaaaaaaaa', 'en', 'asr')]);
    await applyCacheMutation({ kind: 'prune' });
    expect(await storedKeys()).toEqual([]);
  });

  it('rejects malformed put requests', async () => {
    await applyCacheMutation({
      kind: 'put',
      videoId: '../../etc',
      language: 'en',
      trackKind: 'asr',
      tokens: [{ t0: 0, t1: 1, w: 'hi', s: 1 }],
    });
    expect(await storedKeys()).toEqual([]);
  });
});
