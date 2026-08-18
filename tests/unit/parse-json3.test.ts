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

  it('skips corrupt events instead of throwing', () => {
    const tokens = parseJson3(
      { events: [null, 1, { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: 'Hi' }] }] },
      { syllableWeighting: false },
    );
    expect(tokens.map((token) => token.text)).toEqual(['Hi']);
  });

  it('drops the repeated tail of rolling YouTube caption windows', () => {
    const json = JSON.parse(readFileSync(join(dir, 'rolling-window.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: false });
    expect(tokens.map((token) => token.text)).toEqual([
      'hello',
      'world',
      'how',
      'are',
      'you',
      'doing',
      'today',
    ]);
  });

  it('keeps distinct overlapping lines but makes their times sequential', () => {
    const json = JSON.parse(readFileSync(join(dir, 'interleaved-lines.json'), 'utf8'));
    const tokens = parseJson3(json, { syllableWeighting: false }).filter(
      (token) => !token.meta,
    );
    expect(tokens.map((token) => token.text)).toEqual([
      'rover',
      'rigid',
      'sends',
      'desert',
      'us',
    ]);
    for (let i = 0; i < tokens.length - 1; i += 1) {
      expect(tokens[i].t1).toBeLessThanOrEqual(tokens[i + 1].t0 + 1e-9);
      expect(tokens[i].t1).toBeGreaterThan(tokens[i].t0);
    }
  });
});
