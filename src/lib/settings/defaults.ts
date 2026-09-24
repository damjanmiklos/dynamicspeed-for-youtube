import type { z } from 'zod';
import {
  ChannelOverrideSchema,
  DynamicSpeedSettingsObject,
  DynamicSpeedSettingsSchema,
  MAX_CHANNEL_OVERRIDES,
  MAX_DISABLED_VIDEOS,
  SETTINGS_VERSION,
  type ChannelOverride,
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

/** Valid overrides only; the newest (last-inserted) win when over the cap. */
function salvageChannelOverrides(value: unknown): Record<string, ChannelOverride> {
  const valid: Array<[string, ChannelOverride]> = [];
  for (const [key, item] of Object.entries(copyPlain(value))) {
    if (key.length > 64) {
      continue;
    }
    const parsed = ChannelOverrideSchema.safeParse(item);
    if (parsed.success) {
      valid.push([key, parsed.data]);
    }
  }
  return Object.fromEntries(valid.slice(-MAX_CHANNEL_OVERRIDES));
}

/** Valid ids only; the most recently added win when over the cap. */
function salvageDisabledVideoIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SETTINGS.disabledVideoIds;
  }
  const ids = value.filter(
    (id): id is string => typeof id === 'string' && id.length <= 32,
  );
  return [...new Set(ids)].slice(-MAX_DISABLED_VIDEOS);
}

export function parseSettings(input: unknown): DynamicSpeedSettings {
  const direct = DynamicSpeedSettingsSchema.safeParse(input);
  if (direct.success) {
    return direct.data;
  }

  // Salvage field by field. One bad or oversized value (an imported file, or a
  // list that grew past its cap) must not reset every other setting.
  const source = copyPlain(input);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = DynamicSpeedSettingsObject.shape as Record<string, z.ZodTypeAny>;
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'channelOverrides' || key === 'disabledVideoIds' || !(key in source)) {
      continue;
    }
    const parsed = field.safeParse(source[key]);
    if (parsed.success) {
      merged[key] = parsed.data;
    }
  }
  merged.channelOverrides = salvageChannelOverrides(source.channelOverrides);
  merged.disabledVideoIds = salvageDisabledVideoIds(source.disabledVideoIds);

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
  // Older shipping defaults glued ordinary words (0.3s) or still merged more
  // than needed (0.15s). Only rewrite those exact former defaults.
  if (previousVersion < 2 && source.minChunkSec === 0.3) {
    source.minChunkSec = 0.1;
  }
  if (previousVersion < 3 && source.minChunkSec === 0.15) {
    source.minChunkSec = 0.1;
  }
  // v3 and earlier defaulted caption language to English, which picked English
  // ASR/translations on non-English videos. Spoken-language auto is the new default.
  if (previousVersion < 4 && source.captionLanguage === 'en') {
    source.captionLanguage = 'auto';
  }
  // v4 and earlier defaulted syllable weighting on. Word-count WPM matches
  // caption timings more faithfully; the old default is no longer recommended.
  if (previousVersion < 5 && source.syllableWeighting === true) {
    source.syllableWeighting = false;
  }
  source.version = Math.max(previousVersion, SETTINGS_VERSION);
  return parseSettings(source);
}
