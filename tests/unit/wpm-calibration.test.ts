import { describe, expect, it } from 'vitest';
import { buildSpeedCurve, wpmAt, type CurveBuildOptions } from '../../src/lib/pacing/curve';
import type { WordToken } from '../../src/lib/transcript/types';
import {
  JARGON_WEIGHT_SHARE,
  SYLLABLE_WEIGHTING_CALIBRATION,
  TYPICAL_SPOKEN_DUTY_RATIO,
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
    expect(spokenDutyCalibration(1)).toBeCloseTo(1 / TYPICAL_SPOKEN_DUTY_RATIO, 8);
    const weak = spokenDutyCalibration(0.2);
    const strong = spokenDutyCalibration(0.8);
    expect(strong).toBeGreaterThan(weak);
    expect(
      wpmAdjustmentsActive({
        syllableWeighting: false,
        jargonCompensation: 1,
        spokenDutyStrength: 0.4,
      }),
    ).toBe(true);
  });

  it('keeps default-compensation WPM near raw WPM while still slowing list-like speech', () => {
    const tokens: WordToken[] = [];
    for (let i = 0; i < 12; i += 1) {
      tokens.push(token(i, i + 1, 'item'));
    }
    const raw = buildSpeedCurve(tokens, options());
    const compensated = buildSpeedCurve(
      tokens,
      options({ spokenDutyStrength: 0.4, syllableWeighting: true, jargonCompensation: 1.15 }),
    );
    const rawWpm = wpmAt(raw, 6);
    const adjWpm = wpmAt(compensated, 6);
    expect(adjWpm / rawWpm).toBeGreaterThan(1.1);
    expect(adjWpm / rawWpm).toBeLessThan(2.5);
    expect(adjWpm).toBeLessThan(260);
  });
});
