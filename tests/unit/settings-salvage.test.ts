import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  migrateSettings,
  parseSettings,
} from '../../src/lib/settings/defaults';
import { MAX_CHANNEL_OVERRIDES, MAX_DISABLED_VIDEOS } from '../../src/lib/settings/schema';

const custom = { ...DEFAULT_SETTINGS, targetWpm: 250, maxSpeed: 2.5, bRollAcceleration: true };

function videoIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `v${String(i).padStart(10, '0')}`);
}

describe('settings salvage', () => {
  it('keeps other settings when the disabled-video list grows past its cap', () => {
    const ids = videoIds(MAX_DISABLED_VIDEOS + 1);
    const result = migrateSettings({ ...custom, disabledVideoIds: ids });
    expect(result.targetWpm).toBe(250);
    expect(result.maxSpeed).toBe(2.5);
    expect(result.bRollAcceleration).toBe(true);
    expect(result.disabledVideoIds).toHaveLength(MAX_DISABLED_VIDEOS);
    // The newest (last-added) id survives; the oldest is dropped.
    expect(result.disabledVideoIds.at(-1)).toBe(ids.at(-1));
    expect(result.disabledVideoIds).not.toContain(ids[0]);
  });

  it('keeps the newest channel overrides when over the cap', () => {
    const overrides = Object.fromEntries(
      Array.from({ length: MAX_CHANNEL_OVERRIDES + 1 }, (_, i) => [
        `UC${String(i).padStart(22, '0')}`,
        { disabled: true },
      ]),
    );
    const result = parseSettings({ ...custom, channelOverrides: overrides });
    expect(result.targetWpm).toBe(250);
    const keys = Object.keys(result.channelOverrides);
    expect(keys).toHaveLength(MAX_CHANNEL_OVERRIDES);
    expect(keys).not.toContain(`UC${'0'.repeat(24 - 2)}`);
  });

  it('drops only the invalid field from an imported file', () => {
    const result = parseSettings({
      ...custom,
      wpmFloor: 5,
      channelOverrides: { good: { disabled: true }, bad: { targetWpm: 'fast' } },
      disabledVideoIds: ['abcdefghijk', 42],
    });
    expect(result.targetWpm).toBe(250);
    expect(result.wpmFloor).toBe(DEFAULT_SETTINGS.wpmFloor);
    expect(result.channelOverrides).toEqual({ good: { disabled: true } });
    expect(result.disabledVideoIds).toEqual(['abcdefghijk']);
  });

  it('still repairs min/max ordering', () => {
    const result = parseSettings({ ...custom, minSpeed: 3, maxSpeed: 2 });
    expect(result.minSpeed).toBeLessThan(result.maxSpeed);
    expect(result.targetWpm).toBe(250);
  });
});
