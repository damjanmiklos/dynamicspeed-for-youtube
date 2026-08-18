import type { CompactWordToken, WordToken } from './types';
import { MAX_TOKENS, MAX_WORD_CHARS } from './limits';

export function toCompactTokens(tokens: WordToken[]): CompactWordToken[] {
  return tokens.map((token) => {
    const compact: CompactWordToken = {
      t0: Math.round(token.t0 * 1000) / 1000,
      t1: Math.round(token.t1 * 1000) / 1000,
      w: token.text,
      s: token.syllables,
    };
    if (token.meta) {
      compact.m = true;
    }
    if (token.jargon) {
      compact.j = true;
    }
    return compact;
  });
}

export function fromCompactTokens(tokens: CompactWordToken[]): WordToken[] {
  if (!Array.isArray(tokens)) {
    return [];
  }
  const out: WordToken[] = [];
  for (const token of tokens.slice(0, MAX_TOKENS)) {
    if (!token || typeof token !== 'object') {
      continue;
    }
    const t0 = Number(token.t0);
    const t1 = Number(token.t1);
    const text = typeof token.w === 'string' ? token.w.slice(0, MAX_WORD_CHARS) : '';
    const syllables = Number(token.s);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0 || !text) {
      continue;
    }
    out.push({
      t0,
      t1,
      text,
      syllables: Number.isFinite(syllables) ? Math.max(0, Math.min(32, syllables)) : 1,
      jargon: Boolean(token.j),
      meta: Boolean(token.m),
    });
  }
  return out;
}

export function estimateTokenBytes(tokens: CompactWordToken[]): number {
  return JSON.stringify(tokens).length;
}
