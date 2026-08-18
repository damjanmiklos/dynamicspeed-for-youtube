import { describe, expect, it } from 'vitest';
import { pchipEvaluate, pchipSlopes } from '../../src/lib/pacing/pchip';
import { introRate, slewStep } from '../../src/lib/pacing/slew';
import { isExternalRateChange } from '../../src/lib/youtube/playback';
import { resolveDynamics } from '../../src/lib/pacing/feel';
import { mapWpmToRate } from '../../src/lib/pacing/curve';
import { gaussianSmooth } from '../../src/lib/pacing/gaussian';
import { movingMedian } from '../../src/lib/pacing/median';
import { isJargonWord, countSyllables, normalizeLexeme } from '../../src/lib/pacing/syllables';

describe('PCHIP', () => {
  it('does not overshoot a monotone pair', () => {
    const x = [0, 2];
    const y = [1.2, 1.8];
    const m = pchipSlopes(x, y);
    for (let t = 0; t <= 2; t += 0.1) {
      const value = pchipEvaluate(x, y, m, t);
      expect(value).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(value).toBeLessThanOrEqual(1.8 + 1e-9);
    }
    expect(pchipEvaluate(x, y, m, 0)).toBeCloseTo(1.2, 8);
    expect(pchipEvaluate(x, y, m, 2)).toBeCloseTo(1.8, 8);
  });
});

describe('slew', () => {
  it('respects the per-second cap', () => {
    const next = slewStep(1, 3, 0.5, 0.4);
    expect(next).toBeCloseTo(1.2, 8);
  });

  it('snaps when the delta fits in the window', () => {
    expect(slewStep(1, 1.1, 1, 0.5)).toBeCloseTo(1.1, 8);
  });
});

describe('intro interpolation', () => {
  it('starts at the fallback speed and lands on the target', () => {
    expect(introRate(1, 2, 0, 2)).toBeCloseTo(1, 8);
    expect(introRate(1, 2, 2, 2)).toBeCloseTo(2, 8);
    expect(introRate(1, 2, 4, 2)).toBeCloseTo(2, 8);
  });

  it('is between the endpoints at the midpoint', () => {
    const mid = introRate(1, 2, 1, 2);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(2);
    expect(mid).toBeCloseTo(1.5, 8);
  });
});

describe('external rate changes', () => {
  it('ignores our own writes and tiny rounding', () => {
    expect(isExternalRateChange(1.5, 1.5, 200, 150)).toBe(false);
    expect(isExternalRateChange(1.51, 1.5, 200, 150)).toBe(false);
    expect(isExternalRateChange(1.5, 1.5, 100, 150)).toBe(false);
  });

  it('treats a real YouTube menu change as external', () => {
    expect(isExternalRateChange(2, 1.5, 200, 100)).toBe(true);
  });
});

describe('feel pack', () => {
  it('uses smaller windows and faster slew at high responsiveness', () => {
    const slow = resolveDynamics({
      responsiveness: 0,
      customDynamicsUnlocked: false,
      gaussianSigma: 10,
      medianWindowSec: 5,
      slewRateLimit: 0.3,
    });
    const fast = resolveDynamics({
      responsiveness: 1,
      customDynamicsUnlocked: false,
      gaussianSigma: 10,
      medianWindowSec: 5,
      slewRateLimit: 0.3,
    });
    expect(slow.gaussianSigma).toBeGreaterThan(fast.gaussianSigma);
    expect(slow.medianWindowSec).toBeGreaterThan(fast.medianWindowSec);
    expect(fast.slewRateLimit).toBeGreaterThan(slow.slewRateLimit);
  });
});

describe('rate mapping', () => {
  it('maps 90 WPM to 2× when the target is 180', () => {
    expect(mapWpmToRate(90, 180, 0.5, 3)).toBeCloseTo(2, 8);
  });

  it('maps 360 WPM to 0.5× when the target is 180', () => {
    expect(mapWpmToRate(360, 180, 0.5, 3)).toBeCloseTo(0.5, 8);
  });
});

describe('filters', () => {
  it('median removes an impulse', () => {
    const samples = [
      { t: 0, value: 150 },
      { t: 1, value: 150 },
      { t: 2, value: 400 },
      { t: 3, value: 150 },
      { t: 4, value: 150 },
    ];
    const out = movingMedian(samples, 4);
    expect(out[2].value).toBe(150);
  });

  it('gaussian does not lag a symmetric bump', () => {
    const samples = [
      { t: 0, value: 100 },
      { t: 1, value: 100 },
      { t: 2, value: 200 },
      { t: 3, value: 100 },
      { t: 4, value: 100 },
    ];
    const out = gaussianSmooth(samples, 0.6);
    const peak = out.reduce((best, sample) =>
      sample.value > best.value ? sample : best,
    );
    expect(peak.t).toBe(2);
  });

  it('gaussian does not bleed across separate calls (segments)', () => {
    const left = gaussianSmooth(
      [
        { t: 0, value: 100 },
        { t: 1, value: 100 },
      ],
      8,
    );
    const right = gaussianSmooth(
      [
        { t: 20, value: 300 },
        { t: 21, value: 300 },
      ],
      8,
    );
    expect(left[0].value).toBeCloseTo(100, 6);
    expect(right[0].value).toBeCloseTo(300, 6);
  });
});

describe('jargon', () => {
  it('treats long uncommon words as jargon', () => {
    const word = 'photosynthesis';
    expect(isJargonWord(word, countSyllables(word))).toBe(true);
  });

  it('does not treat easy short words as jargon', () => {
    expect(isJargonWord('because', countSyllables('because'))).toBe(false);
  });

  it('normalizes typographic apostrophes instead of replacing ASCII with itself', () => {
    expect(normalizeLexeme('don’t')).toBe("don't");
    expect(normalizeLexeme("don't")).toBe("don't");
  });
});
