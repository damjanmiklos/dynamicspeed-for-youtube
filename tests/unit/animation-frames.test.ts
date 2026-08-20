import { describe, expect, it } from 'vitest';
import { json3LooksLikeAnimationFrames } from '../../src/lib/transcript/animation-frames';

function frames(count: number, text: string, durationMs = 50, startMs = 0) {
  return Array.from({ length: count }, (_, index) => ({
    tStartMs: startMs + index * durationMs,
    dDurationMs: durationMs,
    segs: [{ utf8: index % 3 === 0 ? `${text}\u200b` : text }],
  }));
}

describe('json3LooksLikeAnimationFrames', () => {
  it('detects rapid identical karaoke redraws', () => {
    expect(
      json3LooksLikeAnimationFrames({
        events: frames(48, 'YouTube will soon be making a weird and dumb update'),
      }),
    ).toBe(true);
  });

  it('does not flag ordinary long-duration caption cues', () => {
    const events = Array.from({ length: 48 }, (_, index) => ({
      tStartMs: index * 2000,
      dDurationMs: 2200,
      segs: [{ utf8: `unique line number ${index} about something else` }],
    }));
    expect(json3LooksLikeAnimationFrames({ events })).toBe(false);
  });

  it('does not flag a short rolling-window document', () => {
    expect(
      json3LooksLikeAnimationFrames({
        events: [
          {
            tStartMs: 0,
            dDurationMs: 4000,
            segs: [{ utf8: 'hello world how are you' }],
          },
          {
            tStartMs: 2000,
            dDurationMs: 4000,
            segs: [{ utf8: 'how are you doing today' }],
          },
        ],
      }),
    ).toBe(false);
  });

  it('detects word-by-word short frames even when consecutive text is not a prefix', () => {
    const words =
      'YouTube will soon be making a weird and dumb update to the site although not'.split(
        ' ',
      );
    const events = Array.from({ length: 48 }, (_, index) => ({
      tStartMs: index * 50,
      dDurationMs: 50,
      segs: [{ utf8: words[index % words.length] }],
    }));
    expect(json3LooksLikeAnimationFrames({ events })).toBe(true);
  });
});
