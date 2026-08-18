import { describe, expect, it } from 'vitest';
import { proportionallyAlignCue } from '../../src/lib/transcript/align';
import { countSyllables } from '../../src/lib/pacing/syllables';

describe('proportional cue alignment', () => {
  it('gives longer words more of the cue duration', () => {
    const tokens = proportionallyAlignCue(
      {
        t0: 0,
        t1: 6,
        rawText: 'Hi photosynthesis',
        words: [{ text: 'Hi', hasOffset: false }, { text: 'photosynthesis', hasOffset: false }],
      },
      { syllableWeighting: true },
    );
    expect(tokens).toHaveLength(2);
    const hi = tokens[0].t1 - tokens[0].t0;
    const dense = tokens[1].t1 - tokens[1].t0;
    expect(dense).toBeGreaterThan(hi);
    expect(tokens.every((token) => token.t1 > token.t0)).toBe(true);

    const rate0 =
      (countSyllables('Hi') / 1.5 / hi) * 60;
    const rate1 =
      (countSyllables('photosynthesis') / 1.5 / dense) * 60;
    expect(Math.abs(rate0 - rate1)).toBeLessThan(1);
  });

  it('never assigns zero duration', () => {
    const tokens = proportionallyAlignCue(
      {
        t0: 1,
        t1: 1.05,
        rawText: 'a b c',
        words: [
          { text: 'a', hasOffset: false },
          { text: 'b', hasOffset: false },
          { text: 'c', hasOffset: false },
        ],
      },
      { syllableWeighting: false },
    );
    expect(tokens.every((token) => token.t1 - token.t0 >= 1e-4)).toBe(true);
  });
});
