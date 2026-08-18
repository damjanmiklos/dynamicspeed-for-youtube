import { describe, expect, it } from 'vitest';
import {
  evictCache,
  putCacheEntry,
  emptyCache,
  CACHE_MAX_VIDEOS,
} from '../../src/lib/youtube/cache';
import { parseSettings } from '../../src/lib/settings/defaults';
import { DynamicSpeedSettingsSchema } from '../../src/lib/settings/schema';
import { isBridgeMessage, isYouTubeOrigin } from '../../src/lib/bridge/protocol';
import {
  forceJson3Url,
  selectCaptionTrack,
  toSafeTimedTextUrl,
  videoIdFromTimedTextUrl,
} from '../../src/lib/transcript/select-track';
import { parseVideoId } from '../../src/lib/youtube/video-id';

describe('transcript LRU cache', () => {
  it('evicts oldest entries when over the video cap', () => {
    let store = emptyCache();
    for (let i = 0; i < CACHE_MAX_VIDEOS + 3; i += 1) {
      store = putCacheEntry(store, {
        key: `v${i}:en:asr`,
        videoId: `v${i}`,
        language: 'en',
        trackKind: 'asr',
        tokens: [{ t0: 0, t1: 1, w: 'hi', s: 1 }],
        savedAt: i,
      });
    }
    expect(store.entries.length).toBe(CACHE_MAX_VIDEOS);
    expect(store.entries.some((entry) => entry.videoId === 'v0')).toBe(false);
  });

  it('evicts by byte budget', () => {
    const bulky = Array.from({ length: 50 }, (_, i) => ({
      t0: i,
      t1: i + 1,
      w: 'word'.repeat(20),
      s: 1,
    }));
    let store = emptyCache();
    store = putCacheEntry(store, {
      key: 'a:en:asr',
      videoId: 'a',
      language: 'en',
      trackKind: 'asr',
      tokens: bulky,
      savedAt: 1,
    });
    store = putCacheEntry(store, {
      key: 'b:en:asr',
      videoId: 'b',
      language: 'en',
      trackKind: 'asr',
      tokens: bulky,
      savedAt: 2,
    });
    const evicted = evictCache(store, 2000, 15);
    expect(evicted.entries.length).toBeLessThanOrEqual(1);
  });
});

describe('settings schema', () => {
  it('fills defaults', () => {
    const settings = parseSettings({});
    expect(settings.targetWpm).toBe(165);
    expect(settings.minSpeed).toBeLessThan(settings.maxSpeed);
  });

  it('rejects inverted speeds by repairing them', () => {
    const settings = parseSettings({ minSpeed: 2, maxSpeed: 1 });
    expect(settings.minSpeed).toBeLessThan(settings.maxSpeed);
  });

  it('ignores unknown keys', () => {
    const settings = parseSettings({ targetWpm: 200, extra: true });
    expect(settings.targetWpm).toBe(200);
    expect('extra' in settings).toBe(false);
  });

  it('fails when min equals max', () => {
    const parsed = DynamicSpeedSettingsSchema.safeParse({
      ...parseSettings({}),
      minSpeed: 2,
      maxSpeed: 2,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('bridge guards', () => {
  it('accepts only the DynamicSpeed source', () => {
    expect(
      isBridgeMessage({
        source: 'dynamicspeed-player-bridge',
        type: 'DS_EVENT',
        videoId: 'x',
        payload: {},
      }),
    ).toBe(true);
    expect(
      isBridgeMessage({
        source: 'evil',
        type: 'DS_EVENT',
        videoId: 'x',
        payload: {},
      }),
    ).toBe(false);
  });

  it('accepts YouTube origins', () => {
    expect(isYouTubeOrigin('https://www.youtube.com')).toBe(true);
    expect(isYouTubeOrigin('https://evil.example')).toBe(false);
    expect(isYouTubeOrigin('https://evil.youtube.com')).toBe(false);
  });
});

describe('caption URL + track pick', () => {
  it('replaces fmt instead of appending a second one', () => {
    const url = forceJson3Url('https://www.youtube.com/api/timedtext?v=a&fmt=srv3');
    expect(url.match(/fmt=/g)?.length).toBe(1);
    expect(url).toContain('fmt=json3');
  });

  it('rejects non-timedtext and off-site caption URLs', () => {
    expect(() =>
      forceJson3Url('https://evil.example/api/timedtext?v=a'),
    ).toThrow();
    expect(() =>
      forceJson3Url('https://www.youtube.com/watch?v=a'),
    ).toThrow();
    expect(() => forceJson3Url('javascript:alert(1)')).toThrow();
    expect(
      toSafeTimedTextUrl('https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ'),
    ).toContain('/api/timedtext');
    expect(
      toSafeTimedTextUrl('https://user:pass@www.youtube.com/api/timedtext?v=a'),
    ).toBeNull();
    expect(
      videoIdFromTimedTextUrl(
        'https://www.youtube.com/api/timedtext?v=zvCgC1yA7_w&lang=en',
      ),
    ).toBe('zvCgC1yA7_w');
  });

  it('prefers matching manual tracks', () => {
    const track = selectCaptionTrack(
      [
        { baseUrl: 'a', languageCode: 'es', kind: 'asr' },
        { baseUrl: 'b', languageCode: 'en', kind: 'asr' },
        { baseUrl: 'c', languageCode: 'en' },
      ],
      { language: 'en', preferManual: true },
    );
    expect(track?.baseUrl).toBe('c');
  });
});

describe('video id parser', () => {
  it('reads watch, shorts, and embed URLs', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe(
      'abcdefghijk',
    );
    expect(parseVideoId('https://www.youtube.com/embed/abcdefghijk')).toBe(
      'abcdefghijk',
    );
  });
});
