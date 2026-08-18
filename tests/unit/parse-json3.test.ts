import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseJson3 } from '../../src/lib/transcript/parse-json3';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../testdata/json3');

describe('parseJson3', () => {
  it('uses word-level tOffsetMs from ASR JSON3', () => {
    const json = JSON.parse(readFileSync(join(dir, 'asr-offsets.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: true });
    expect(tokens.map((token) => token.text)).toEqual(['Hello', 'there', 'friend']);
    expect(tokens[0].t0).toBeCloseTo(1.0, 3);
    expect(tokens[1].t0).toBeCloseTo(1.4, 3);
    expect(tokens[2].t0).toBeCloseTo(1.9, 3);
    expect(tokens[2].t1).toBeGreaterThan(tokens[2].t0);
  });

  it('drops empty newline events', () => {
    const json = JSON.parse(readFileSync(join(dir, 'asr-offsets.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: true });
    expect(tokens.some((token) => token.text === '\n')).toBe(false);
  });

  it('marks [Music] as meta', () => {
    const json = JSON.parse(readFileSync(join(dir, 'music-and-speech.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: true });
    const music = tokens.find((token) => token.meta);
    expect(music?.text).toMatch(/music/i);
  });

  it('returns an empty list for corrupt input', () => {
    expect(parseJson3({ nope: true }, { syllableWeighting: true })).toEqual([]);
  });

  it('decodes HTML entities', () => {
    const tokens = parseJson3(
      {
        events: [
          {
            tStartMs: 0,
            dDurationMs: 1000,
            segs: [{ utf8: "It&#39;s good" }],
          },
        ],
      },
      { syllableWeighting: false },
    );
    expect(tokens.map((token) => token.text).join(' ')).toContain("It's");
  });

  it('does not double-unescape nested HTML entities', () => {
    const tokens = parseJson3(
      {
        events: [
          {
            tStartMs: 0,
            dDurationMs: 1000,
            segs: [{ utf8: '&amp;lt;script&amp;gt;' }],
          },
        ],
      },
      { syllableWeighting: false },
    );
    expect(tokens.map((token) => token.text).join(' ')).toBe('&lt;script&gt;');
  });
});
