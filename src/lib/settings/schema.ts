import { z } from 'zod';
import { LIMITS } from './limits';

export const ChannelOverrideSchema = z.object({
  disabled: z.boolean().optional(),
  targetWpm: z.number().min(LIMITS.targetWpm.min).max(LIMITS.targetWpm.max).optional(),
  maxSpeed: z.number().min(LIMITS.maxSpeed.min).max(LIMITS.maxSpeed.max).optional(),
  name: z.string().max(200).optional(),
});

export const DynamicSpeedSettingsSchema = z
  .object({
    version: z.number().default(1),
    enabled: z.boolean().default(true),
    targetWpm: z.number().min(LIMITS.targetWpm.min).max(LIMITS.targetWpm.max).default(165),
    minSpeed: z.number().min(LIMITS.minSpeed.min).max(LIMITS.minSpeed.max).default(0.75),
    maxSpeed: z.number().min(LIMITS.maxSpeed.min).max(LIMITS.maxSpeed.max).default(3),
    fallbackSpeed: z
      .number()
      .min(LIMITS.fallbackSpeed.min)
      .max(LIMITS.fallbackSpeed.max)
      .default(1),

    responsiveness: z.number().min(0).max(1).default(0.5),
    customDynamicsUnlocked: z.boolean().default(false),
    gaussianSigma: z.number().min(2).max(30).default(10),
    medianWindowSec: z.number().min(1).max(15).default(5),
    slewRateLimit: z.number().min(0.05).max(2).default(0.3),

    syllableWeighting: z.boolean().default(true),
    jargonCompensation: z.number().min(1).max(1.5).default(1.15),
    minChunkSec: z.number().min(0.1).max(1).default(0.3),
    wpmFloor: z.number().min(20).max(200).default(60),
    wpmCeil: z.number().min(200).max(800).default(450),

    bRollAcceleration: z.boolean().default(false),
    longPauseSec: z.number().min(0.5).max(5).default(1.8),
    treatMusicAsBRoll: z.boolean().default(true),

    channelOverrides: z
      .record(z.string().max(64), ChannelOverrideSchema)
      .default({})
      .refine((value) => Object.keys(value).length <= 100, {
        message: 'Too many channel overrides',
      })
      .refine(
        (value) =>
          Object.keys(value).every(
            (key) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype',
          ),
        { message: 'Invalid channel override key' },
      ),
    disabledVideoIds: z.array(z.string().max(32)).max(200).default([]),
    captionLanguage: z.string().min(2).max(16).default('en'),
    preferManualCaptions: z.boolean().default(true),
    manualOverrideTimeoutSec: z.number().min(0).max(60).default(10),
    ignoreAds: z.boolean().default(true),
    ignoreMusicVideos: z.boolean().default(true),
    enableOnShorts: z.boolean().default(true),
    restore1xWhenDisabled: z.boolean().default(true),

    showPlayerChip: z.boolean().default(true),
    chipDecimalPlaces: z.number().min(1).max(2).default(2),
    showWpmInTooltip: z.boolean().default(true),

    expireCaptionCacheAfterWeek: z.boolean().default(true),
  })
  .refine((settings) => settings.minSpeed < settings.maxSpeed, {
    message: 'minSpeed must be less than maxSpeed',
    path: ['minSpeed'],
  });

export type ChannelOverride = z.infer<typeof ChannelOverrideSchema>;
export type DynamicSpeedSettings = z.infer<typeof DynamicSpeedSettingsSchema>;

export const SETTINGS_STORAGE_KEY = 'ds.settings';
export const TRANSCRIPT_CACHE_KEY = 'ds.transcriptCache.v3';
export const SETTINGS_VERSION = 1;
