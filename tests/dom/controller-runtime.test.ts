/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/settings/defaults';
import { createPlaybackController } from '../../src/lib/youtube/controller';
import { upsertPlayerChip } from '../../src/lib/youtube/chip';
import type { WordToken } from '../../src/lib/transcript/types';

const idleChannel = {
  channelId: null,
  channelName: null,
  title: null,
  isLive: false,
  isMusic: false,
};

function mountVideo(rate: number): { video: HTMLVideoElement; setDuration: (d: number) => void } {
  document.body.innerHTML = '';
  const video = document.createElement('video');
  video.className = 'html5-main-video';
  Object.defineProperty(video, 'offsetWidth', { value: 640 });
  Object.defineProperty(video, 'offsetHeight', { value: 360 });
  let duration = Number.NaN;
  let currentTime = 0;
  Object.defineProperty(video, 'duration', { get: () => duration });
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  video.playbackRate = rate;
  document.body.appendChild(video);
  return {
    video,
    setDuration: (next) => {
      duration = next;
      video.dispatchEvent(new Event('durationchange'));
    },
  };
}

async function flushFrames(count = 4): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

/** 40 s of steady speech at 150 WPM, then silence. */
function speechTokens(): WordToken[] {
  return Array.from({ length: 100 }, (_, i) => ({
    t0: i * 0.4,
    t1: i * 0.4 + 0.4,
    text: 'word',
    syllables: 1,
    jargon: false,
    meta: false,
  }));
}

describe('controller runtime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('rebuilds the curve when the video duration becomes known', async () => {
    const { video, setDuration } = mountVideo(1);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings({
      ...DEFAULT_SETTINGS,
      bRollAcceleration: true,
      maxSpeed: 3,
      manualOverrideTimeoutSec: 0,
    });
    controller.start();
    await flushFrames();
    // Tokens arrive while duration is still NaN (cached captions, no metadata yet).
    controller.setTokens(speechTokens(), 'ready');
    setDuration(120);
    video.currentTime = 100;
    video.dispatchEvent(new Event('seeking'));
    // Outro b-roll after the last word heads to max speed.
    expect(video.playbackRate).toBeCloseTo(3, 2);
    controller.destroy();
  });

  it('keeps driving the rate while the tab is hidden', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { video } = mountVideo(2.5);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings({ ...DEFAULT_SETTINGS, fallbackSpeed: 1.25 });
    controller.start();
    // First tick runs synchronously; make sure later work is timer-driven.
    video.playbackRate = 2.5;
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(video.playbackRate).toBeCloseTo(1.25, 2);
    controller.destroy();
  });

  it('dims the chip while force-1× holds the rate', async () => {
    document.body.innerHTML = '';
    const { video } = mountVideo(1.8);
    const controls = document.createElement('div');
    controls.className = 'ytp-right-controls';
    controls.innerHTML = '<button class="ytp-settings-button ytp-button"></button>';
    document.body.appendChild(controls);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings(DEFAULT_SETTINGS);
    controller.start();
    controller.forceRate(1);
    await flushFrames();
    const chip = document.querySelector<HTMLElement>('.dynamicspeed-chip');
    expect(video.playbackRate).toBeCloseTo(1, 2);
    expect(chip?.dataset.dsInactive).toBe('true');
    expect(chip?.querySelector('.ds-why')?.textContent).toBe('held');
    expect(chip?.title).toContain('Speed held');
    controller.destroy();
  });
});

describe('player chip updates', () => {
  it('does not rewrite unchanged chip content', async () => {
    document.body.innerHTML = `
      <div class="ytp-right-controls">
        <button class="ytp-settings-button ytp-button"></button>
      </div>
    `;
    upsertPlayerChip({ label: '1.50×', title: 'DynamicSpeed' });
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    upsertPlayerChip({ label: '1.50×', title: 'DynamicSpeed' });
    upsertPlayerChip({ label: '1.50×', title: 'DynamicSpeed' });
    await Promise.resolve();
    records.push(...observer.takeRecords());
    expect(records).toHaveLength(0);
    upsertPlayerChip({ label: '1.55×', title: 'DynamicSpeed' });
    records.push(...observer.takeRecords());
    expect(records.length).toBeGreaterThan(0);
    observer.disconnect();
  });
});

describe('curve belongs to its video', () => {
  const previousLocation = window.location;
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: previousLocation });
    document.body.innerHTML = '';
  });

  it("does not apply the previous video's curve after SPA navigation", async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://www.youtube.com/watch?v=aaaaaaaaaaa'),
    });
    const { video } = mountVideo(1);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings({ ...DEFAULT_SETTINGS, fallbackSpeed: 1, minSpeed: 0.5, targetWpm: 400 });
    controller.start();
    controller.setTokens(speechTokens(), 'ready', 'aaaaaaaaaaa');
    await new Promise((resolve) => setTimeout(resolve, 2300));
    // 150 WPM speech at a 400 WPM target: well above 1×.
    expect(video.playbackRate).toBeGreaterThan(2);
    expect(controller.getPageState().hasTranscript).toBe(true);

    // URL moves to the next video before VIDEO_ID_CHANGED arrives.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://www.youtube.com/watch?v=bbbbbbbbbbb'),
    });
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1, 2);
    expect(controller.getPageState().hasTranscript).toBe(false);
    controller.destroy();
  });
});
