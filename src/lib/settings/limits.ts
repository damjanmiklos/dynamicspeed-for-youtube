export const LIMITS = {
  targetWpm: { min: 80, max: 800, step: 1, decimals: 0 },
  minSpeed: { min: 0.25, max: 4, step: 0.05, decimals: 2 },
  maxSpeed: { min: 0.5, max: 5, step: 0.05, decimals: 2 },
  fallbackSpeed: { min: 0.25, max: 5, step: 0.05, decimals: 2 },
  responsiveness: { min: 0, max: 1, step: 0.01, decimals: 0 },
  gaussianSigma: { min: 2, max: 30, step: 0.5, decimals: 1 },
  medianWindowSec: { min: 1, max: 15, step: 0.5, decimals: 1 },
  slewRateLimit: { min: 0.05, max: 2, step: 0.05, decimals: 2 },
  jargonCompensation: { min: 1, max: 1.5, step: 0.01, decimals: 2 },
  minChunkSec: { min: 0.1, max: 1, step: 0.05, decimals: 2 },
  spokenDutyStrength: { min: 0, max: 1, step: 0.05, decimals: 2 },
  longPauseSec: { min: 0.5, max: 5, step: 0.1, decimals: 1 },
  manualOverrideTimeoutSec: { min: 0, max: 60, step: 1, decimals: 0 },
  chipDecimalPlaces: { min: 1, max: 2, step: 1, decimals: 0 },
} as const;

export const INTRO_SLEW_SEC = 2;
/** How quickly playback eases to the fallback speed when there is no transcript. */
export const FALLBACK_SLEW_SEC = 0.35;
/** Unexplained playhead jump vs expected playbackRate × dt. Rate snaps. */
export const SEEK_SNAP_SEC = 0.35;
