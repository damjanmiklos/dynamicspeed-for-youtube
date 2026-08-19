import { clamp } from './feel';
import type { SpeechChunk } from './curve';

/** Continuous speech at this WPM fills a caption interval; extra duration is pause. */
export const ARTICULATION_REF_WPM = 300;
export const ARTICULATION_SEC_PER_WORD = 60 / ARTICULATION_REF_WPM;
/** Tails shorter than this are timing jitter, not a pause. */
export const MIN_SHORT_PAUSE_SEC = 0.1;
/** Local duty-cycle window, in seconds, that does not cross long pauses. */
export const SPOKEN_DUTY_WINDOW_SEC = 6;
/** Floor on spoken ratio so 1/ρ cannot explode on almost-empty windows. */
export const MIN_SPOKEN_DUTY_RATIO = 0.12;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Estimated voiced duration inside a caption interval.
 * Speech is assumed to occupy the start of the interval; leftover time is a trailing pause
 * (YouTube word `t1` is often the next word’s start).
 */
export function estimateVoicedSec(wEff: number, duration: number): number {
  const dt = Math.max(duration, 1e-3);
  if (!(wEff > 0)) {
    return dt;
  }
  const expected = wEff * ARTICULATION_SEC_PER_WORD;
  const voiced = Math.min(dt, Math.max(1e-3, expected));
  if (dt - voiced < MIN_SHORT_PAUSE_SEC) {
    return dt;
  }
  return voiced;
}

/**
 * Blend wall-clock WPM toward articulation WPM.
 * W_adj = W_meas * ((1 - s) + s / ρ) = (1-s) * W_meas + s * (W_meas / ρ)
 * When ρ = 1 (fully spoken), multiplier is 1. Long-pause regions are not passed in (ρ would be 0).
 */
export function spokenDutyMultiplier(ratio: number, strength: number): number {
  const s = clamp(strength, 0, 1);
  if (s <= 0) {
    return 1;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }
  const rho = clamp(ratio, MIN_SPOKEN_DUTY_RATIO, 1);
  return 1 - s + s / rho;
}

/** Drop trailing silence longer than `longPauseSec` so existing pause/b-roll logic can see a gap. */
export function excludeLongPauseTails(
  chunks: SpeechChunk[],
  longPauseSec: number,
): SpeechChunk[] {
  return chunks.map((chunk) => {
    const dt = Math.max(chunk.t1 - chunk.t0, 1e-3);
    const voiced = estimateVoicedSec(chunk.wEff, dt);
    const tail = dt - voiced;
    if (tail <= longPauseSec) {
      return { ...chunk, t: (chunk.t0 + chunk.t1) / 2 };
    }
    const t1 = chunk.t0 + voiced;
    return { ...chunk, t1, t: (chunk.t0 + t1) / 2, wpm: chunk.wpm };
  });
}

function intervalOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Raise WPM toward the rate during actual speech, using the local spoken-time fraction.
 * `T_spoken / T_covered` is computed on caption-covered time only (holes between chunks are
 * left to long-pause handling). Strength 0 is a no-op.
 */
export function wpmWithSpokenDuty(
  chunks: SpeechChunk[],
  strength: number,
  windowSec: number,
  wpmFloor: number,
  wpmCeil: number,
): SpeechChunk[] {
  const s = clamp(finite(strength, 0), 0, 1);
  if (chunks.length === 0) {
    return [];
  }
  if (s <= 0) {
    return chunks.map((chunk) => {
      const dt = Math.max(chunk.t1 - chunk.t0, 1e-3);
      const raw = (chunk.wEff / dt) * 60;
      return {
        ...chunk,
        wpm: clamp(finite(raw, wpmFloor), wpmFloor, wpmCeil),
      };
    });
  }

  const n = chunks.length;
  const radius = Math.max(windowSec, 0.5);
  const voiced: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const chunk = chunks[i];
    voiced[i] = estimateVoicedSec(chunk.wEff, Math.max(chunk.t1 - chunk.t0, 1e-3));
  }

  const out: SpeechChunk[] = new Array(n);
  let loIdx = 0;
  for (let i = 0; i < n; i += 1) {
    const chunk = chunks[i];
    const lo = chunk.t - radius;
    const hi = chunk.t + radius;
    while (loIdx < n && chunks[loIdx].t1 <= lo) {
      loIdx += 1;
    }
    let spoken = 0;
    let covered = 0;
    for (let j = loIdx; j < n && chunks[j].t0 < hi; j += 1) {
      const other = chunks[j];
      covered += intervalOverlap(other.t0, other.t1, lo, hi);
      spoken += intervalOverlap(other.t0, other.t0 + voiced[j], lo, hi);
    }

    const dt = Math.max(chunk.t1 - chunk.t0, 1e-3);
    const raw = (chunk.wEff / dt) * 60;
    const ratio = covered > 1e-3 ? spoken / covered : 1;
    const adjusted = finite(raw, wpmFloor) * spokenDutyMultiplier(ratio, s);
    out[i] = {
      ...chunk,
      wpm: clamp(finite(adjusted, wpmFloor), wpmFloor, wpmCeil),
    };
  }
  return out;
}
