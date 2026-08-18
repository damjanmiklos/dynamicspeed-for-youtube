import type { CompactWordToken, WordToken } from './types';

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
  return tokens.map((token) => ({
    t0: token.t0,
    t1: token.t1,
    text: token.w,
    syllables: token.s,
    jargon: Boolean(token.j),
    meta: Boolean(token.m),
  }));
}

export function estimateTokenBytes(tokens: CompactWordToken[]): number {
  return JSON.stringify(tokens).length;
}
