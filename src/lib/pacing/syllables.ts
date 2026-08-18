import { syllable } from 'syllable';
/** Google 10,000 English: first20hours/google-10000-english (Google Trillion Word Corpus). */
import google10kRaw from './data/google-10k-english.txt?raw';

const EASY_WORDS = new Set(
  google10kRaw
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean),
);

export function normalizeLexeme(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\uFF07]/g, "'")
    .replace(/^[^\p{L}\p{N}']+/gu, '')
    .replace(/[^\p{L}\p{N}']+$/gu, '');
}

export function countSyllables(text: string): number {
  const lexeme = normalizeLexeme(text);
  if (!lexeme) {
    return 0;
  }
  try {
    return Math.max(1, syllable(lexeme));
  } catch {
    const groups = lexeme.match(/[aeiouy]+/g);
    return Math.max(1, groups?.length ?? 1);
  }
}

export function isEnglishLanguageCode(code: string | null | undefined): boolean {
  const normalized = (code ?? '').trim().toLowerCase();
  return normalized === 'en' || normalized === 'eng' || normalized.startsWith('en-');
}

export function isEasyWord(text: string): boolean {
  const lexeme = normalizeLexeme(text);
  if (!lexeme) {
    return true;
  }
  return EASY_WORDS.has(lexeme);
}

export function isJargonWord(
  text: string,
  syllables: number,
  language?: string | null,
): boolean {
  if (!isEnglishLanguageCode(language)) {
    return false;
  }
  return syllables >= 3 && !isEasyWord(text);
}

export const AVG_SYLLABLES_PER_WORD = 1.5;

export function effectiveWords(input: {
  syllables: number;
  jargon: boolean;
  syllableWeighting: boolean;
  jargonCompensation: number;
}): number {
  const base = input.syllableWeighting
    ? input.syllables / AVG_SYLLABLES_PER_WORD
    : 1;
  if (input.jargon) {
    return base * input.jargonCompensation;
  }
  return base;
}

export function easyWordListSize(): number {
  return EASY_WORDS.size;
}
