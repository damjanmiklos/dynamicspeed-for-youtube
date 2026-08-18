import { MAX_TOKENS } from './limits';
import type { WordToken } from './types';

export type TranscriptExportWord = {
  t0: number;
  t1: number;
  text: string;
  syllables: number;
  jargon: boolean;
  meta: boolean;
};

export type TranscriptExport = {
  videoId: string | null;
  title: string | null;
  transcriptStatus: string;
  wordCount: number;
  text: string;
  words: TranscriptExportWord[];
};

export function buildTranscriptExport(input: {
  videoId: string | null;
  title: string | null;
  transcriptStatus: string;
  tokens: WordToken[];
}): TranscriptExport {
  const words: TranscriptExportWord[] = input.tokens.slice(0, MAX_TOKENS).map((token) => ({
    t0: token.t0,
    t1: token.t1,
    text: token.text,
    syllables: token.syllables,
    jargon: token.jargon,
    meta: token.meta,
  }));
  return {
    videoId: input.videoId,
    title: input.title,
    transcriptStatus: input.transcriptStatus,
    wordCount: words.length,
    text: words
      .filter((word) => !word.meta)
      .map((word) => word.text)
      .join(' '),
    words,
  };
}

export function transcriptDownloadName(videoId: string | null): string {
  const id = videoId && /^[\w-]{11}$/.test(videoId) ? videoId : 'unknown';
  return `dynamicspeed-transcript-${id}.json`;
}
