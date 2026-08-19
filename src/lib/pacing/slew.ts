import { lerp, smoothstep } from './feel';
import { INTRO_SLEW_SEC, SEEK_SNAP_SEC } from '../settings/limits';

/** Cap playback-rate change per wall-clock second. */

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

/**
 * Slowing down from 3× has little wall-clock time per second of video.
 * Scale the downward slew by the current rate so a video-time lead of
 * |Δrate| / baseLimit can finish before speech resumes.
 */
export function slewLimitForStep(
  current: number,
  target: number,
  baseLimitPerSec: number,
): number {
  const base = Math.max(0, Number.isFinite(baseLimitPerSec) ? baseLimitPerSec : 0);
  if (!(target < current) || !Number.isFinite(current)) {
    return base;
  }
  return base * Math.max(current, 1);
}

export const RATE_JUMP_EPSILON = 0.08;

/**
 * True when the playhead moved farther than playback can explain.
 * `expectedDeltaSec` is playbackRate × frame dt (0 while paused).
 */
export function isSeekJump(
  previousTime: number,
  nextTime: number,
  thresholdSec = SEEK_SNAP_SEC,
  expectedDeltaSec = 0,
): boolean {
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) {
    return false;
  }
  const expected = Number.isFinite(expectedDeltaSec) ? expectedDeltaSec : 0;
  return Math.abs(nextTime - previousTime - expected) > thresholdSec;
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
