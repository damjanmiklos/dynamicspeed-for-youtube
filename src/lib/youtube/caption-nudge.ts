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

const FLASH_STYLE_ID = 'ds-hide-caption-flash';

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

export function userWantedCaptionsOn(saved: SavedCaptionState): boolean {
  return saved.buttonPressed || saved.windowVisible || Boolean(saved.track);
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
    player?.setOption?.('captions', 'track', option);
  } catch {
    // player may reject an incomplete track object
  }
  await sleep(120);
  if (!isSubtitlesButtonPressed(root)) {
    clickSubtitlesButton(root);
  }
}

export async function restoreSavedCaptionState(
  player: CaptionPlayer | null,
  root: Document,
  saved: SavedCaptionState,
  sleep: (ms: number) => Promise<void>,
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
      return;
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
