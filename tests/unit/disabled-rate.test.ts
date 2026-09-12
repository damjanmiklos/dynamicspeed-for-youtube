import { describe, expect, it } from 'vitest';
import { disabledRateAction } from '../../src/lib/youtube/playback';

describe('disabledRateAction', () => {
  it('keeps writing only while Force 1× is held', () => {
    expect(
      disabledRateAction({
        forceHold: 1,
        restore1xWhenDisabled: true,
        alreadyRestored: false,
      }),
    ).toBe('write-force');
  });

  it('restores default speed once, then releases the rate', () => {
    expect(
      disabledRateAction({
        forceHold: null,
        restore1xWhenDisabled: true,
        alreadyRestored: false,
      }),
    ).toBe('restore-once');
    expect(
      disabledRateAction({
        forceHold: null,
        restore1xWhenDisabled: true,
        alreadyRestored: true,
      }),
    ).toBe('release');
  });

  it('never writes when restore-on-disable is off', () => {
    expect(
      disabledRateAction({
        forceHold: null,
        restore1xWhenDisabled: false,
        alreadyRestored: false,
      }),
    ).toBe('release');
  });
});
