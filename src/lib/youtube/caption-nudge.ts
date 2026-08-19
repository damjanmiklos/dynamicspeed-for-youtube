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
const USER_CAPTION_PREF_KEY = 'ds.user-captions-wanted';
const CAPTION_STORAGE_KEYS = [
  'yt-player-caption-display-mode',
  'yt-player-sticky-caption',
  'yt-player-caption-sticky-language',
] as const;

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
  return Boolean(
    root.querySelector(
      '.caption-window, .ytp-caption-segment, .captions-text, .ytp-caption-window-container .caption-window',
    ),
  );
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

export function hideCaptionFlash(root: Document): void {
  if (root.getElementById(FLASH_STYLE_ID)) {
    return;
  }
  const style = root.createElement('style');
  style.id = FLASH_STYLE_ID;
  style.textContent =
    '.ytp-caption-window-container,.caption-window,.ytp-caption-segment,.captions-text{opacity:0!important;visibility:hidden!important;}';
  root.documentElement.appendChild(style);
}

export function showCaptionFlash(root: Document): void {
  root.getElementById(FLASH_STYLE_ID)?.remove();
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
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      player?.setOption?.('captions', 'track', {});
    } catch {
      // continue with the button
    }
    if (isSubtitlesButtonPressed(root)) {
      clickSubtitlesButton(root);
    }
    await sleep(120);
    if (!isSubtitlesButtonPressed(root) && !captionWindowPresent(root)) {
      break;
    }
  }
  try {
    player?.unloadModule?.('captions');
  } catch {
    // last resort is another button click
  }
  await sleep(80);
  if (isSubtitlesButtonPressed(root)) {
    clickSubtitlesButton(root);
  }
}

export async function restoreSavedCaptionState(
  player: CaptionPlayer | null,
  root: Document,
  saved: SavedCaptionState,
  sleep: (ms: number) => Promise<void>,
  storageSnapshot?: Record<string, string | null>,
): Promise<void> {
  showCaptionFlash(root);
  if (userWantedCaptionsOn(saved)) {
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

  await disableCaptionsDisplay(player, root, sleep);
  if (storageSnapshot) {
    restoreCaptionStorage(storageSnapshot);
  }
  await sleep(160);
  if (isSubtitlesButtonPressed(root) || captionWindowPresent(root)) {
    await disableCaptionsDisplay(player, root, sleep);
    if (storageSnapshot) {
      restoreCaptionStorage(storageSnapshot);
    }
  }
}
