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
