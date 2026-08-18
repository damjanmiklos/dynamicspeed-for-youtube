/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import {
  captionTrackOptionForLanguage,
  captionsLookEnabled,
  enableCaptionsForCapture,
  hideCaptionFlash,
  parseAcquireCaptionPrefs,
  readSavedCaptionState,
  restoreSavedCaptionState,
  showCaptionFlash,
  userWantedCaptionsOn,
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
    showCaptionFlash(document);
    expect(document.getElementById('ds-hide-caption-flash')).toBeNull();
  });
});
