export type CaptionPlayer = {
  loadModule?: (name: string) => void;
  unloadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
  getOption?: (module: string, option: string) => unknown;
};

export type SavedCaptionState = {
  buttonPressed: boolean;
  windowVisible: boolean;
  track: Record<string, string> | null;
};

export type AcquireCaptionPrefs = {
  language: string;
  preferManual: boolean;
  nudgeCaptions: boolean;
};

export const CAPTIONS_OFF_STATE: SavedCaptionState = {
  buttonPressed: false,
  windowVisible: false,
  track: null,
};

const FLASH_STYLE_ID = 'ds-hide-caption-flash';
const PLAYER_FLASH_STYLE_ID = 'ds-hide-caption-flash-player';
const HIDE_CAPTIONS_ATTR = 'data-ds-hide-captions';
const STAMP_ATTR = 'data-ds-caption-hide';
const USER_CAPTION_PREF_KEY = 'ds.user-captions-wanted';
const CAPTION_HIDE_SELECTOR = [
  '.ytp-caption-window-container',
  '.caption-window',
  '[id^="caption-window"]',
  '.ytp-caption-segment',
  '.captions-text',
  '.caption-visual-line',
  '.ytp-caption-window-rollup',
  '.ytp-caption-window-bottom',
].join(',');
const CAPTION_CONTAINER_SELECTOR =
  '.ytp-caption-window-container, .caption-window, [id^="caption-window"]';

type CaptionHideWatch = {
  observer: MutationObserver;
  onModeChange: () => void;
};

const captionHideWatches = new WeakMap<Document, CaptionHideWatch>();
const captionHideApplying = new WeakSet<Document>();
const CAPTION_STORAGE_KEYS = [
  'yt-player-caption-display-mode',
  'yt-player-sticky-caption',
  'yt-player-caption-sticky-language',
] as const;
/** Extra off-clicks after unload; YouTube often turns CC back on once timedtext arrives. */
const CAPTIONS_OFF_SETTLE_ROUNDS = 12;
const CAPTIONS_OFF_SETTLE_GAP_MS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeCaptionTrackOption(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const key of ['languageCode', 'language', 'kind', 'vssId'] as const) {
    const item = value[key];
    if (typeof item === 'string' && item.length > 0 && item.length <= 80) {
      out[key] = item;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function captionTrackOptionForLanguage(
  track: { languageCode?: string; kind?: string; vssId?: string } | null,
  language: string,
): Record<string, string> {
  const languageCode = (track?.languageCode || language || 'en').slice(0, 16);
  const option: Record<string, string> = { languageCode };
  if (track?.kind && track.kind.length <= 16) {
    option.kind = track.kind;
  }
  if (track?.vssId && track.vssId.length <= 32) {
    option.vssId = track.vssId;
  }
  return option;
}

export function parseAcquireCaptionPrefs(payload: unknown): AcquireCaptionPrefs {
  const record = isRecord(payload) ? payload : {};
  const language =
    typeof record.language === 'string' && record.language.length >= 2
      ? record.language.slice(0, 16)
      : 'en';
  return {
    language,
    preferManual: record.preferManual !== false,
    nudgeCaptions: record.nudgeCaptions === true,
  };
}

export function isSubtitlesButtonPressed(root: ParentNode): boolean {
  const button = root.querySelector('.ytp-subtitles-button');
  return button?.getAttribute('aria-pressed') === 'true';
}

export function captionWindowPresent(root: ParentNode): boolean {
  const nodes = root.querySelectorAll(
    '.caption-window, .ytp-caption-segment, .captions-text, .ytp-caption-window-container .caption-window',
  );
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.hasAttribute(STAMP_ATTR) || node.closest(`[${STAMP_ATTR}]`)) {
      continue;
    }
    return true;
  }
  return false;
}

export function captionsLookEnabled(root: ParentNode): boolean {
  return isSubtitlesButtonPressed(root) || captionWindowPresent(root);
}

