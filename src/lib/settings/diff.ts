import type { DynamicSpeedSettings } from './schema';

/** Settings that change the WPM→rate curve or the fallback rate. */
export function speedCalculationChanged(
  previous: DynamicSpeedSettings,
  next: DynamicSpeedSettings,
): boolean {
  return (
    previous.targetWpm !== next.targetWpm ||
    previous.minSpeed !== next.minSpeed ||
    previous.maxSpeed !== next.maxSpeed ||
    previous.fallbackSpeed !== next.fallbackSpeed ||
    previous.responsiveness !== next.responsiveness ||
    previous.customDynamicsUnlocked !== next.customDynamicsUnlocked ||
    previous.gaussianSigma !== next.gaussianSigma ||
    previous.medianWindowSec !== next.medianWindowSec ||
    previous.slewRateLimit !== next.slewRateLimit ||
    previous.syllableWeighting !== next.syllableWeighting ||
    previous.jargonCompensation !== next.jargonCompensation ||
    previous.minChunkSec !== next.minChunkSec ||
    previous.wpmFloor !== next.wpmFloor ||
    previous.wpmCeil !== next.wpmCeil ||
    previous.bRollAcceleration !== next.bRollAcceleration ||
    previous.longPauseSec !== next.longPauseSec ||
    previous.treatMusicAsBRoll !== next.treatMusicAsBRoll ||
    previous.enabled !== next.enabled ||
    previous.ignoreAds !== next.ignoreAds ||
    previous.ignoreMusicVideos !== next.ignoreMusicVideos ||
    previous.enableOnShorts !== next.enableOnShorts ||
    previous.restore1xWhenDisabled !== next.restore1xWhenDisabled ||
    JSON.stringify(previous.channelOverrides) !== JSON.stringify(next.channelOverrides) ||
    JSON.stringify(previous.disabledVideoIds) !== JSON.stringify(next.disabledVideoIds)
  );
}

export function captionSourceChanged(
  previous: DynamicSpeedSettings,
  next: DynamicSpeedSettings,
): boolean {
  return (
    previous.captionLanguage !== next.captionLanguage ||
    previous.preferManualCaptions !== next.preferManualCaptions
  );
}
