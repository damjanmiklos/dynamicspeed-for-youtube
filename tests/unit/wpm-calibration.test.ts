import { describe, expect, it } from 'vitest';
import { buildSpeedCurve, wpmAt, type CurveBuildOptions } from '../../src/lib/pacing/curve';
import type { WordToken } from '../../src/lib/transcript/types';
import {
  JARGON_WEIGHT_SHARE,
  SYLLABLE_WEIGHTING_CALIBRATION,
  jargonCalibration,
  spokenDutyCalibration,
  wpmAdjustmentCalibration,
  wpmAdjustmentsActive,
} from '../../src/lib/pacing/wpm-calibration';

const options = (overrides: Partial<CurveBuildOptions> = {}): CurveBuildOptions => ({
  targetWpm: 165,
  minSpeed: 0.75,
  maxSpeed: 3,
  minChunkSec: 0.1,
  wpmFloor: 60,
  wpmCeil: 450,
  longPauseSec: 1.8,
  bRollAcceleration: false,
  treatMusicAsBRoll: true,
  syllableWeighting: false,
  jargonCompensation: 1,
  spokenDutyStrength: 0,
  gaussianSigma: 2,
  medianWindowSec: 1,
  slewRateLimit: 0.4,
  ...overrides,
});

function token(t0: number, t1: number, text: string, extra: Partial<WordToken> = {}): WordToken {
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

describe('wpm adjustment calibration', () => {
  it('is identity when every compensation is off', () => {
    expect(
      wpmAdjustmentCalibration({
        syllableWeighting: false,
        jargonCompensation: 1,
        spokenDutyStrength: 0,
      }),
    ).toBe(1);
    expect(
      wpmAdjustmentsActive({
        syllableWeighting: false,
        jargonCompensation: 1,
        spokenDutyStrength: 0,
      }),
    ).toBe(false);
  });

  it('scales with each tool and with slider strength', () => {
    expect(
      wpmAdjustmentCalibration({
        syllableWeighting: true,
        jargonCompensation: 1,
        spokenDutyStrength: 0,
      }),
    ).toBeCloseTo(SYLLABLE_WEIGHTING_CALIBRATION, 8);
    expect(jargonCalibration(1)).toBe(1);
    expect(jargonCalibration(1.15)).toBeCloseTo(1 + 0.15 * JARGON_WEIGHT_SHARE, 8);
    expect(spokenDutyCalibration(0)).toBe(1);
    expect(spokenDutyCalibration(1)).toBe(1);
    expect(spokenDutyCalibration(0.4)).toBe(1);
    expect(wpmAdjustmentCalibration({
      syllableWeighting: false,
      jargonCompensation: 1,
      spokenDutyStrength: 0.8,
    })).toBe(1);
    expect(
      wpmAdjustmentsActive({
        syllableWeighting: false,
        jargonCompensation: 1,
        spokenDutyStrength: 0.4,
      }),
    ).toBe(true);
  });

  it('does not pull abutting slow speech toward a fake articulation rate', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 12; i += 1) {
      tokens.push(token(i, i + 1, 'item'));
    }
    const raw = buildSpeedCurve(tokens, options());
    const compensated = buildSpeedCurve(
      tokens,
      options({ spokenDutyStrength: 0.4, syllableWeighting: false, jargonCompensation: 1 }),
    );
    const rawWpm = wpmAt(raw, 6);
    const adjWpm = wpmAt(compensated, 6);
    expect(rawWpm).toBeGreaterThan(50);
    expect(rawWpm).toBeLessThan(75);
    expect(adjWpm / rawWpm).toBeGreaterThan(0.92);
    expect(adjWpm / rawWpm).toBeLessThan(1.08);
  });

  it('still raises WPM when captions leave real gaps between words', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 12; i += 1) {
      tokens.push(token(i, i + 0.2, 'item'));
    }
    const raw = buildSpeedCurve(tokens, options({ gaussianSigma: 1, medianWindowSec: 1 }));
    const compensated = buildSpeedCurve(
      tokens,
      options({
        spokenDutyStrength: 0.5,
        gaussianSigma: 1,
        medianWindowSec: 1,
      }),
    );
    expect(wpmAt(compensated, 6) / wpmAt(raw, 6)).toBeGreaterThan(1.3);
  });
});