export function clickSubtitlesButton(root: Document): boolean {
  const button = root.querySelector('.ytp-subtitles-button');
  if (!(button instanceof HTMLElement) || button.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  button.click();
  return true;
}

export function readSavedCaptionState(
  player: CaptionPlayer | null,
  root: ParentNode,
): SavedCaptionState {
  let track: Record<string, string> | null = null;
  try {
    track = sanitizeCaptionTrackOption(player?.getOption?.('captions', 'track'));
  } catch {
    track = null;
  }
  const buttonPressed = isSubtitlesButtonPressed(root);
  const windowVisible = captionWindowPresent(root);
  return { buttonPressed, windowVisible, track };
}

/**
 * YouTube keeps the last selected caption track even when CC is off.
 * Only the subtitles button (what the user sees) counts as “wanted on.”
 */
export function userWantedCaptionsOn(saved: SavedCaptionState): boolean {
  return saved.buttonPressed;
}

export function readRememberedCaptionPref(): boolean | null {
  try {
    const value = sessionStorage.getItem(USER_CAPTION_PREF_KEY);
    if (value === 'on') {
      return true;
    }
    if (value === 'off') {
      return false;
    }
  } catch {
    // private mode / opaque origin
  }
  return null;
}

export function writeRememberedCaptionPref(wantedOn: boolean): void {
  try {
    sessionStorage.setItem(USER_CAPTION_PREF_KEY, wantedOn ? 'on' : 'off');
  } catch {
    // private mode / opaque origin
  }
}

export function rememberCaptionPrefFromUserClick(root: ParentNode): void {
  writeRememberedCaptionPref(isSubtitlesButtonPressed(root));
}

/**
 * Prefer the user’s last explicit CC choice in this tab. YouTube often turns
 * captions back on after a timedtext nudge, which must not overwrite “off.”
 */
export function resolveCaptureCaptionPref(saved: SavedCaptionState): boolean {
  const remembered = readRememberedCaptionPref();
  if (remembered != null) {
    return remembered;
  }
  const wanted = saved.buttonPressed;
  writeRememberedCaptionPref(wanted);
  return wanted;
}

export function captionStateForRestore(
  saved: SavedCaptionState,
  wantedOn: boolean,
): SavedCaptionState {
  if (wantedOn) {
    return saved;
  }
  return CAPTIONS_OFF_STATE;
}

export function snapshotCaptionStorage(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  try {
    for (const key of CAPTION_STORAGE_KEYS) {
      out[key] = window.localStorage.getItem(key);
    }
  } catch {
    // private mode
  }
  return out;
}

export function restoreCaptionStorage(snapshot: Record<string, string | null>): void {
  try {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value == null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    }
  } catch {
    // private mode
  }
}

function youtubeStorageData(previous: string | null, data: string): string {
  let expiration = Date.now() + 30 * 24 * 60 * 60 * 1000;
  let rest: Record<string, unknown> = {};
  if (previous) {
    try {
      const parsed = JSON.parse(previous) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        rest = parsed;
        if (typeof parsed.expiration === 'number') {
          expiration = parsed.expiration;
        }
      }
    } catch {
      // not YouTube’s JSON envelope
    }
  }
  return JSON.stringify({ ...rest, data, expiration, creation: Date.now() });
}

/** Force CC sticky-off. Restoring the pre-nudge snapshot can turn captions back on. */
export function captionStorageOff(
  snapshot?: Record<string, string | null>,
): Record<string, string | null> {
  const previous = snapshot ?? {};
  return {
    'yt-player-caption-display-mode': null,
    'yt-player-sticky-caption': youtubeStorageData(
      previous['yt-player-sticky-caption'] ?? null,
      'false',
    ),
    'yt-player-caption-sticky-language': previous['yt-player-caption-sticky-language'] ?? null,
  };
}

function setCaptionsTrackOff(player: CaptionPlayer | null): void {
  try {
    player?.setOption?.('captions', 'stickyCaptions', false);
  } catch {
    // option is not always present
  }
  try {
    player?.setOption?.('captions', 'track', {});
  } catch {
    // continue with the button
  }
}

