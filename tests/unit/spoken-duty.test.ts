import { describe, expect, it } from 'vitest';
import type { SpeechChunk } from '../../src/lib/pacing/curve';
import {
  spokenDutyMultiplier,
  wpmWithSpokenDuty,
  WPM_WINDOW_SEC,
} from '../../src/lib/pacing/spoken-duty';

function chunk(t0: number, t1: number, wEff = 1): SpeechChunk {
  return { t0, t1, t: (t0 + t1) / 2, wEff, wpm: 0 };
}

describe('spoken-time compensation math', () => {
  it('is a no-op when captions already fill the window', () => {
    expect(spokenDutyMultiplier(1, 0.4)).toBeCloseTo(1, 8);
    expect(spokenDutyMultiplier(0.2, 0)).toBe(1);
    expect(spokenDutyMultiplier(0, 1)).toBe(1);
    // ρ=0.2, s=0.5 → (1-s)+s/ρ = 0.5 + 2.5 = 3
    expect(spokenDutyMultiplier(0.2, 0.5)).toBeCloseTo(3, 8);
  });

  it('clamps tiny spoken fractions so 1/ρ cannot explode', () => {
    const atFloor = spokenDutyMultiplier(0.12, 1);
    expect(spokenDutyMultiplier(0.01, 1)).toBeCloseTo(atFloor, 8);
    expect(atFloor).toBeCloseTo(1 / 0.12, 8);
  });

  it('uses words per video-second, not 60/word-duration, when strength is 0', () => {
    const pauseInflated = [
      chunk(0, 0.2, 1),
      chunk(0.2, 1.6, 1),
      chunk(1.6, 1.8, 1),
      chunk(1.8, 2.0, 1),
    ];
    const out = wpmWithSpokenDuty(pauseInflated, 0, WPM_WINDOW_SEC, 20, 800);
    const mid = out[1];
    expect(mid.wpm).toBeGreaterThan(90);
    expect(mid.wpm).toBeLessThan(160);
    expect(mid.wpm).not.toBeCloseTo(60 / 1.4, 0);
  });

  it('raises WPM only when timestamps actually leave holes between words', () => {
    const gapped = Array.from({ length: 12 }, (_, i) => chunk(i, i + 0.2, 1));
    const off = wpmWithSpokenDuty(gapped, 0, WPM_WINDOW_SEC, 20, 800);
    const on = wpmWithSpokenDuty(gapped, 0.5, WPM_WINDOW_SEC, 20, 800);
    expect(off[5].wpm).toBeGreaterThan(50);
    expect(off[5].wpm).toBeLessThan(80);
    expect(on[5].wpm / off[5].wpm).toBeGreaterThan(1.4);
    expect(on[5].wpm).toBeLessThan(250);

    const dense = Array.from({ length: 12 }, (_, i) => {
      const t0 = i * 0.22;
      return chunk(t0, t0 + 0.22, 1);
    });
    const denseOff = wpmWithSpokenDuty(dense, 0, WPM_WINDOW_SEC, 20, 800);
    const denseOn = wpmWithSpokenDuty(dense, 0.5, WPM_WINDOW_SEC, 20, 800);
    expect(denseOn[5].wpm / denseOff[5].wpm).toBeGreaterThan(0.95);
    expect(denseOn[5].wpm / denseOff[5].wpm).toBeLessThan(1.08);
  });

  it('does not invent pauses on abutting slow speech', () => {
    const slow = Array.from({ length: 12 }, (_, i) => chunk(i, i + 1, 1));
    const off = wpmWithSpokenDuty(slow, 0, WPM_WINDOW_SEC, 20, 800);
    const on = wpmWithSpokenDuty(slow, 0.5, WPM_WINDOW_SEC, 20, 800);
    expect(off[5].wpm).toBeCloseTo(60, 0);
    expect(on[5].wpm / off[5].wpm).toBeGreaterThan(0.95);
    expect(on[5].wpm / off[5].wpm).toBeLessThan(1.08);
  });
});
