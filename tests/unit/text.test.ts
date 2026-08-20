import { describe, expect, it } from 'vitest';
import { isMetaText, splitWords } from '../../src/lib/transcript/text';

describe('isMetaText', () => {
  it('keeps ordinary words and the word Music as speech', () => {
    expect(isMetaText('Music')).toBe(false);
    expect(isMetaText('Amnesia')).toBe(false);
    expect(isMetaText("I'll")).toBe(false);
    expect(isMetaText('Intro')).toBe(false);
  });

  it('treats YouTube and fan-caption music markers as meta', () => {
    expect(isMetaText('[Music]')).toBe(true);
    expect(isMetaText('[music]')).toBe(true);
    expect(isMetaText('(music)')).toBe(true);
    expect(isMetaText('*Intro Music*')).toBe(true);
    expect(isMetaText('*Outro Music*')).toBe(true);
    expect(isMetaText('*Intro')).toBe(true);
    expect(isMetaText('Music*')).toBe(true);
    expect(isMetaText('*Outro')).toBe(true);
  });
});

describe('splitWords', () => {
  it('drops zero-width karaoke markers', () => {
    expect(splitWords('YouTube will \u200b soon')).toEqual(['YouTube', 'will', 'soon']);
    expect(splitWords('\u200b')).toEqual([]);
  });
});
