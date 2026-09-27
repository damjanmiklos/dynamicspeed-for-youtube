export const CHIP_CLASS = 'dynamicspeed-chip';

const CHIP_STYLE = `
.ytp-button.${CHIP_CLASS} {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 52px;
  padding: 0 8px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  font-family: Roboto, Arial, sans-serif !important;
  letter-spacing: 0.04em;
  color: #fff !important;
  white-space: nowrap !important;
}
.ytp-button.${CHIP_CLASS} .ds-why {
  margin-left: 4px;
  font-size: 11px !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  opacity: 0.9;
}
.ytp-button.${CHIP_CLASS}[data-ds-inactive="true"] {
  opacity: 0.55;
}
.ytp-button.${CHIP_CLASS}[data-ds-conflict="true"] {
  color: #ff4d4d !important;
  font-weight: 800 !important;
}
`;

function ensureStyle(): void {
  if (document.getElementById('dynamicspeed-chip-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'dynamicspeed-chip-style';
  style.textContent = CHIP_STYLE;
  document.documentElement.appendChild(style);
}

export function formatRate(rate: number | null, decimals: number): string {
  if (rate == null || !Number.isFinite(rate)) {
    return '—';
  }
  return `${rate.toFixed(decimals)}×`;
}

const BLOCK_HOLD_REASONS: Record<string, string> = {
  'music-disabled': 'music',
  paused: 'off',
  'video-disabled': 'video',
  'channel-disabled': 'channel',
  'shorts-disabled': 'shorts',
};

/**
 * Short chip suffix when a rule is holding playback at 1× or Default speed.
 * Null while the WPM curve is driving the rate.
 */
export function chipHoldReason(input: {
  blockReason: string | null;
  transcriptStatus: string;
  curveActive: boolean;
  mode?: string;
}): string | null {
  if (input.mode === 'ad' || input.mode === 'manual') {
    return null;
  }
  if (input.mode?.startsWith('forced')) {
    return 'held';
  }
  const blocked = input.blockReason ? BLOCK_HOLD_REASONS[input.blockReason] : undefined;
  if (blocked) {
    return blocked;
  }
  if (input.curveActive) {
    return null;
  }
  if (input.transcriptStatus === 'missing') {
    return 'no captions';
  }
  if (input.transcriptStatus === 'no-video') {
    return 'no video';
  }
  return 'loading';
}

/** One tooltip line for a hold reason. */
export function chipHoldDetail(reason: string, restoreDefault: boolean): string {
  if (reason === 'music') {
    return 'Music category, held at 1×';
  }
  if (reason === 'loading') {
    return 'Waiting for captions, using Default speed';
  }
  if (reason === 'no captions') {
    return 'No captions, using Default speed';
  }
  if (reason === 'no video') {
    return 'No video, using Default speed';
  }
  if (reason === 'held') {
    return 'Speed held';
  }
  const what =
    reason === 'off'
      ? 'DynamicSpeed is off'
      : reason === 'video'
        ? 'This video is turned off'
        : reason === 'channel'
          ? 'This channel is turned off'
          : reason === 'shorts'
            ? 'Shorts are turned off'
            : reason;
  return restoreDefault ? `${what}, using Default speed` : what;
}

export function chipIsCorrectlyPlaced(): boolean {
  const chip = document.querySelector<HTMLElement>(`.ytp-button.${CHIP_CLASS}`);
  const settings = document.querySelector('.ytp-settings-button');
  if (!chip || !settings) {
    return false;
  }
  return chip.nextElementSibling === settings;
}

function syncChipText(chip: HTMLButtonElement, label: string, reason: string | null): void {
  let rate = chip.querySelector<HTMLElement>('.ds-rate');
  let why = chip.querySelector<HTMLElement>('.ds-why');
  if (!rate || !why) {
    chip.textContent = '';
    rate = document.createElement('span');
    rate.className = 'ds-rate';
    why = document.createElement('span');
    why.className = 'ds-why';
    chip.append(rate, why);
  }
  if (rate.textContent !== label) {
    rate.textContent = label;
  }
  const whyText = reason ?? '';
  if (why.textContent !== whyText) {
    why.textContent = whyText;
  }
  const hideWhy = !reason;
  if (why.hidden !== hideWhy) {
    why.hidden = hideWhy;
  }
}

export function upsertPlayerChip(options: {
  label: string;
  reason?: string | null;
  title: string;
  inactive?: boolean;
  conflict?: boolean;
  onClick?: () => void;
}): HTMLButtonElement | null {
  ensureStyle();
  const settings = document.querySelector('.ytp-settings-button');
  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) {
    return null;
  }

  let chip = document.querySelector<HTMLButtonElement>(`.ytp-button.${CHIP_CLASS}`);
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `ytp-button ${CHIP_CLASS}`;
    chip.setAttribute('aria-label', 'DynamicSpeed playback rate');
  }

  if (!chipIsCorrectlyPlaced()) {
    if (settings?.parentElement === controls) {
      controls.insertBefore(chip, settings);
    } else if (chip.parentElement !== controls) {
      controls.insertBefore(chip, controls.firstChild);
    }
  }

  // Called every animation frame. Only touch the DOM when something changed:
  // assigning textContent always replaces the text node, which restyles the
  // control bar and wakes every MutationObserver on the player 60×/s.
  syncChipText(chip, options.label, options.reason ?? null);
  if (chip.title !== options.title) {
    chip.title = options.title;
  }
  const inactive = options.inactive ? 'true' : 'false';
  if (chip.dataset.dsInactive !== inactive) {
    chip.dataset.dsInactive = inactive;
  }
  const conflict = options.conflict ? 'true' : 'false';
  if (chip.dataset.dsConflict !== conflict) {
    chip.dataset.dsConflict = conflict;
  }
  const ariaLabel = options.conflict
    ? 'DynamicSpeed playback rate. Another extension is forcing a fixed speed.'
    : options.reason
      ? `DynamicSpeed playback rate, ${options.reason}`
      : 'DynamicSpeed playback rate';
  if (chip.getAttribute('aria-label') !== ariaLabel) {
    chip.setAttribute('aria-label', ariaLabel);
  }
  if (options.onClick) {
    chip.onclick = options.onClick;
  }
  return chip;
}

export function removePlayerChip(): void {
  document.querySelectorAll(`.ytp-button.${CHIP_CLASS}`).forEach((node) => node.remove());
}

export function observePlayerChrome(
  onMaybeChanged: () => void,
  debounceMs = 120,
): () => void {
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(onMaybeChanged, debounceMs);
  };
  const observer = new MutationObserver(schedule);
  const attach = () => {
    const root =
      document.querySelector('.ytp-chrome-bottom') ??
      document.getElementById('movie_player') ??
      document.body;
    observer.disconnect();
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  };
  attach();
  const nav = () => {
    attach();
    schedule();
  };
  document.addEventListener('yt-navigate-finish', nav);
  return () => {
    observer.disconnect();
    document.removeEventListener('yt-navigate-finish', nav);
    window.clearTimeout(timer);
  };
}
