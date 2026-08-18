export type WordToken = {
  t0: number;
  t1: number;
  text: string;
  syllables: number;
  jargon: boolean;
  meta: boolean;
};

export type CompactWordToken = {
  t0: number;
  t1: number;
  w: string;
  s: number;
  m?: true;
  j?: true;
};

export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  languageName?: string;
  kind?: string;
  vssId?: string;
};

export type TimedCue = {
  t0: number;
  t1: number;
  words: Array<{
    text: string;
    t0?: number;
    t1?: number;
    hasOffset: boolean;
  }>;
  rawText: string;
};

export type Json3Seg = {
  utf8?: string;
  tOffsetMs?: number;
};

export type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
};

export type Json3Document = {
  events?: Json3Event[];
};
