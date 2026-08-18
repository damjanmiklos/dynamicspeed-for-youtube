import { normalizeLexeme } from '../pacing/syllables';
import { isMetaText } from './text';
import type { TimedCue, WordToken } from './types';

const MIN_DURATION_SEC = 1e-4;
const MIN_OVERLAP_SEC = 0.08;
const MIN_ROLLING_WORDS = 2;
const ROLLING_LOOKAHEAD = 6;

function cueWordKey(text: string): string {
  return normalizeLexeme(text) || text.trim().toLowerCase();
}

function isMetaCue(cue: TimedCue): boolean {
  return isMetaText(cue.rawText);
}

function letterCount(keys: string[], start: number, count: number): number {
  let letters = 0;
  for (let i = 0; i < count; i += 1) {
    if (/\p{L}/u.test(keys[start + i] ?? '')) {
      letters += 1;
    }
  }
  return letters;
}

/** Longest suffix of `prev` that is a prefix of `next`, or 0 if too weak to trust. */
export function rollingOverlapLength(prev: string[], next: string[]): number {
  const max = Math.min(prev.length, next.length);
  for (let k = max; k >= MIN_ROLLING_WORDS; k -= 1) {
    let matched = true;
    for (let i = 0; i < k; i += 1) {
      if (prev[prev.length - k + i] !== next[i]) {
        matched = false;
        break;
      }
    }
    if (matched && letterCount(prev, prev.length - k, k) >= MIN_ROLLING_WORDS) {
      return k;
    }
  }
  return 0;
}

/**
 * YouTube rolling captions repeat the tail of the previous line on the next
 * overlapping event. Drop that prefix from the later cue only.
 * Adjacent scan with a small lookahead; O(cues × words-per-cue).
 */
export function stripRollingCueDuplicates(cues: TimedCue[]): void {
  const keys: string[][] = cues.map((cue) =>
    cue.words.map((word) => cueWordKey(word.text)),
  );

  for (let i = 0; i < cues.length; i += 1) {
    const current = cues[i];
    if (isMetaCue(current) || current.words.length === 0) {
      continue;
    }
    const limit = Math.min(cues.length, i + 1 + ROLLING_LOOKAHEAD);
    for (let j = i + 1; j < limit; j += 1) {
      const later = cues[j];
      if (later.t0 >= current.t1) {
        break;
      }
      if (isMetaCue(later) || later.words.length === 0) {
        continue;
      }
      if (current.t1 - later.t0 < MIN_OVERLAP_SEC) {
        continue;
      }
      const overlap = rollingOverlapLength(keys[i], keys[j]);
      if (overlap === 0) {
        continue;
      }
      later.words = later.words.slice(overlap);
      keys[j] = keys[j].slice(overlap);
    }
  }
}

/**
 * Make speech word intervals non-overlapping by clipping ends, without filling
 * pauses. Meta tokens are left alone so [music] cannot steal speech time.
 */
export function deoverlapTokenTimes(tokens: WordToken[]): WordToken[] {
  if (tokens.length < 2) {
    return tokens;
  }

  const out = tokens.map((token) => ({ ...token }));
  const speech: number[] = [];
  for (let i = 0; i < out.length; i += 1) {
    if (!out[i].meta) {
      speech.push(i);
    }
  }
  if (speech.length < 2) {
    return out;
  }

  let cursor = 0;
  while (cursor < speech.length) {
    const runStart = cursor;
    const t0 = out[speech[cursor]].t0;
    cursor += 1;
    while (cursor < speech.length && out[speech[cursor]].t0 === t0) {
      cursor += 1;
    }
    if (cursor - runStart < 2) {
      continue;
    }

    const run = speech.slice(runStart, cursor);
    const nextT0 =
      cursor < speech.length ? out[speech[cursor]].t0 : Number.POSITIVE_INFINITY;
    let end = t0;
    for (const index of run) {
      if (out[index].t1 > end) {
        end = out[index].t1;
      }
    }
    if (end > nextT0) {
      end = nextT0;
    }
    const minSpan = MIN_DURATION_SEC * run.length;
    if (end - t0 < minSpan) {
      end = t0 + minSpan;
    }
    const slice = (end - t0) / run.length;
    for (let offset = 0; offset < run.length; offset += 1) {
      out[run[offset]].t0 = t0 + offset * slice;
      out[run[offset]].t1 = t0 + (offset + 1) * slice;
    }
  }

  for (let i = 0; i < speech.length - 1; i += 1) {
    const current = out[speech[i]];
    const next = out[speech[i + 1]];
    if (current.t1 > next.t0) {
      current.t1 = Math.max(current.t0 + MIN_DURATION_SEC, next.t0);
    }
  }

  return out;
}
