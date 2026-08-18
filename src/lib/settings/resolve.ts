import type { DynamicSpeedSettings } from './schema';
import { resolveDynamics } from '../pacing/feel';

export type PageIdentity = {
  videoId: string | null;
  channelId: string | null;
  isShorts: boolean;
  isMusic: boolean;
  isLive: boolean;
};

export type ResolvedPlaybackSettings = DynamicSpeedSettings & {
  automationAllowed: boolean;
  blockReason: string | null;
};

export function resolveForPage(
  settings: DynamicSpeedSettings,
  page: PageIdentity,
): ResolvedPlaybackSettings {
  const override = page.channelId
    ? settings.channelOverrides[page.channelId]
    : undefined;

  const targetWpm = override?.targetWpm ?? settings.targetWpm;
  const maxSpeed = override?.maxSpeed ?? settings.maxSpeed;
  const minSpeed =
    settings.minSpeed < maxSpeed ? settings.minSpeed : Math.max(0.25, maxSpeed - 0.25);

  let automationAllowed = settings.enabled;
  let blockReason: string | null = null;

  if (!settings.enabled) {
    blockReason = 'paused';
  } else if (page.videoId && settings.disabledVideoIds.includes(page.videoId)) {
    automationAllowed = false;
    blockReason = 'video-disabled';
  } else if (override?.disabled) {
    automationAllowed = false;
    blockReason = 'channel-disabled';
  } else if (page.isShorts && !settings.enableOnShorts) {
    automationAllowed = false;
    blockReason = 'shorts-disabled';
  } else if (page.isMusic && settings.ignoreMusicVideos) {
    automationAllowed = false;
    blockReason = 'music-disabled';
  }

  const merged: DynamicSpeedSettings = {
    ...settings,
    targetWpm,
    minSpeed,
    maxSpeed,
  };

  return {
    ...merged,
    ...resolveDynamics(merged),
    automationAllowed,
    blockReason,
  };
}
