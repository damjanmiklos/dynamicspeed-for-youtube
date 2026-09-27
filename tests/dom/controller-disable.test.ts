/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/lib/settings/defaults';
import { createPlaybackController } from '../../src/lib/youtube/controller';

async function flushFrames(count = 8): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function mountVideo(rate: number): HTMLVideoElement {
  document.body.innerHTML = '';
  const video = document.createElement('video');
  video.className = 'html5-main-video';
  Object.defineProperty(video, 'offsetWidth', { value: 640 });
  Object.defineProperty(video, 'offsetHeight', { value: 360 });
  video.playbackRate = rate;
  document.body.appendChild(video);
  return video;
}

const idleChannel = {
  channelId: null,
  channelName: null,
  title: null,
  isLive: false,
  isMusic: false,
};

describe('controller releases speed when disabled', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not keep overwriting YouTube speed after the master switch is off', async () => {
    const video = mountVideo(2.5);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings({
      ...DEFAULT_SETTINGS,
      enabled: false,
      restore1xWhenDisabled: true,
      fallbackSpeed: 1,
    });
    controller.start();
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1, 2);

    video.playbackRate = 2;
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(2, 2);
    controller.destroy();
  });

  it('does not keep overwriting YouTube speed when this video is disabled', async () => {
    const video = mountVideo(2.4);
    const previousLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://www.youtube.com/watch?v=dQw4w9wgGcQ'),
    });
    const controller = createPlaybackController({
      getChannel: () => idleChannel,
    });
    controller.setSettings({
      ...DEFAULT_SETTINGS,
      enabled: true,
      restore1xWhenDisabled: true,
      fallbackSpeed: 1,
      disabledVideoIds: ['dQw4w9wgGcQ'],
    });
    controller.start();
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1, 2);

    video.playbackRate = 1.75;
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1.75, 2);
    controller.destroy();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: previousLocation,
    });
  });

  it('leaves the last automated speed alone when restore-on-disable is off', async () => {
    const video = mountVideo(2.25);
    const controller = createPlaybackController({ getChannel: () => idleChannel });
    controller.setSettings({
      ...DEFAULT_SETTINGS,
      enabled: false,
      restore1xWhenDisabled: false,
    });
    controller.start();
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(2.25, 2);

    video.playbackRate = 1.5;
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1.5, 2);
    controller.destroy();
  });

  it('holds music videos at 1× even when Default speed is 2×', async () => {
    const video = mountVideo(2.5);
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div class="ytp-right-controls"><button class="ytp-settings-button ytp-button"></button></div>`,
    );
    const controller = createPlaybackController({
      getChannel: () => ({ ...idleChannel, isMusic: true }),
    });
    controller.setSettings({
      ...DEFAULT_SETTINGS,
      enabled: true,
      ignoreMusicVideos: true,
      restore1xWhenDisabled: true,
      fallbackSpeed: 2,
    });
    controller.start();
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1, 2);
    const chip = document.querySelector<HTMLElement>('.dynamicspeed-chip');
    expect(chip?.querySelector('.ds-rate')?.textContent).toBe('1.00×');
    expect(chip?.querySelector('.ds-why')?.textContent).toBe('music');
    expect(chip?.title).toContain('Music category, held at 1×');

    video.playbackRate = 2;
    await flushFrames();
    expect(video.playbackRate).toBeCloseTo(1, 2);
    controller.destroy();
  });
});
