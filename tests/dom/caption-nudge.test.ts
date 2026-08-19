/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captionStateForRestore,
  captionTrackOptionForLanguage,
  captionsLookEnabled,
  enableCaptionsForCapture,
  hideCaptionFlash,
  parseAcquireCaptionPrefs,
  readRememberedCaptionPref,
  readSavedCaptionState,
  resolveCaptureCaptionPref,
  restoreSavedCaptionState,
  showCaptionFlash,
  userWantedCaptionsOn,
  writeRememberedCaptionPref,
} from '../../src/lib/youtube/caption-nudge';

describe('parseAcquireCaptionPrefs', () => {
  it('only nudges captions when isolated explicitly asks', () => {
    expect(parseAcquireCaptionPrefs(null).nudgeCaptions).toBe(false);
    expect(
      parseAcquireCaptionPrefs({
        language: 'de',
        preferManual: false,
        nudgeCaptions: true,
      }),
    ).toEqual({ language: 'de', preferManual: false, nudgeCaptions: true });
  });
});

describe('caption nudge helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    showCaptionFlash(document);
  });

  it('reads the CC button and restores off without a second click when already off', async () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="false"></button>
    `;
    const clicks: string[] = [];
    const button = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    button.addEventListener('click', () => clicks.push('click'));
    const player = {
      setOption: vi.fn(),
      unloadModule: vi.fn(),
    };
    const saved = readSavedCaptionState(player, document);
    expect(saved.buttonPressed).toBe(false);
    expect(userWantedCaptionsOn(saved)).toBe(false);
    expect(captionsLookEnabled(document)).toBe(false);
    await restoreSavedCaptionState(player, document, saved, async () => undefined);
    expect(clicks).toEqual([]);
    expect(player.setOption).toHaveBeenCalledWith('captions', 'track', {});
    expect(player.unloadModule).toHaveBeenCalledWith('captions');
  });

  it('does not treat a leftover selected track as captions the user wanted on', () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="false"></button>
    `;
    const player = {
      getOption: vi.fn(() => ({ languageCode: 'en', kind: 'asr' })),
    };
    const saved = readSavedCaptionState(player, document);
    expect(saved.track).toEqual({ languageCode: 'en', kind: 'asr' });
    expect(saved.buttonPressed).toBe(false);
    expect(userWantedCaptionsOn(saved)).toBe(false);
    expect(resolveCaptureCaptionPref(saved)).toBe(false);
    expect(readRememberedCaptionPref()).toBe(false);
  });

  it('keeps an explicit off preference when YouTube later shows captions as on', () => {
    writeRememberedCaptionPref(false);
    expect(
      resolveCaptureCaptionPref({
        buttonPressed: true,
        windowVisible: true,
        track: { languageCode: 'de' },
      }),
    ).toBe(false);
    expect(
      captionStateForRestore(
        { buttonPressed: true, windowVisible: true, track: { languageCode: 'de' } },
        false,
      ),
    ).toEqual({ buttonPressed: false, windowVisible: false, track: null });
  });

  it('turns captions on with setOption and a button click if still off', async () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="false"></button>
    `;
    const button = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    button.addEventListener('click', () => button.setAttribute('aria-pressed', 'true'));
    const player = {
      loadModule: vi.fn(),
      setOption: vi.fn(),
    };
    await enableCaptionsForCapture(
      player,
      document,
      captionTrackOptionForLanguage({ languageCode: 'en', kind: 'asr' }, 'en'),
      async () => undefined,
    );
    expect(player.loadModule).toHaveBeenCalledWith('captions');
    expect(player.setOption).toHaveBeenCalledWith('captions', 'track', {
      languageCode: 'en',
      kind: 'asr',
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('turns captions off after capture even if a track was still selected', async () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="true"></button>
    `;
    const button = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    button.addEventListener('click', () => button.setAttribute('aria-pressed', 'false'));
    const player = { setOption: vi.fn(), unloadModule: vi.fn() };
    await restoreSavedCaptionState(
      player,
      document,
      { buttonPressed: false, windowVisible: false, track: { languageCode: 'en' } },
      async () => undefined,
    );
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(player.unloadModule).toHaveBeenCalledWith('captions');
  });

  it('clicks the button off until aria-pressed is false', async () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="true"></button>
    `;
    const button = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    button.addEventListener('click', () => button.setAttribute('aria-pressed', 'false'));
    await restoreSavedCaptionState(
      { setOption: vi.fn(), unloadModule: vi.fn() },
      document,
      { buttonPressed: false, windowVisible: false, track: null },
      async () => undefined,
    );
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not click the CC button when restoring an already-on state that is still on', async () => {
    document.body.innerHTML = `
      <button class="ytp-subtitles-button" aria-pressed="true"></button>
    `;
    const clicks: string[] = [];
    const button = document.querySelector('.ytp-subtitles-button') as HTMLButtonElement;
    button.addEventListener('click', () => clicks.push('click'));
    await restoreSavedCaptionState(
      { loadModule: vi.fn(), setOption: vi.fn() },
      document,
      {
        buttonPressed: true,
        windowVisible: true,
        track: { languageCode: 'en' },
      },
      async () => undefined,
    );
    expect(clicks).toEqual([]);
  });

  it('installs and removes the flash-hiding style', () => {
    hideCaptionFlash(document);
    expect(document.getElementById('ds-hide-caption-flash')).toBeTruthy();
    expect(document.documentElement.hasAttribute('data-ds-hide-captions')).toBe(true);
    showCaptionFlash(document);
    expect(document.getElementById('ds-hide-caption-flash')).toBeNull();
    expect(document.documentElement.hasAttribute('data-ds-hide-captions')).toBe(false);
  });

  it('keeps the hide style until captions are actually turned off', async () => {
    hideCaptionFlash(document);
    let hiddenWhileUnloading = false;
    const player = {
      setOption: vi.fn(),
      unloadModule: vi.fn(() => {
        hiddenWhileUnloading = Boolean(document.getElementById('ds-hide-caption-flash'));
      }),
    };
    await restoreSavedCaptionState(
      player,
      document,
      { buttonPressed: false, windowVisible: false, track: null },
      async () => undefined,
    );
    expect(hiddenWhileUnloading).toBe(true);
    expect(document.getElementById('ds-hide-caption-flash')).toBeNull();
  });
});
