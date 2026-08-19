import { describe, expect, it } from 'vitest';
import type { SpeechChunk } from '../../src/lib/pacing/curve';
import {
  ARTICULATION_SEC_PER_WORD,
  estimateVoicedSec,
  excludeLongPauseTails,
  spokenDutyMultiplier,
  wpmWithSpokenDuty,
} from '../../src/lib/pacing/spoken-duty';

function chunk(t0: number, t1: number, wEff = 1): SpeechChunk {
  return { t0, t1, t: (t0 + t1) / 2, wEff, wpm: 0 };
}

describe('spoken-time compensation math', () => {
  it('treats extra caption duration beyond ~0.2s/word as a pause', () => {
    expect(ARTICULATION_SEC_PER_WORD).toBeCloseTo(0.2, 6);
    expect(estimateVoicedSec(1, 1)).toBeCloseTo(0.2, 5);
    expect(estimateVoicedSec(1, 0.18)).toBeCloseTo(0.18, 5);
    expect(estimateVoicedSec(1, 0.25)).toBeCloseTo(0.25, 5);
  });

  it('blends measured WPM toward articulation WPM in rate space', () => {
    expect(spokenDutyMultiplier(1, 0.4)).toBeCloseTo(1, 8);
    expect(spokenDutyMultiplier(0.2, 0)).toBe(1);
    expect(spokenDutyMultiplier(0, 1)).toBe(1);
    // ρ=0.2, s=0.5 → (1-s)+s/ρ = 0.5 + 2.5 = 3 → 60 WPM becomes 180
    expect(spokenDutyMultiplier(0.2, 0.5)).toBeCloseTo(3, 8);
  });

  it('clamps tiny spoken fractions so 1/ρ cannot explode', () => {
    const atFloor = spokenDutyMultiplier(0.12, 1);
    expect(spokenDutyMultiplier(0.01, 1)).toBeCloseTo(atFloor, 8);
    expect(atFloor).toBeCloseTo(1 / 0.12, 8);
  });

  it('trims only tails longer than the long-pause threshold', () => {
    const shortTail = excludeLongPauseTails([chunk(0, 1, 1)], 1.8);
    expect(shortTail[0].t1).toBeCloseTo(1, 5);
    const longTail = excludeLongPauseTails([chunk(0, 5, 1)], 1.8);
    expect(longTail[0].t1).toBeCloseTo(0.2, 5);
  });

  it('raises WPM on list-like tokens and leaves packed speech nearly unchanged', () => {
    const listing = Array.from({ length: 8 }, (_, i) => chunk(i, i + 1, 1));
    const off = wpmWithSpokenDuty(listing, 0, 6, 60, 450);
    const partial = wpmWithSpokenDuty(listing, 0.5, 6, 60, 450);
    expect(off[3].wpm).toBeCloseTo(60, 5);
    expect(partial[3].wpm).toBeGreaterThan(140);
    expect(partial[3].wpm).toBeLessThan(220);

    const dense = Array.from({ length: 8 }, (_, i) => {
      const t0 = i * 0.22;
      return chunk(t0, t0 + 0.2, 1);
    });
    const denseOff = wpmWithSpokenDuty(dense, 0, 6, 60, 450);
    const denseOn = wpmWithSpokenDuty(dense, 0.5, 6, 60, 450);
    expect(denseOn[3].wpm / denseOff[3].wpm).toBeGreaterThan(0.95);
    expect(denseOn[3].wpm / denseOff[3].wpm).toBeLessThan(1.08);
  });
});
