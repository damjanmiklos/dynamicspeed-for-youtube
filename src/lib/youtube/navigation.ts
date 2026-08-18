export function onYouTubeNavigation(handler: () => void): () => void {
  const wrapped = () => handler();
  document.addEventListener('yt-navigate-finish', wrapped);
  window.addEventListener('yt-page-data-updated', wrapped);
  const interval = window.setInterval(() => {
    handler();
  }, 1000);
  return () => {
    document.removeEventListener('yt-navigate-finish', wrapped);
    window.removeEventListener('yt-page-data-updated', wrapped);
    window.clearInterval(interval);
  };
}
