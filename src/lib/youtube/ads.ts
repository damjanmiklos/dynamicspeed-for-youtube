export function isAdShowing(root?: ParentNode | null): boolean {
  const player =
    (root as Document | undefined)?.getElementById?.('movie_player') ??
    (root as Element | undefined)?.querySelector?.('#movie_player') ??
    document.getElementById('movie_player');
  if (!player) {
    return false;
  }
  return (
    player.classList.contains('ad-showing') ||
    player.classList.contains('ad-interrupting') ||
    Boolean(player.querySelector('.ytp-ad-player-overlay'))
  );
}

export function findMainVideo(root: ParentNode = document): HTMLVideoElement | null {
  const videos = [...root.querySelectorAll('video.html5-main-video, video')];
  const visible = videos.find((video) => {
    const el = video as HTMLVideoElement;
    return el.offsetWidth > 0 && el.offsetHeight > 0;
  });
  return (visible as HTMLVideoElement | undefined) ?? (videos[0] as HTMLVideoElement | undefined) ?? null;
}
