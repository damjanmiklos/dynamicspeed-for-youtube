import type { Json3Document, Json3Event } from './types';

const ZERO_WIDTH = /\u200b/g;
const MIN_ANIMATION_EVENTS = 40;
const SHORT_FRAME_MS = 120;
const SHORT_FRAME_RATIO = 0.4;
const REDRAW_RATIO = 0.5;
const SAMPLE_EVENTS = 500;

export function json3EventPlainText(event: Json3Event): string {
  return (event.segs ?? [])
    .map((seg) => seg.utf8 ?? '')
    .join('')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * YouTube "Animated" / kinetic caption tracks redraw the same line every
 * few dozen milliseconds. Those frames are valid JSON3 but unusable as WPM.
 */
export function json3LooksLikeAnimationFrames(input: unknown): boolean {
  if (!input || typeof input !== 'object') {
    return false;
  }
  const events = (input as Json3Document).events;
  if (!Array.isArray(events) || events.length < MIN_ANIMATION_EVENTS) {
    return false;
  }

  let withText = 0;
  let short = 0;
  let compared = 0;
  let redrawn = 0;
  let previous = '';
  const sample = events.slice(0, SAMPLE_EVENTS);
  for (const raw of sample) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const event = raw as Json3Event;
    const text = json3EventPlainText(event);
    if (!text) {
      continue;
    }
    withText += 1;
    const duration = event.dDurationMs ?? 0;
    if (duration > 0 && duration <= SHORT_FRAME_MS) {
      short += 1;
    }
    if (previous) {
      compared += 1;
      if (
        text === previous ||
        text.startsWith(previous) ||
        previous.startsWith(text)
      ) {
        redrawn += 1;
      }
    }
    previous = text;
  }

  if (withText < MIN_ANIMATION_EVENTS) {
    return false;
  }
  const shortRatio = short / withText;
  // Word-by-word karaoke: consecutive events are different words, so the
  // grow/identical check never fires, but almost every event is a 50ms frame.
  if (shortRatio >= 0.5) {
    return true;
  }
  if (compared === 0) {
    return false;
  }
  return shortRatio >= SHORT_FRAME_RATIO && redrawn / compared >= REDRAW_RATIO;
}
