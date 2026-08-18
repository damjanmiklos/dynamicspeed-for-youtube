import { decodeHtmlEntities, isMetaText, splitWords } from './text';
import {
  proportionallyAlignCue,
  tokensFromTimedWords,
  type AlignOptions,
} from './align';
import type { Json3Document, Json3Event, TimedCue, WordToken } from './types';

function eventText(event: Json3Event): string {
  return decodeHtmlEntities(
    (event.segs ?? []).map((seg) => seg.utf8 ?? '').join(''),
  );
}

function cueFromEvent(event: Json3Event): TimedCue | null {
  const rawText = eventText(event).replace(/\u200b/g, '').trim();
  if (!rawText || rawText === '\n') {
    return null;
  }

  const t0 = (event.tStartMs ?? 0) / 1000;
  const duration = (event.dDurationMs ?? 0) / 1000;
  const t1 = t0 + Math.max(duration, 0.001);
  const segs = event.segs ?? [];
  const hasAnyOffset = segs.some(
    (seg) => typeof seg.tOffsetMs === 'number' && Number.isFinite(seg.tOffsetMs),
  );

  const words: TimedCue['words'] = [];
  for (const seg of segs) {
    const piece = decodeHtmlEntities(seg.utf8 ?? '').replace(/\n/g, ' ').trim();
    if (!piece) {
      continue;
    }
    const offsetSec =
      typeof seg.tOffsetMs === 'number' ? seg.tOffsetMs / 1000 : 0;
    for (const word of splitWords(piece)) {
      words.push({
        text: word,
        t0: t0 + offsetSec,
        hasOffset: hasAnyOffset,
      });
    }
  }

  if (words.length === 0) {
    for (const word of splitWords(rawText)) {
      words.push({ text: word, hasOffset: false });
    }
  }

  return { t0, t1, words, rawText };
}

function assignEndTimes(cues: TimedCue[]): void {
  for (const cue of cues) {
    for (let i = 0; i < cue.words.length; i += 1) {
      const word = cue.words[i];
      if (word.t0 == null) {
        continue;
      }
      const nextStart =
        cue.words
          .slice(i + 1)
          .find((candidate) => candidate.t0 != null)?.t0 ?? cue.t1;
      word.t1 = Math.max(nextStart, word.t0 + 1e-4);
    }
  }
}

export function parseJson3(
  input: unknown,
  options: AlignOptions,
): WordToken[] {
  const document = (typeof input === 'string' ? JSON.parse(input) : input) as
    | Json3Document
    | null;
  const events = document?.events;
  if (!Array.isArray(events)) {
    return [];
  }

  const cues: TimedCue[] = [];
  for (const event of events) {
    const cue = cueFromEvent(event);
    if (cue) {
      cues.push(cue);
    }
  }
  assignEndTimes(cues);

  const tokens: WordToken[] = [];
  for (const cue of cues) {
    if (isMetaText(cue.rawText)) {
      tokens.push({
        t0: cue.t0,
        t1: cue.t1,
        text: cue.rawText,
        syllables: 0,
        jargon: false,
        meta: true,
      });
      continue;
    }

    const timed = cue.words.every(
      (word) => word.hasOffset && word.t0 != null && word.t1 != null,
    );
    if (timed) {
      tokens.push(
        ...tokensFromTimedWords(
          cue.words.map((word) => ({
            text: word.text,
            t0: word.t0 as number,
            t1: word.t1 as number,
          })),
        ),
      );
    } else {
      tokens.push(...proportionallyAlignCue(cue, options));
    }
  }

  tokens.sort((a, b) => a.t0 - b.t0);
  return tokens;
}

export function parseJson3Safe(
  input: unknown,
  options: AlignOptions,
): WordToken[] {
  try {
    return parseJson3(input, options);
  } catch {
    return [];
  }
}
