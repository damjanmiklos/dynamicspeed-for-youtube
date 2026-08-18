import { lerp, smoothstep } from './feel';
import { INTRO_SLEW_SEC, SEEK_SNAP_SEC } from '../settings/limits';

/** Situational slew: never run this every frame on an already-smooth curve. */

export function slewStep(
  current: number,
  target: number,
  dtSec: number,
  limitPerSec: number,
): number {
  if (!Number.isFinite(current)) {
    return target;
  }
  if (!Number.isFinite(target) || dtSec <= 0) {
    return current;
  }
  const maxDelta = Math.max(0, limitPerSec) * dtSec;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

export const RATE_JUMP_EPSILON = 0.08;

/** True when playhead moved farther than one animation frame, i.e. a skip. */
export function isSeekJump(
  previousTime: number,
  nextTime: number,
  thresholdSec = SEEK_SNAP_SEC,
): boolean {
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) {
    return false;
  }
  return Math.abs(nextTime - previousTime) > thresholdSec;
}

export function introRate(
  from: number,
  to: number,
  elapsedSec: number,
  durationSec = INTRO_SLEW_SEC,
): number {
  if (durationSec <= 0) {
    return to;
  }
  return lerp(from, to, smoothstep(elapsedSec / durationSec));
}
