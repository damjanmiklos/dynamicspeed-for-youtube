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

/**
 * Hover previews on home, search, and channel pages play muted in their own
 * player. They are never the video the loaded transcript belongs to.
 */
const PREVIEW_PLAYER_SELECTOR = [
  '#inline-preview-player',
  '#inline-player',
  'ytd-video-preview',
  '#video-preview',
  'ytd-moving-thumbnail-renderer',
].join(',');

/** Main watch player (also the miniplayer) and the Shorts player. */
const MAIN_PLAYER_SELECTOR = '#movie_player, #shorts-player';

function isVisible(video: HTMLVideoElement): boolean {
  return video.offsetWidth > 0 && video.offsetHeight > 0;
}

export function findMainVideo(root: ParentNode = document): HTMLVideoElement | null {
  const videos = [...root.querySelectorAll<HTMLVideoElement>('video')].filter(
    (video) => !video.closest(PREVIEW_PLAYER_SELECTOR),
  );
  const main = videos.filter((video) => video.closest(MAIN_PLAYER_SELECTOR));
  return (
    main.find(isVisible) ??
    videos.find(isVisible) ??
    main[0] ??
    videos[0] ??
    null
  );
}
