import { normalizeLexeme } from '../pacing/syllables';
import { isMetaText } from './text';
import type { TimedCue, WordToken } from './types';

const MIN_DURATION_SEC = 1e-4;
const MIN_OVERLAP_SEC = 0.08;
const MIN_ROLLING_WORDS = 2;
const ROLLING_LOOKAHEAD = 6;
/** Animated tracks emit a new frame every few dozen ms; normal cues start ~1s+ apart. */
const ANIMATED_REDRAW_ONSET_SEC = 0.4;

function cueWordKey(text: string): string {
  return normalizeLexeme(text) || text.trim().toLowerCase();
}

function isMetaCue(cue: TimedCue): boolean {
  return isMetaText(cue.rawText);
}

function cueIsUntimed(cue: TimedCue): boolean {
  return cue.words.every((word) => !word.hasOffset);
}

function snapCueEnd(cue: TimedCue, end: number): void {
  const minSpan = MIN_DURATION_SEC * Math.max(cue.words.length, 1);
  if (end - cue.t0 >= minSpan) {
    cue.t1 = Math.min(cue.t1, end);
  }
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

function keysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function keysHavePrefix(full: string[], prefix: string[]): boolean {
  if (prefix.length === 0 || prefix.length >= full.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (full[i] !== prefix[i]) {
      return false;
    }
  }
  return letterCount(prefix, 0, prefix.length) >= 1;
}

function markCueUntimed(cue: TimedCue): void {
  for (const word of cue.words) {
    word.hasOffset = false;
    word.t0 = undefined;
    word.t1 = undefined;
  }
}

function dropEmptyCueWords(cue: TimedCue): void {
  cue.words = cue.words.filter((word) => {
    const stripped = word.text.replace(/\u200b/g, '').trim();
    return stripped.length > 0 && cueWordKey(stripped).length > 0;
  });
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
 * YouTube Animated / karaoke tracks redraw the visible line every few dozen
 * milliseconds. Collapse identical and growing frames so each word is counted
 * once. Normal caption onsets are ~1s+ apart, so those are left alone.
 */
export function collapseRedrawCues(cues: TimedCue[]): void {
  for (const cue of cues) {
    dropEmptyCueWords(cue);
  }
  const keys: string[][] = cues.map((cue) =>
    cue.words.map((word) => cueWordKey(word.text)),
  );

  let last = -1;
  let lastFull: string[] | null = null;
  let lastOnset = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    if (isMetaCue(cue) || cue.words.length === 0) {
      continue;
    }
    const current = keys[index];
    if (
      last >= 0 &&
      lastFull &&
      cue.t0 - lastOnset <= ANIMATED_REDRAW_ONSET_SEC
    ) {
      if (keysEqual(lastFull, current)) {
        cues[last].t1 = Math.max(cues[last].t1, cue.t1);
        markCueUntimed(cues[last]);
        cue.words = [];
        keys[index] = [];
        lastOnset = cue.t0;
        continue;
      }
      if (keysHavePrefix(current, lastFull)) {
        const prefix = lastFull.length;
        cue.words = cue.words.slice(prefix);
        keys[index] = current.slice(prefix);
        lastFull = current;
        last = index;
        lastOnset = cue.t0;
        continue;
      }
      const overlap = rollingOverlapLength(lastFull, current);
      if (overlap > 0) {
        cue.words = cue.words.slice(overlap);
        keys[index] = current.slice(overlap);
        lastFull = current;
        last = index;
        lastOnset = cue.t0;
        continue;
      }
    }
    lastFull = current;
    last = index;
    lastOnset = cue.t0;
  }
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
  // Overlap tests must use the original display windows. Shrinking t1 as we
  // go would hide later rolling events that start at the previous original end.
  const origT0 = cues.map((cue) => cue.t0);
  const origT1 = cues.map((cue) => cue.t1);

  for (let i = 0; i < cues.length; i += 1) {
    const current = cues[i];
    if (isMetaCue(current) || current.words.length === 0) {
      continue;
    }
    const limit = Math.min(cues.length, i + 1 + ROLLING_LOOKAHEAD);
    for (let j = i + 1; j < limit; j += 1) {
      const later = cues[j];
      if (origT0[j] >= origT1[i]) {
        break;
      }
      if (isMetaCue(later) || later.words.length === 0) {
        continue;
      }
      if (origT1[i] - origT0[j] < MIN_OVERLAP_SEC) {
        continue;
      }
      const overlap = rollingOverlapLength(keys[i], keys[j]);
      if (overlap === 0) {
        continue;
      }
      later.words = later.words.slice(overlap);
      keys[j] = keys[j].slice(overlap);

      // Untimed rolling windows are display holds, not word timings. After the
      // repeated prefix is dropped, leftover words were spoken when they
      // appeared (later.t0), and the previous line ended when this one appeared.
      // Painting leftovers across the full original span (or shifting them into
      // the hold after current.t1) underestimates WPM and speeds the video up.
      const currentUntimed = cueIsUntimed(current);
      const laterUntimed = cueIsUntimed(later);
      if (currentUntimed) {
        snapCueEnd(current, origT0[j]);
      }
      if (later.words.length === 0) {
        continue;
      }
      if (laterUntimed) {
        snapCueEnd(later, origT1[i]);
      }
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

const MIN_REPEAT_PHRASE = 4;
const MAX_REPEAT_PHRASE = 48;
const MAX_PHRASE_PERIOD_SEC = 4.5;
const REPEAT_COPY_SLACK_SEC = 0.45;

function keysMatch(keys: string[], left: number, right: number, length: number): boolean {
  for (let index = 0; index < length; index += 1) {
    if (keys[left + index] !== keys[right + index]) {
      return false;
    }
  }
  return true;
}

function uniqueKeyCount(keys: string[], start: number, length: number): number {
  const seen = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    seen.add(keys[start + index]);
  }
  return seen.size;
}

function rangeHasMeta(tokens: WordToken[], start: number, length: number): boolean {
  for (let index = 0; index < length; index += 1) {
    if (tokens[start + index]?.meta) {
      return true;
    }
  }
  return false;
}

function retimePhrase(phrase: WordToken[], t0: number, t1: number): WordToken[] {
  const duration = Math.max(t1 - t0, MIN_DURATION_SEC * phrase.length);
  const weights = phrase.map((token) => Math.max(token.text.replace(/\s+/g, '').length, 1));
  const weightSum = Math.max(
    weights.reduce((sum, weight) => sum + weight, 0),
    1,
  );
  let cursor = t0;
  return phrase.map((token, index) => {
    const share = duration * (weights[index] / weightSum);
    const start = cursor;
    const end = index === phrase.length - 1 ? t0 + duration : start + share;
    cursor = end;
    return {
      ...token,
      t0: start,
      t1: Math.max(end, start + MIN_DURATION_SEC),
    };
  });
}

/**
 * Animated / karaoke tracks often emit the same 4+ word line two or three
 * times back-to-back as separate words. Keep one copy and stretch it across
 * the redraw hold so WPM uses video time, not stacked onsets.
 */
export function collapseRepeatedPhrases(tokens: WordToken[]): WordToken[] {
  if (tokens.length < MIN_REPEAT_PHRASE * 2) {
    return tokens;
  }

  const keys = tokens.map((token) => (token.meta ? '' : cueWordKey(token.text)));
  const out: WordToken[] = [];
  const n = tokens.length;
  let index = 0;

  while (index < n) {
    if (tokens[index].meta) {
      out.push(tokens[index]);
      index += 1;
      continue;
    }

    const maxPeriod = Math.min(MAX_REPEAT_PHRASE, Math.floor((n - index) / 2));
    let period = 0;
    let copies = 1;
    for (let length = MIN_REPEAT_PHRASE; length <= maxPeriod; length += 1) {
      if (rangeHasMeta(tokens, index, length * 2)) {
        continue;
      }
      if (uniqueKeyCount(keys, index, length) < 3) {
        continue;
      }
      if (!keysMatch(keys, index, index + length, length)) {
        continue;
      }
      const periodDt = tokens[index + length].t0 - tokens[index].t0;
      if (!(periodDt > 0) || periodDt > MAX_PHRASE_PERIOD_SEC) {
        continue;
      }
      let count = 2;
      while (
        index + (count + 1) * length <= n &&
        !rangeHasMeta(tokens, index + count * length, length) &&
        keysMatch(keys, index, index + count * length, length)
      ) {
        const start = tokens[index + count * length].t0;
        const previous = tokens[index + (count - 1) * length].t0;
        if (start - previous > periodDt + REPEAT_COPY_SLACK_SEC) {
          break;
        }
        count += 1;
      }
      period = length;
      copies = count;
      break;
    }

    if (period === 0) {
      out.push(tokens[index]);
      index += 1;
      continue;
    }

    let consumed = period * copies;
    const leftover = Math.min(period - 1, n - index - consumed);
    if (
      leftover >= 2 &&
      !rangeHasMeta(tokens, index + consumed, leftover) &&
      keysMatch(keys, index, index + consumed, leftover)
    ) {
      const gap = tokens[index + consumed].t0 - tokens[index + consumed - period].t0;
      if (gap <= MAX_PHRASE_PERIOD_SEC) {
        consumed += leftover;
      }
    }

    const last = tokens[index + consumed - 1];
    out.push(...retimePhrase(tokens.slice(index, index + period), tokens[index].t0, last.t1));
    index += consumed;
  }

  return out;
}