function hideCaptionCss(): string {
  const leaves = CAPTION_HIDE_SELECTOR.split(',').map((item) => item.trim());
  // Extra player-mode prefixes beat YouTube’s fullscreen/cinema rules, which
  // add .ytp-fullscreen / .ytp-big-mode and set visibility:visible !important.
  const prefixes = [
    '',
    ' #movie_player',
    ' #movie_player.ytp-fullscreen',
    ' #movie_player.ytp-big-mode',
    ' .html5-video-player',
    ' .html5-video-player.ytp-fullscreen',
    ' .html5-video-player.ytp-big-mode',
    ' :fullscreen',
    ' :-webkit-full-screen',
    ' ytd-watch-flexy[theater]',
    ' ytd-watch-flexy[fullscreen]',
    ' #player-theater-container',
  ];
  const selectors: string[] = [];
  for (const prefix of prefixes) {
    for (const leaf of leaves) {
      selectors.push(`html[${HIDE_CAPTIONS_ATTR}]${prefix} ${leaf}`);
      selectors.push(`html[${HIDE_CAPTIONS_ATTR}]${prefix} ${leaf} *`);
    }
  }
  const hide = 'opacity:0!important;visibility:hidden!important;pointer-events:none!important;clip-path:inset(50%)!important;';
  const containers = [
    `html[${HIDE_CAPTIONS_ATTR}] #movie_player .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] #movie_player.ytp-fullscreen .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] #movie_player.ytp-big-mode .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] .html5-video-player.ytp-fullscreen .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] .html5-video-player.ytp-big-mode .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] :fullscreen .ytp-caption-window-container`,
    `html[${HIDE_CAPTIONS_ATTR}] :-webkit-full-screen .ytp-caption-window-container`,
  ];
  return `${selectors.join(',')}{${hide}}${containers.join(',')}{${hide}display:none!important;}`;
}

function stampCaptionNode(node: HTMLElement): void {
  if (
    node.getAttribute(STAMP_ATTR) === '' &&
    node.style.getPropertyValue('opacity') === '0' &&
    node.style.getPropertyPriority('opacity') === 'important'
  ) {
    return;
  }
  node.setAttribute(STAMP_ATTR, '');
  node.style.setProperty('opacity', '0', 'important');
  node.style.setProperty('visibility', 'hidden', 'important');
  node.style.setProperty('pointer-events', 'none', 'important');
  node.style.setProperty('clip-path', 'inset(50%)', 'important');
  if (node.matches(CAPTION_CONTAINER_SELECTOR)) {
    node.style.setProperty('display', 'none', 'important');
  }
}

function unstampCaptionNode(node: HTMLElement): void {
  if (!node.hasAttribute(STAMP_ATTR)) {
    return;
  }
  node.removeAttribute(STAMP_ATTR);
  node.style.removeProperty('opacity');
  node.style.removeProperty('visibility');
  node.style.removeProperty('pointer-events');
  node.style.removeProperty('clip-path');
  node.style.removeProperty('display');
}

function applyCaptionHide(root: Document): void {
  if (captionHideApplying.has(root)) {
    return;
  }
  captionHideApplying.add(root);
  try {
    for (const node of root.querySelectorAll(CAPTION_HIDE_SELECTOR)) {
      if (node instanceof HTMLElement) {
        stampCaptionNode(node);
      }
    }
  } finally {
    captionHideApplying.delete(root);
  }
}

function clearCaptionHideStamps(root: Document): void {
  for (const node of root.querySelectorAll(`[${STAMP_ATTR}]`)) {
    if (node instanceof HTMLElement) {
      unstampCaptionNode(node);
    }
  }
}

function ensureDocumentHideStyle(root: Document): void {
  let style = root.getElementById(FLASH_STYLE_ID);
  if (!(style instanceof HTMLStyleElement)) {
    style = root.createElement('style');
    style.id = FLASH_STYLE_ID;
    (root.head ?? root.documentElement).appendChild(style);
  }
  style.textContent = hideCaptionCss();
}

function ensurePlayerHideStyle(root: Document): void {
  const player = root.querySelector('#movie_player, .html5-video-player');
  if (!(player instanceof HTMLElement)) {
    return;
  }
  if (player.querySelector(`#${PLAYER_FLASH_STYLE_ID}`)) {
    return;
  }
  const style = root.createElement('style');
  style.id = PLAYER_FLASH_STYLE_ID;
  style.textContent = hideCaptionCss();
  player.prepend(style);
}

function startCaptionHideWatch(root: Document): void {
  if (captionHideWatches.has(root)) {
    return;
  }
  const onModeChange = () => {
    if (captionHideApplying.has(root)) {
      return;
    }
    ensurePlayerHideStyle(root);
    applyCaptionHide(root);
  };
  const observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      const target = record.target;
      return !(
        target instanceof Element &&
        (target.id === FLASH_STYLE_ID || target.id === PLAYER_FLASH_STYLE_ID)
      );
    });
    if (!relevant) {
      return;
    }
    onModeChange();
  });
  observer.observe(root.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'theater', 'fullscreen'],
  });
  root.addEventListener('fullscreenchange', onModeChange);
  root.addEventListener('webkitfullscreenchange', onModeChange);
  captionHideWatches.set(root, { observer, onModeChange });
}

