export function applyPreservesPitch(video: HTMLVideoElement): void {
  video.preservesPitch = true;
  (video as HTMLVideoElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
  (video as HTMLVideoElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
}

export function setPlaybackRate(video: HTMLVideoElement, rate: number): void {
  applyPreservesPitch(video);
  if (!Number.isFinite(rate)) {
    return;
  }
  const clamped = Math.min(16, Math.max(0.07, rate));
  if (Math.abs(video.playbackRate - clamped) > 0.005) {
    video.playbackRate = clamped;
  }
}

/** True when the player rate came from YouTube’s UI, not from our last write. */
export function isExternalRateChange(
  videoRate: number,
  appliedRate: number,
  now: number,
  ignoreUntil: number,
  epsilon = 0.03,
): boolean {
  if (now < ignoreUntil) {
    return false;
  }
  return Math.abs(videoRate - appliedRate) > epsilon;
}
