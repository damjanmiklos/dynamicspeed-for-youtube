import { isMetaText, splitWords } from './text';
import { countSyllables, isJargonWord } from '../pacing/syllables';
import type { TimedCue, WordToken } from './types';

export type AlignOptions = {
  syllableWeighting: boolean;
  minDurationSec?: number;
};

function weightForWord(word: string, syllableWeighting: boolean): number {
  if (syllableWeighting) {
    return Math.max(1, countSyllables(word));
  }
  return Math.max(1, [...word].length);
}

/**
 * Split a cue without per-word offsets by syllable (or character) weight
 * so intra-cue instantaneous WPM stays near the cue mean.
 */
export function proportionallyAlignCue(
  cue: TimedCue,
  options: AlignOptions,
): WordToken[] {
  const duration = Math.max(cue.t1 - cue.t0, options.minDurationSec ?? 0.001);
  const words = cue.words.map((word) => word.text).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  if (isMetaText(words.join(' ')) || isMetaText(cue.rawText)) {
    return [
      {
        t0: cue.t0,
        t1: Math.max(cue.t1, cue.t0 + 0.001),
        text: cue.rawText.trim() || words.join(' '),
        syllables: 0,
        jargon: false,
        meta: true,
      },
    ];
  }

  const weights = words.map((word) => weightForWord(word, options.syllableWeighting));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const tokens: WordToken[] = [];
  let cursor = cue.t0;

  for (let i = 0; i < words.length; i += 1) {
    const share = duration * (weights[i] / weightSum);
    const t0 = cursor;
    const t1 = i === words.length - 1 ? cue.t0 + duration : t0 + share;
    const syllables = countSyllables(words[i]);
    tokens.push({
      t0,
      t1: Math.max(t1, t0 + 1e-4),
      text: words[i],
      syllables,
      jargon: isJargonWord(words[i], syllables),
      meta: false,
    });
    cursor = t1;
  }

  return tokens;
}

export function tokensFromTimedWords(
  words: Array<{ text: string; t0: number; t1: number }>,
): WordToken[] {
  return words.map((word) => {
    const text = word.text.trim();
    const meta = isMetaText(text);
    const syllables = meta ? 0 : countSyllables(text);
    return {
      t0: word.t0,
      t1: Math.max(word.t1, word.t0 + 1e-4),
      text,
      syllables,
      jargon: meta ? false : isJargonWord(text, syllables),
      meta,
    };
  });
}

export function tokenizePlainText(text: string): string[] {
  return splitWords(text);
}
