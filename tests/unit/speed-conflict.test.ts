import { describe, expect, it } from 'vitest';
import {
  CONFLICT_CLEAR_MS,
  CONFLICT_CONSECUTIVE_NEEDED,
  CONFLICT_CONSTANT_NEEDED,
  CONFLICT_HIT_WINDOW_MS,
  CONFLICT_HITS_NEEDED,
  createSpeedConflictTracker,
  ratesDisagree,
  stolenPlaybackRate,
} from '../../src/lib/youtube/speed-conflict';

describe('ratesDisagree', () => {
  it('ignores tiny rounding around a held rate', () => {
    expect(ratesDisagree(1.5, 1.5)).toBe(false);
    expect(ratesDisagree(1.5, 1.52)).toBe(false);
    expect(ratesDisagree(1.5, 2)).toBe(true);
  });
});

describe('stolenPlaybackRate', () => {
  it('is silent when the rate we wrote still holds', () => {
    expect(stolenPlaybackRate(1.2, 1.2, 1.25, 1.25)).toBeNull();
    expect(stolenPlaybackRate(null, 1, 1.5, 1.5)).toBeNull();
  });

  it('catches a setter hook that ignores our write', () => {
    expect(stolenPlaybackRate(1.2, 1.2, 1.5, 2)).toBe(2);
  });

  it('catches a poller that overwrote the previous frame', () => {
    expect(stolenPlaybackRate(1.2, 2, 1.25, 1.25)).toBe(2);
  });
});

describe('speed conflict tracker', () => {
  it('does not trip on a single YouTube-menu speed click', () => {
    const tracker = createSpeedConflictTracker();
    tracker.noteMismatch(0, 1.5);
    expect(tracker.isActive()).toBe(false);
    tracker.noteMatch(16);
    tracker.noteMatch(32);
    expect(tracker.isActive()).toBe(false);
  });

  it('trips when another extension resets the rate every frame', () => {
    const tracker = createSpeedConflictTracker();
    for (let i = 0; i < CONFLICT_CONSECUTIVE_NEEDED; i += 1) {
      tracker.noteMismatch(i * 16, 2);
    }
    expect(tracker.isActive()).toBe(true);
  });

  it('still trips for a slow poller that snaps back to the same speed', () => {
    const tracker = createSpeedConflictTracker();
    for (let i = 0; i < CONFLICT_CONSTANT_NEEDED; i += 1) {
      const t = i * 600;
      tracker.noteMismatch(t, 1.75);
      tracker.noteMatch(t + 16);
      tracker.noteMatch(t + 32);
    }
    expect(tracker.isActive()).toBe(true);
  });

  it('counts spaced hits even when matches happen in between', () => {
    const tracker = createSpeedConflictTracker();
    for (let i = 0; i < CONFLICT_HITS_NEEDED; i += 1) {
      const t = i * 400;
      tracker.noteMismatch(t, 1.25 + i * 0.1);
      tracker.noteMatch(t + 16);
    }
    expect(tracker.isActive()).toBe(true);
  });

  it('forgets old hits once they leave the window', () => {
    const tracker = createSpeedConflictTracker();
    tracker.noteMismatch(0, 2);
    tracker.noteMismatch(20, 2);
    tracker.noteMismatch(CONFLICT_HIT_WINDOW_MS + 40, 1.25);
    expect(tracker.isActive()).toBe(false);
  });

  it('clears the warning after the rate holds again', () => {
    const tracker = createSpeedConflictTracker();
    for (let i = 0; i < CONFLICT_CONSECUTIVE_NEEDED; i += 1) {
      tracker.noteMismatch(i * 16, 2);
    }
    expect(tracker.isActive()).toBe(true);
    const heldFrom = 200;
    tracker.noteMatch(heldFrom);
    tracker.noteMatch(heldFrom + CONFLICT_CLEAR_MS - 1);
    expect(tracker.isActive()).toBe(true);
    tracker.noteMatch(heldFrom + CONFLICT_CLEAR_MS);
    expect(tracker.isActive()).toBe(false);
  });

  it('keeps the warning if the other extension starts fighting again', () => {
    const tracker = createSpeedConflictTracker();
    for (let i = 0; i < CONFLICT_CONSECUTIVE_NEEDED; i += 1) {
      tracker.noteMismatch(i * 16, 2);
    }
    tracker.noteMatch(200);
    tracker.noteMismatch(400, 2);
    tracker.noteMatch(400 + CONFLICT_CLEAR_MS);
    expect(tracker.isActive()).toBe(true);
  });
});
