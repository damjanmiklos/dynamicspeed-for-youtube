import { describe, expect, it } from 'vitest';
import { shouldApplySpeedCurve } from '../../src/lib/youtube/controller';

describe('speed curve gating', () => {
  it('does not apply a curve while captions are still loading', () => {
    expect(shouldApplySpeedCurve('loading', true)).toBe(false);
    expect(shouldApplySpeedCurve('idle', true)).toBe(false);
    expect(shouldApplySpeedCurve('missing', true)).toBe(false);
    expect(shouldApplySpeedCurve('no-video', false)).toBe(false);
  });

  it('applies a curve only once the transcript is ready', () => {
    expect(shouldApplySpeedCurve('ready', true)).toBe(true);
    expect(shouldApplySpeedCurve('ready', false)).toBe(false);
  });
});
