/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { findMainVideo, isAdShowing } from '../../src/lib/youtube/ads';

describe('isAdShowing', () => {
  it('ignores the idle ad module YouTube leaves in the player DOM', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player ad-created playing-mode">
        <div class="video-ads">
          <div class="ytp-ad-module"></div>
        </div>
      </div>
    `;
    expect(isAdShowing()).toBe(false);
  });

  it('detects a real mid-roll from the ad-showing class', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player ad-showing">
        <div class="video-ads">
          <div class="ytp-ad-module"></div>
        </div>
      </div>
    `;
    expect(isAdShowing()).toBe(true);
  });

  it('detects the ad overlay when present', () => {
    document.body.innerHTML = `
      <div id="movie_player" class="html5-video-player">
        <div class="ytp-ad-player-overlay"></div>
      </div>
    `;
    expect(isAdShowing()).toBe(true);
  });
});

describe('findMainVideo', () => {
  function sized(video: HTMLVideoElement): HTMLVideoElement {
    Object.defineProperty(video, 'offsetWidth', { value: 320 });
    Object.defineProperty(video, 'offsetHeight', { value: 180 });
    return video;
  }

  it('ignores hover previews on the home page', () => {
    document.body.innerHTML = `
      <ytd-video-preview id="video-preview">
        <div id="inline-preview-player" class="html5-video-player">
          <video class="html5-main-video"></video>
        </div>
      </ytd-video-preview>
      <ytd-miniplayer>
        <div id="movie_player" class="html5-video-player">
          <video class="html5-main-video"></video>
        </div>
      </ytd-miniplayer>
    `;
    const [preview, main] = [...document.querySelectorAll('video')].map(sized);
    expect(findMainVideo()).toBe(main);
    expect(findMainVideo()).not.toBe(preview);
  });

  it('returns nothing when only a preview is playing', () => {
    document.body.innerHTML = `
      <div id="inline-preview-player"><video></video></div>
    `;
    sized(document.querySelector('video')!);
    expect(findMainVideo()).toBeNull();
  });
});
