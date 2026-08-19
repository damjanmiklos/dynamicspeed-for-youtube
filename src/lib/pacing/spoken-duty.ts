import { clamp } from './feel';
import type { SpeechChunk } from './curve';

/**
 * Listening WPM is words in this window divided by window duration (video time).
 * Wide enough that a few pause-inflated caption words cannot dominate 60/dt.
 */
export const WPM_WINDOW_SEC = 4;
/** Alias used by older tests and comments. */
export const SPOKEN_DUTY_WINDOW_SEC = WPM_WINDOW_SEC;
/** Floor on spoken/video ratio so 1/ρ cannot explode on almost-empty windows. */
export const MIN_SPOKEN_DUTY_RATIO = 0.12;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Blend listening WPM toward span-only (articulation) WPM.
 * W_adj = W_listen * ((1 - s) + s / ρ) where ρ = spoken_span / video_time.
 * When captions abut (ρ ≈ 1), this is a no-op.
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

function intervalOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Instantaneous WPM from a sliding video-time window.
 *
 * Listening rate: 60 × (effective words whose onset falls in the window) / window seconds.
 * That is how many words you hear per minute of video, including short gaps and
 * pause-inflated caption tails. One-word 60/duration samples are not used.
 *
 * Spoken-time strength blends toward counting only the union of caption spans
 * (true timestamp holes between words). It does not assume a 300 WPM talking speed.
 * Long pauses are split out before this runs.
 */
export function wpmWithSpokenDuty(
  chunks: SpeechChunk[],
  strength: number,
  windowSec: number,
  wpmFloor: number,
  wpmCeil: number,
): SpeechChunk[] {
  const n = chunks.length;
  if (n === 0) {
    return [];
  }

  const s = clamp(finite(strength, 0), 0, 1);
  const radius = Math.max(finite(windowSec, WPM_WINDOW_SEC), 0.5) / 2;
  const seg0 = chunks[0].t0;
  const seg1 = chunks[n - 1].t1;
  const out: SpeechChunk[] = new Array(n);
  let loOnset = 0;
  let hiOnset = 0;
  let spanLo = 0;

  for (let i = 0; i < n; i += 1) {
    const chunk = chunks[i];
    const t = finite(chunk.t, (chunk.t0 + chunk.t1) / 2);
    const lo = t - radius;
    const hi = t + radius;
    while (loOnset < n && chunks[loOnset].t0 < lo) {
      loOnset += 1;
    }
    if (hiOnset < loOnset) {
      hiOnset = loOnset;
    }
    while (hiOnset < n && chunks[hiOnset].t0 <= hi) {
      hiOnset += 1;
    }

    let words = 0;
    for (let j = loOnset; j < hiOnset; j += 1) {
      words += chunks[j].wEff;
    }

    const tLo = Math.max(seg0, lo);
    const tHi = Math.min(seg1, hi);
    const listenDt = Math.max(tHi - tLo, 1e-3);
    const listenWpm = (words / listenDt) * 60;

    let mixed = listenWpm;
    if (s > 0) {
      while (spanLo < n && chunks[spanLo].t1 <= tLo) {
        spanLo += 1;
      }
      let spokenDt = 0;
      for (let j = spanLo; j < n && chunks[j].t0 < tHi; j += 1) {
        spokenDt += intervalOverlap(chunks[j].t0, chunks[j].t1, tLo, tHi);
      }
      const ratio = listenDt > 1e-3 ? spokenDt / listenDt : 1;
      mixed = listenWpm * spokenDutyMultiplier(ratio, s);
    }

    out[i] = {
      ...chunk,
      wpm: clamp(finite(mixed, wpmFloor), wpmFloor, wpmCeil),
    };
  }
  return out;
}
