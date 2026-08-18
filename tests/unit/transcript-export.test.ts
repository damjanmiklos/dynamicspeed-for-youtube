import { describe, expect, it } from 'vitest';
import {
  buildTranscriptExport,
  transcriptDownloadName,
} from '../../src/lib/transcript/export';
import { isRuntimeMessage } from '../../src/lib/messaging/protocol';

describe('transcript export', () => {
  it('joins speech and keeps timed words', () => {
    const exported = buildTranscriptExport({
      videoId: 'abcdefghijk',
      title: 'Demo',
      transcriptStatus: 'ready',
      tokens: [
        { t0: 0, t1: 0.4, text: 'Hello', syllables: 2, jargon: false, meta: false },
        { t0: 0.4, t1: 1.2, text: '[Music]', syllables: 0, jargon: false, meta: true },
        { t0: 1.2, t1: 1.8, text: 'world', syllables: 1, jargon: false, meta: false },
      ],
    });
    expect(exported.text).toBe('Hello world');
    expect(exported.wordCount).toBe(3);
    expect(exported.words[1]?.meta).toBe(true);
  });

  it('names the file after a safe video id', () => {
    expect(transcriptDownloadName('abcdefghijk')).toBe(
      'dynamicspeed-transcript-abcdefghijk.json',
    );
    expect(transcriptDownloadName('../evil')).toBe('dynamicspeed-transcript-unknown.json');
  });
});

describe('transcript runtime messages', () => {
  it('accepts GET_TRANSCRIPT and a well-formed TRANSCRIPT payload', () => {
    expect(
      isRuntimeMessage({ source: 'dynamicspeed-runtime', type: 'GET_TRANSCRIPT' }),
    ).toBe(true);
    expect(
      isRuntimeMessage({
        source: 'dynamicspeed-runtime',
        type: 'TRANSCRIPT',
        transcript: {
          videoId: 'abcdefghijk',
          title: 'Demo',
          transcriptStatus: 'ready',
          wordCount: 0,
          text: '',
          words: [],
        },
      }),
    ).toBe(true);
    expect(
      isRuntimeMessage({
        source: 'dynamicspeed-runtime',
        type: 'TRANSCRIPT',
        transcript: { words: [] },
      }),
    ).toBe(false);
  });
});
