import {
  DynamicSpeedSettingsSchema,
  SETTINGS_VERSION,
  type DynamicSpeedSettings,
} from './schema';

export const DEFAULT_SETTINGS: DynamicSpeedSettings =
  DynamicSpeedSettingsSchema.parse({});

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function copyPlain(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return {};
  }
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    out[key] = item;
  }
  return out;
}

export function parseSettings(input: unknown): DynamicSpeedSettings {
  const direct = DynamicSpeedSettingsSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  const source = copyPlain(input);
  const merged: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...source,
    channelOverrides: {
      ...DEFAULT_SETTINGS.channelOverrides,
      ...copyPlain(source.channelOverrides),
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
  const source = copyPlain(input);
  const previousVersion =
    typeof source.version === 'number' && Number.isFinite(source.version)
      ? source.version
      : 1;
  // v1 defaulted minChunkSec to 0.3s, which glued ordinary words together.
  if (previousVersion < 2 && source.minChunkSec === 0.3) {
    source.minChunkSec = 0.15;
  }
  source.version = Math.max(previousVersion, SETTINGS_VERSION);
  return parseSettings(source);
}
