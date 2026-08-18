import { describe, expect, it } from 'vitest';
import {
  evictCache,
  putCacheEntry,
  emptyCache,
  CACHE_MAX_VIDEOS,
} from '../../src/lib/youtube/cache';
import { parseSettings } from '../../src/lib/settings/defaults';
import { DynamicSpeedSettingsSchema } from '../../src/lib/settings/schema';
import {
  captionSourceChanged,
  speedCalculationChanged,
} from '../../src/lib/settings/diff';
import { isBridgeMessage, isYouTubeOrigin } from '../../src/lib/bridge/protocol';
import { isRuntimeMessage } from '../../src/lib/messaging/protocol';
import {
  forceJson3Url,
  selectCaptionTrack,
  timedTextBelongsToVideo,
  toSafeTimedTextUrl,
  videoIdFromTimedTextUrl,
} from '../../src/lib/transcript/select-track';
import { fromCompactTokens } from '../../src/lib/transcript/compact';
import { parseVideoId, isYouTubeTabUrl } from '../../src/lib/youtube/video-id';

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

describe('compact tokens', () => {
  it('drops malformed cached words', () => {
    const tokens = fromCompactTokens([
      { t0: 0, t1: 1, w: 'ok', s: 1 },
      { t0: Number.NaN, t1: 1, w: 'bad', s: 1 },
      { t0: 2, t1: 1, w: 'backwards', s: 1 },
      { t0: 3, t1: 4, w: '', s: 1 },
    ] as never);
    expect(tokens).toEqual([{ t0: 0, t1: 1, text: 'ok', syllables: 1, jargon: false, meta: false }]);
  });
});

describe('settings schema', () => {
  it('fills defaults', () => {
    const settings = parseSettings({});
    expect(settings.targetWpm).toBe(165);
    expect(settings.fallbackSpeed).toBe(1);
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

  it('does not copy prototype-polluting keys', () => {
    const polluted = JSON.parse('{"targetWpm":180,"__proto__":{"enabled":false}}');
    const settings = parseSettings(polluted);
    expect(settings.targetWpm).toBe(180);
    expect(settings.enabled).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(settings, '__proto__')).toBe(false);
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

describe('settings that change speed', () => {
  it('detects target WPM and engine changes, not chip cosmetics', () => {
    const base = parseSettings({});
    expect(speedCalculationChanged(base, { ...base, targetWpm: 220 })).toBe(true);
    expect(speedCalculationChanged(base, { ...base, bRollAcceleration: true })).toBe(
      true,
    );
    expect(speedCalculationChanged(base, { ...base, showPlayerChip: false })).toBe(
      false,
    );
  });

  it('detects caption source changes that need a new transcript', () => {
    const base = parseSettings({});
    expect(captionSourceChanged(base, { ...base, captionLanguage: 'de' })).toBe(true);
    expect(captionSourceChanged(base, { ...base, targetWpm: 200 })).toBe(false);
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
    expect(isBridgeMessage({ source: 'evil', type: 'DS_EVENT', videoId: 'x', payload: {} })).toBe(
      false,
    );
    expect(
      isBridgeMessage({
        source: 'dynamicspeed-player-bridge',
        type: 'DS_EVENT',
        payload: {},
      }),
    ).toBe(false);
  });

  it('rejects runtime messages that only copy the source field', () => {
    expect(isRuntimeMessage({ source: 'dynamicspeed-runtime', type: 'GET_PAGE_STATE' })).toBe(
      true,
    );
    expect(isRuntimeMessage({ source: 'dynamicspeed-runtime', type: 'EXPLOIT' })).toBe(false);
    expect(isRuntimeMessage({ source: 'dynamicspeed-runtime' })).toBe(false);
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
    expect(
      timedTextBelongsToVideo(
        'https://www.youtube.com/api/timedtext?lang=en',
        'zvCgC1yA7_w',
      ),
    ).toBe(false);
    expect(
      timedTextBelongsToVideo(
        'https://www.youtube.com/api/timedtext?v=zvCgC1yA7_w',
        'zvCgC1yA7_w',
      ),
    ).toBe(true);
    expect(
      timedTextBelongsToVideo(
        'https://www.youtube.com/api/timedtext?v=aaaaaaaaaaa',
        'zvCgC1yA7_w',
      ),
    ).toBe(false);
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
    expect(parseVideoId('https://www.youtube.com/watch?v=short')).toBe(null);
    expect(parseVideoId('https://www.youtube.com/watch?v=<script>alert')).toBe(null);
  });

  it('rejects URLs that only mention youtube.com as a substring', () => {
    expect(isYouTubeTabUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeTabUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      true,
    );
    expect(isYouTubeTabUrl('https://evil.example/youtube.com')).toBe(false);
    expect(isYouTubeTabUrl('https://youtube.com.evil.example/watch')).toBe(false);
    expect(isYouTubeTabUrl('https://notyoutube.com/watch')).toBe(false);
  });
});
