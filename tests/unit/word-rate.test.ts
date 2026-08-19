import { describe, expect, it } from 'vitest';
import { buildSpeedCurve, rateAt, wpmAt, type CurveBuildOptions } from '../../src/lib/pacing/curve';
import type { WordToken } from '../../src/lib/transcript/types';

const USER: CurveBuildOptions = {
  targetWpm: 400,
  minSpeed: 0.75,
  maxSpeed: 3,
  minChunkSec: 0.1,
  wpmFloor: 60,
  wpmCeil: 450,
  longPauseSec: 1.8,
  bRollAcceleration: false,
  treatMusicAsBRoll: true,
  syllableWeighting: false,
  jargonCompensation: 1.15,
  spokenDutyStrength: 0.4,
  gaussianSigma: 16,
  medianWindowSec: 8.9,
  slewRateLimit: 0.24,
};

function abuttingTalk(wordCount: number, durationSec: number, longEvery: number): WordToken[] {
  const weights: number[] = [];
  for (let i = 0; i < wordCount; i += 1) {
    weights.push(i % longEvery === 0 ? 4 : 1);
  }
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const tokens: WordToken[] = [];
  let t = 0;
  for (let i = 0; i < wordCount; i += 1) {
    const dt = (weights[i] / sum) * durationSec;
    tokens.push({
      t0: t,
      t1: t + dt,
      text: 'word',
      syllables: 1,
      jargon: false,
      meta: false,
    });
    t += dt;
  }
  return tokens;
}

describe('listening WPM vs pause-inflated caption durations', () => {
  it('keeps a slow pause-heavy talker slower than a dense talker under user dynamics', () => {
    const duration = 90;
    const slowWpm = 167;
    const fastWpm = 238;
    const slow = abuttingTalk(Math.round((slowWpm * duration) / 60), duration, 5);
    const fast = abuttingTalk(Math.round((fastWpm * duration) / 60), duration, 18);
    const slowCurve = buildSpeedCurve(slow, { ...USER, durationHint: duration });
    const fastCurve = buildSpeedCurve(fast, { ...USER, durationHint: duration });
    const t = duration / 2;
    const slowEst = wpmAt(slowCurve, t);
    const fastEst = wpmAt(fastCurve, t);
    expect(slowEst).toBeGreaterThan(140);
    expect(slowEst).toBeLessThan(200);
    expect(fastEst).toBeGreaterThan(210);
    expect(fastEst).toBeLessThan(280);
    expect(fastEst / slowEst).toBeGreaterThan(1.2);
    expect(rateAt(slowCurve, t)).toBeGreaterThan(rateAt(fastCurve, t) + 0.25);
  });
});
