import { describe, expect, it } from 'vitest';
import {
  deoverlapTokenTimes,
  rollingOverlapLength,
  stripRollingCueDuplicates,
  collapseRedrawCues,
} from '../../src/lib/transcript/deoverlap';
import type { TimedCue, WordToken } from '../../src/lib/transcript/types';

function speech(
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

function cue(
  t0: number,
  t1: number,
  words: string[],
  rawText = words.join(' '),
  timed = true,
): TimedCue {
  return {
    t0,
    t1,
    rawText,
    words: words.map((text, index) => ({
      text,
      t0: timed ? t0 + index * 0.2 : undefined,
      hasOffset: timed,
    })),
  };
}

describe('rollingOverlapLength', () => {
  it('finds a repeated tail of at least two real words', () => {
    expect(
      rollingOverlapLength(
        ['hello', 'world', 'how', 'are', 'you'],
        ['how', 'are', 'you', 'doing', 'today'],
      ),
    ).toBe(3);
  });

  it('ignores a one-word coincidence', () => {
    expect(rollingOverlapLength(['save', 'the'], ['the', 'world'])).toBe(0);
  });

  it('ignores punctuation-only matches', () => {
    expect(rollingOverlapLength(['>>', '>>'], ['>>', '>>', 'hello'])).toBe(0);
  });
});

describe('stripRollingCueDuplicates', () => {
  it('drops the repeated prefix from a later overlapping cue', () => {
    const cues = [
      cue(0, 4, ['hello', 'world', 'how', 'are', 'you']),
      cue(2, 6, ['how', 'are', 'you', 'doing', 'today']),
    ];
    stripRollingCueDuplicates(cues);
    expect(cues[1].words.map((word) => word.text)).toEqual(['doing', 'today']);
    expect(cues[0].words.map((word) => word.text)).toEqual([
      'hello',
      'world',
      'how',
      'are',
      'you',
    ]);
  });

  it('does not strip when cues do not overlap in time', () => {
    const cues = [
      cue(0, 2, ['how', 'are', 'you']),
      cue(2.5, 4, ['how', 'are', 'you', 'doing']),
    ];
    stripRollingCueDuplicates(cues);
    expect(cues[1].words.map((word) => word.text)).toEqual([
      'how',
      'are',
      'you',
      'doing',
    ]);
  });

  it('gives untimed leftover words the appearance window, not the display hold', () => {
    const cues = [
      cue(0, 4, ['hello', 'world', 'how', 'are', 'you'], undefined, false),
      cue(2, 6, ['how', 'are', 'you', 'doing', 'today'], undefined, false),
    ];
    stripRollingCueDuplicates(cues);
    expect(cues[1].words.map((word) => word.text)).toEqual(['doing', 'today']);
    expect(cues[0].t0).toBeCloseTo(0, 8);
    expect(cues[0].t1).toBeCloseTo(2, 8);
    expect(cues[1].t0).toBeCloseTo(2, 8);
    expect(cues[1].t1).toBeCloseTo(4, 8);
  });

  it('still tightens a three-cue untimed roll after earlier ends have been snapped', () => {
    const cues = [
      cue(0, 4, ['hello', 'world', 'how', 'are', 'you'], undefined, false),
      cue(2, 6, ['how', 'are', 'you', 'doing', 'today'], undefined, false),
      cue(4, 8, ['doing', 'today', 'folks'], undefined, false),
    ];
    stripRollingCueDuplicates(cues);
    expect(cues[0].t1).toBeCloseTo(2, 8);
    expect(cues[1].words.map((word) => word.text)).toEqual(['doing', 'today']);
    expect(cues[1].t0).toBeCloseTo(2, 8);
    expect(cues[1].t1).toBeCloseTo(4, 8);
    expect(cues[2].words.map((word) => word.text)).toEqual(['folks']);
    expect(cues[2].t0).toBeCloseTo(4, 8);
    expect(cues[2].t1).toBeCloseTo(6, 8);
  });

  it('does not move timed leftover words; ASR offsets already own the tail', () => {
    const cues = [
      cue(0, 4, ['hello', 'world', 'how', 'are', 'you']),
      cue(2, 6, ['how', 'are', 'you', 'doing', 'today']),
    ];
    stripRollingCueDuplicates(cues);
    expect(cues[0].t1).toBeCloseTo(4, 8);
    expect(cues[1].t0).toBeCloseTo(2, 8);
    expect(cues[1].t1).toBeCloseTo(6, 8);
  });
});

describe('collapseRedrawCues', () => {
  it('merges identical rapid redraw frames into one cue', () => {
    const line = ['YouTube', 'will', 'soon', 'be', 'making'];
    const cues = Array.from({ length: 12 }, (_, index) =>
      cue(index * 0.05, index * 0.05 + 0.05, line, undefined, false),
    );
    collapseRedrawCues(cues);
    const kept = cues.filter((item) => item.words.length > 0);
    expect(kept).toHaveLength(1);
    expect(kept[0].words.map((word) => word.text)).toEqual(line);
    expect(kept[0].t0).toBeCloseTo(0, 8);
    expect(kept[0].t1).toBeCloseTo(0.6, 8);
  });

  it('keeps merging a long identical hold, not just the first 0.4s', () => {
    const line = ['hope', 'that', 'having', 'consistency'];
    const cues = Array.from({ length: 40 }, (_, index) =>
      cue(index * 0.05, index * 0.05 + 0.05, line, undefined, false),
    );
    collapseRedrawCues(cues);
    const kept = cues.filter((item) => item.words.length > 0);
    expect(kept).toHaveLength(1);
    expect(kept[0].t1).toBeCloseTo(2.0, 8);
  });

  it('keeps only newly revealed words from a growing karaoke line', () => {
    const cues = [
      cue(0, 0.05, ['YouTube', 'will'], undefined, false),
      cue(0.05, 0.1, ['YouTube', 'will', 'soon'], undefined, false),
      cue(0.1, 0.15, ['YouTube', 'will', 'soon', 'be'], undefined, false),
      cue(0.15, 0.2, ['YouTube', 'will', 'soon', 'be'], undefined, false),
      cue(0.2, 0.25, ['YouTube', 'will', 'soon', 'be'], undefined, false),
    ];
    collapseRedrawCues(cues);
    expect(cues[0].words.map((word) => word.text)).toEqual(['YouTube', 'will']);
    expect(cues[1].words.map((word) => word.text)).toEqual(['soon']);
    expect(cues[2].words.map((word) => word.text)).toEqual(['be']);
    expect(cues[3].words).toEqual([]);
    expect(cues[4].words).toEqual([]);
    expect(cues[2].t1).toBeCloseTo(0.25, 8);
  });

  it('does not collapse normal cues that start more than 0.4s apart', () => {
    const cues = [
      cue(0, 2, ['how', 'are', 'you'], undefined, false),
      cue(2.5, 4, ['how', 'are', 'you', 'doing'], undefined, false),
    ];
    collapseRedrawCues(cues);
    expect(cues[1].words.map((word) => word.text)).toEqual([
      'how',
      'are',
      'you',
      'doing',
    ]);
  });
});

describe('deoverlapTokenTimes', () => {
  it('leaves sequential word timings unchanged', () => {
    const tokens = [
      speech(0.254, 0.4, 'So'),
      speech(0.4, 0.547, 'you'),
      speech(0.547, 0.987, 'remember'),
      speech(0.987, 1.134, 'at'),
    ];
    expect(deoverlapTokenTimes(tokens)).toEqual(tokens);
  });

  it('does not stretch a word across a pause', () => {
    const tokens = [speech(0, 0.3, 'hello'), speech(2, 2.2, 'later')];
    const out = deoverlapTokenTimes(tokens);
    expect(out[0].t1).toBeCloseTo(0.3, 8);
    expect(out[1].t0).toBeCloseTo(2, 8);
  });

  it('clips overlapping speech so later starts win the shared time', () => {
    const tokens = [
      speech(4.344, 4.856, 'rover'),
      speech(4.504, 5.079, 'rigid'),
      speech(4.856, 5.112, 'sends'),
    ];
    const out = deoverlapTokenTimes(tokens);
    expect(out.map((token) => token.text)).toEqual(['rover', 'rigid', 'sends']);
    expect(out[0].t1).toBeLessThanOrEqual(out[1].t0 + 1e-9);
    expect(out[1].t1).toBeLessThanOrEqual(out[2].t0 + 1e-9);
    expect(out[0].t1).toBeCloseTo(4.504, 5);
    expect(out[1].t1).toBeCloseTo(4.856, 5);
  });

  it('splits words that share a start time instead of collapsing the first to epsilon', () => {
    const tokens = [speech(1, 2, 'one'), speech(1, 2, 'two')];
    const out = deoverlapTokenTimes(tokens);
    expect(out[0].t0).toBeCloseTo(1, 8);
    expect(out[0].t1).toBeCloseTo(1.5, 8);
    expect(out[1].t0).toBeCloseTo(1.5, 8);
    expect(out[1].t1).toBeCloseTo(2, 8);
  });

  it('does not clip speech to a [music] marker', () => {
    const tokens = [
      speech(0, 1.2, 'hello'),
      { t0: 0.4, t1: 0.9, text: '[music]', syllables: 0, jargon: false, meta: true },
      speech(1.2, 1.5, 'there'),
    ];
    const out = deoverlapTokenTimes(tokens);
    expect(out[0].t1).toBeCloseTo(1.2, 8);
    expect(out[1].t0).toBeCloseTo(0.4, 8);
    expect(out[1].t1).toBeCloseTo(0.9, 8);
  });
});
