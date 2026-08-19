import { describe, expect, it } from 'vitest';
import {
  buildSpeedCurve,
  mergeShortChunks,
  rateAt,
  type CurveBuildOptions,
} from '../../src/lib/pacing/curve';
import type { WordToken } from '../../src/lib/transcript/types';
import { parseJson3 } from '../../src/lib/transcript/parse-json3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const options = (overrides: Partial<CurveBuildOptions> = {}): CurveBuildOptions => ({
  targetWpm: 180,
  minSpeed: 0.75,
  maxSpeed: 3,
  minChunkSec: 0.1,
  wpmFloor: 60,
  wpmCeil: 450,
  longPauseSec: 1.8,
  bRollAcceleration: false,
  treatMusicAsBRoll: true,
  syllableWeighting: true,
  jargonCompensation: 1.15,
  spokenDutyStrength: 0,
  gaussianSigma: 4,
  medianWindowSec: 3,
  slewRateLimit: 0.4,
  ...overrides,
});

function token(
  t0: number,
  t1: number,
  text: string,
  extra: Partial<WordToken> = {},
): WordToken {
  return {
    t0,
    t1,
    text,
    syllables: 1,
    jargon: false,
    meta: false,
    ...extra,
  };
}

function assertFiniteCurve(tokens: WordToken[], opts = options()) {
  const curve = buildSpeedCurve(tokens, opts);
  expect(curve.knotR.every((value) => Number.isFinite(value))).toBe(true);
  expect(curve.knotR.some((value) => Number.isNaN(value))).toBe(false);
  for (let t = 0; t <= curve.duration; t += 0.25) {
    const rate = rateAt(curve, t);
    expect(Number.isFinite(rate)).toBe(true);
    expect(rate).toBeGreaterThanOrEqual(opts.minSpeed - 1e-6);
    expect(rate).toBeLessThanOrEqual(opts.maxSpeed + 1e-6);
  }
  return curve;
}

