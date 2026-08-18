/** How far the actual rate may drift from what we wrote before it counts as a steal. */
export const RATE_HOLD_EPSILON = 0.05;
/** Mismatches inside this window count toward a fight (covers slow polling enforcers). */
export const CONFLICT_HIT_WINDOW_MS = 2500;
/** Hits in the window needed to flag a fight when the forced rate is not constant. */
export const CONFLICT_HITS_NEEDED = 6;
/** Consecutive losing frames (sync ratechange resetters / setter hooks). */
export const CONFLICT_CONSECUTIVE_NEEDED = 4;
/** Same snapped-to rate this many times is almost certainly a fixed-speed extension. */
export const CONFLICT_CONSTANT_NEEDED = 4;
/** How long the rate must hold before we drop the warning. */
export const CONFLICT_CLEAR_MS = 3000;

export function ratesDisagree(expected: number, actual: number, epsilon = RATE_HOLD_EPSILON): boolean {
  return Math.abs(expected - actual) > epsilon;
}

/** Rate another script forced, or null if our last write still holds. */
export function stolenPlaybackRate(
  lastOwnedRate: number | null,
  beforeWrite: number,
  expected: number,
  afterWrite: number,
): number | null {
  const stolenBefore =
    lastOwnedRate != null && ratesDisagree(lastOwnedRate, beforeWrite);
  const stolenAfter = ratesDisagree(expected, afterWrite);
  if (!stolenBefore && !stolenAfter) {
    return null;
  }
  return stolenAfter ? afterWrite : beforeWrite;
}

function sameRate(a: number, b: number): boolean {
  return Math.abs(a - b) <= RATE_HOLD_EPSILON;
}

export type SpeedConflictTracker = {
  noteMismatch(now: number, forcedRate: number): void;
  noteMatch(now: number): void;
  isActive(): boolean;
  reset(): void;
};

export function createSpeedConflictTracker(): SpeedConflictTracker {
  const hitTimes: number[] = [];
  const hitRates: number[] = [];
  let consecutive = 0;
  let lastGoodAt = 0;
  let active = false;

  function prune(now: number): void {
    while (hitTimes.length > 0 && now - hitTimes[0]! > CONFLICT_HIT_WINDOW_MS) {
      hitTimes.shift();
      hitRates.shift();
    }
  }

  function constantForce(): boolean {
    if (hitRates.length < CONFLICT_CONSTANT_NEEDED) {
      return false;
    }
    const latest = hitRates[hitRates.length - 1]!;
    return hitRates.slice(-CONFLICT_CONSTANT_NEEDED).every((rate) => sameRate(rate, latest));
  }

  return {
    noteMismatch(now, forcedRate) {
      consecutive += 1;
      lastGoodAt = 0;
      hitTimes.push(now);
      hitRates.push(forcedRate);
      prune(now);
      if (
        consecutive >= CONFLICT_CONSECUTIVE_NEEDED ||
        hitTimes.length >= CONFLICT_HITS_NEEDED ||
        constantForce()
      ) {
        active = true;
      }
    },
    noteMatch(now) {
      consecutive = 0;
      prune(now);
      if (!active) {
        return;
      }
      if (lastGoodAt === 0) {
        lastGoodAt = now;
      }
      if (now - lastGoodAt >= CONFLICT_CLEAR_MS) {
        active = false;
        hitTimes.length = 0;
        hitRates.length = 0;
        lastGoodAt = 0;
      }
    },
    isActive() {
      return active;
    },
    reset() {
      hitTimes.length = 0;
      hitRates.length = 0;
      consecutive = 0;
      lastGoodAt = 0;
      active = false;
    },
  };
}