function stopCaptionHideWatch(root: Document): void {
  const watch = captionHideWatches.get(root);
  if (!watch) {
    return;
  }
  watch.observer.disconnect();
  root.removeEventListener('fullscreenchange', watch.onModeChange);
  root.removeEventListener('webkitfullscreenchange', watch.onModeChange);
  captionHideWatches.delete(root);
}

export function hideCaptionFlash(root: Document): void {
  root.documentElement.setAttribute(HIDE_CAPTIONS_ATTR, '');
  ensureDocumentHideStyle(root);
  ensurePlayerHideStyle(root);
  startCaptionHideWatch(root);
  applyCaptionHide(root);
}

export function showCaptionFlash(root: Document): void {
  stopCaptionHideWatch(root);
  clearCaptionHideStamps(root);
  root.documentElement.removeAttribute(HIDE_CAPTIONS_ATTR);
  root.getElementById(FLASH_STYLE_ID)?.remove();
  root.getElementById(PLAYER_FLASH_STYLE_ID)?.remove();
}

export async function enableCaptionsForCapture(
  player: CaptionPlayer | null,
  root: Document,
  option: Record<string, string>,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  try {
    player?.loadModule?.('captions');
  } catch {
    // module may already be loaded
  }
  await sleep(80);
  try {
    player?.setOption?.('captions', 'stickyCaptions', false);
  } catch {
    // option is not always present
  }
  try {
    player?.setOption?.('captions', 'track', option);
  } catch {
    // player may reject an incomplete track object
  }
  await sleep(120);
  if (!isSubtitlesButtonPressed(root)) {
    clickSubtitlesButton(root);
  }
}

async function disableCaptionsDisplay(
  player: CaptionPlayer | null,
  root: Document,
  sleep: (ms: number) => Promise<void>,
  options?: { unload?: boolean },
): Promise<void> {
  const unload = options?.unload !== false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    setCaptionsTrackOff(player);
    if (isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
    await sleep(120);
    if (!isSubtitlesButtonPressed(root) && !captionWindowPresent(root)) {
      break;
    }
  }
  if (unload) {
    try {
      player?.unloadModule?.('captions');
    } catch {
      // last resort is another button click
    }
    await sleep(80);
    setCaptionsTrackOff(player);
    if (isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
  }
}

async function settleCaptionsOff(
  player: CaptionPlayer | null,
  root: Document,
  sleep: (ms: number) => Promise<void>,
  storageOff: Record<string, string | null>,
): Promise<void> {
  for (let round = 0; round < CAPTIONS_OFF_SETTLE_ROUNDS; round += 1) {
    await sleep(CAPTIONS_OFF_SETTLE_GAP_MS);
    restoreCaptionStorage(storageOff);
    setCaptionsTrackOff(player);
    if (isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
  }
}

export async function restoreSavedCaptionState(
  player: CaptionPlayer | null,
  root: Document,
  saved: SavedCaptionState,
  sleep: (ms: number) => Promise<void>,
  storageSnapshot?: Record<string, string | null>,
): Promise<void> {
  if (userWantedCaptionsOn(saved)) {
    showCaptionFlash(root);
    try {
      player?.loadModule?.('captions');
    } catch {
      // keep trying via the button
    }
    if (saved.track) {
      try {
        player?.setOption?.('captions', 'track', saved.track);
      } catch {
        // fall through to the CC button
      }
    }
    if (!isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
    return;
  }

  const storageOff = captionStorageOff(storageSnapshot);
  try {
    await disableCaptionsDisplay(player, root, sleep);
    restoreCaptionStorage(storageOff);
    await settleCaptionsOff(player, root, sleep, storageOff);
    if (isSubtitlesButtonPressed(root) || captionWindowPresent(root)) {
      await disableCaptionsDisplay(player, root, sleep, { unload: false });
      restoreCaptionStorage(storageOff);
    }
    if (isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
  } finally {
    showCaptionFlash(root);
  }
}
