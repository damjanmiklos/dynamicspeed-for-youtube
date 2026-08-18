export function applyPreservesPitch(video: HTMLVideoElement): void {
  video.preservesPitch = true;
  (video as HTMLVideoElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = true;
  (video as HTMLVideoElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
}

export function setPlaybackRate(video: HTMLVideoElement, rate: number): void {
  applyPreservesPitch(video);
  if (Math.abs(video.playbackRate - rate) > 0.005) {
    video.playbackRate = rate;
  }
}
