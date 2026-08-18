export const CHIP_CLASS = 'dynamicspeed-chip';

const CHIP_STYLE = `
.ytp-button.${CHIP_CLASS} {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0 8px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  font-family: Roboto, Arial, sans-serif !important;
  letter-spacing: 0.04em;
  color: #fff !important;
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

export function chipIsCorrectlyPlaced(): boolean {
  const chip = document.querySelector<HTMLElement>(`.ytp-button.${CHIP_CLASS}`);
  const settings = document.querySelector('.ytp-settings-button');
  if (!chip || !settings) {
    return false;
  }
  return chip.nextElementSibling === settings;
}

export function upsertPlayerChip(options: {
  label: string;
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

  chip.textContent = options.label;
  chip.title = options.title;
  chip.dataset.dsInactive = options.inactive ? 'true' : 'false';
  chip.dataset.dsConflict = options.conflict ? 'true' : 'false';
  if (options.conflict) {
    chip.setAttribute('aria-label', 'DynamicSpeed playback rate. Another extension is forcing a fixed speed.');
  } else {
    chip.setAttribute('aria-label', 'DynamicSpeed playback rate');
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
