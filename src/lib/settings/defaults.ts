import {
  DynamicSpeedSettingsSchema,
  type DynamicSpeedSettings,
} from './schema';

export const DEFAULT_SETTINGS: DynamicSpeedSettings =
  DynamicSpeedSettingsSchema.parse({});

export function parseSettings(input: unknown): DynamicSpeedSettings {
  const direct = DynamicSpeedSettingsSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  const source =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...source,
    channelOverrides: {
      ...DEFAULT_SETTINGS.channelOverrides,
      ...(typeof source.channelOverrides === 'object' && source.channelOverrides
        ? source.channelOverrides
        : {}),
    },
    disabledVideoIds: Array.isArray(source.disabledVideoIds)
      ? source.disabledVideoIds.filter((id): id is string => typeof id === 'string')
      : DEFAULT_SETTINGS.disabledVideoIds,
  };

  if (
    typeof merged.minSpeed === 'number' &&
    typeof merged.maxSpeed === 'number' &&
    merged.minSpeed >= merged.maxSpeed
  ) {
    merged.maxSpeed = Math.min(5, merged.minSpeed + 0.25);
  }

  const retry = DynamicSpeedSettingsSchema.safeParse(merged);
  return retry.success ? retry.data : DEFAULT_SETTINGS;
}

export function migrateSettings(input: unknown): DynamicSpeedSettings {
  return parseSettings(input);
}