describe('speed curve', () => {
  it('stays inside min/max for a lecture-like token stream', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 40; i += 1) {
      tokens.push(token(i * 0.4, i * 0.4 + 0.35, 'word'));
    }
    assertFiniteCurve(tokens);
  });

  it('does not glue typical spoken words at the 0.1s default', () => {
    const tokens = [
      token(0, 0.22, 'so'),
      token(0.22, 0.44, 'you'),
      token(0.44, 0.88, 'remember', { syllables: 3 }),
    ];
    const opts = { syllableWeighting: true, jargonCompensation: 1.15 };
    expect(mergeShortChunks(tokens, 0.1, opts)).toHaveLength(3);
    expect(mergeShortChunks(tokens, 0.3, opts).length).toBeLessThan(3);
  });

  it('returns a finite 1× curve for empty captions', () => {
    const curve = assertFiniteCurve([], options({ durationHint: 10 }));
    expect(rateAt(curve, 0)).toBeCloseTo(1, 5);
    expect(rateAt(curve, 5)).toBeCloseTo(1, 5);
  });

  it('does not spike to max during a pause when b-roll is off', () => {
    const tokens = [
      token(0, 1, 'hello', { syllables: 2 }),
      token(1.2, 2.2, 'there', { syllables: 1 }),
      token(8, 9, 'later', { syllables: 2 }),
      token(9.2, 10.2, 'on', { syllables: 1 }),
    ];
    const curve = buildSpeedCurve(tokens, options({ bRollAcceleration: false, maxSpeed: 3 }));
    const before = rateAt(curve, 1.5);
    const during = rateAt(curve, 5);
    const after = rateAt(curve, 9.5);
    const lo = Math.min(before, after);
    const hi = Math.max(before, after);
    expect(during).toBeGreaterThanOrEqual(lo - 0.05);
    expect(during).toBeLessThanOrEqual(hi + 0.05);
    expect(during).toBeLessThan(3);
  });

  it('heads toward max speed in a long pause when b-roll is on', () => {
    const tokens = [
      token(0, 1, 'hello', { syllables: 2 }),
      token(10, 11, 'later', { syllables: 2 }),
    ];
    const curve = buildSpeedCurve(tokens, options({ bRollAcceleration: true, maxSpeed: 3 }));
    expect(rateAt(curve, 5)).toBeGreaterThan(2.2);
  });

  it('uses [Music] as b-roll without a per-chunk scan of every token', () => {
    const tokens = [
      token(0, 1, 'hello', { syllables: 2 }),
      token(1.1, 2.1, 'there', { syllables: 1 }),
      token(2.2, 3.4, '[Music]', { meta: true, syllables: 0 }),
      token(3.5, 4.5, 'later', { syllables: 2 }),
    ];
    const curve = buildSpeedCurve(
      tokens,
      options({
        bRollAcceleration: true,
        treatMusicAsBRoll: true,
        maxSpeed: 3,
        longPauseSec: 1.8,
      }),
    );
    expect(rateAt(curve, 2.8)).toBeGreaterThan(2.2);
  });

  it('builds a multi-hour-length token stream quickly', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 12_000; i += 1) {
      const t0 = i * 0.22;
      tokens.push(token(t0, t0 + 0.18, 'word'));
    }
    const started = Date.now();
    assertFiniteCurve(tokens, options({ bRollAcceleration: false }));
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('ignores music meta when computing speech WPM', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../testdata/json3');
    const json = JSON.parse(readFileSync(join(dir, 'music-and-speech.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: true });
    assertFiniteCurve(tokens, options({ bRollAcceleration: false }));
  });

  it('slows list-like sparse words when spoken-time compensation is on', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 10; i += 1) {
      tokens.push(token(i, i + 1, 'item'));
    }
    const sparseOpts = {
      syllableWeighting: false,
      gaussianSigma: 1,
      medianWindowSec: 1,
      targetWpm: 180,
      maxSpeed: 3,
      wpmFloor: 60,
    };
    const off = buildSpeedCurve(tokens, options({ ...sparseOpts, spokenDutyStrength: 0 }));
    const on = buildSpeedCurve(tokens, options({ ...sparseOpts, spokenDutyStrength: 0.5 }));
    const offRate = rateAt(off, 4.5);
    const onRate = rateAt(on, 4.5);
    expect(offRate).toBeGreaterThan(2.4);
    expect(onRate).toBeLessThan(offRate - 0.6);
    expect(onRate).toBeLessThan(1.4);
  });

  it('does not speed through a long pause when compensation is on and b-roll is off', () => {
    const tokens = [
      token(0, 1, 'hello', { syllables: 2 }),
      token(1.2, 2.2, 'there', { syllables: 1 }),
      token(8, 9, 'later', { syllables: 2 }),
      token(9.2, 10.2, 'on', { syllables: 1 }),
    ];
    const curve = buildSpeedCurve(
      tokens,
      options({ bRollAcceleration: false, maxSpeed: 3, spokenDutyStrength: 0.5 }),
    );
    const before = rateAt(curve, 1.5);
    const during = rateAt(curve, 5);
    const after = rateAt(curve, 9.5);
    const lo = Math.min(before, after);
    const hi = Math.max(before, after);
    expect(during).toBeGreaterThanOrEqual(lo - 0.08);
    expect(during).toBeLessThanOrEqual(hi + 0.08);
    expect(during).toBeLessThan(3);
  });

  it('still heads toward max speed in a long pause when b-roll is on', () => {
    const tokens = [
      token(0, 1, 'hello', { syllables: 2 }),
      token(10, 11, 'later', { syllables: 2 }),
    ];
    const curve = buildSpeedCurve(
      tokens,
      options({ bRollAcceleration: true, maxSpeed: 3, spokenDutyStrength: 0.5 }),
    );
    expect(rateAt(curve, 5)).toBeGreaterThan(2.2);
  });
});

describe('property: random token streams', () => {
  it('never emits NaN or out-of-range rates', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      let t = 0;
      const tokens: WordToken[] = [];
      for (let i = 0; i < 30; i += 1) {
        const dur = 0.2 + ((seed * i) % 7) * 0.11;
        const gap = (seed * i) % 5 === 0 ? 2.4 : 0.08;
        t += gap;
        tokens.push(token(t, t + dur, `w${i}`, { syllables: 1 + (i % 4) }));
        t += dur;
      }
      assertFiniteCurve(
        tokens,
        options({
          bRollAcceleration: seed % 2 === 0,
          spokenDutyStrength: seed % 3 === 0 ? 0.5 : 0,
        }),
      );
    }
  });
});
