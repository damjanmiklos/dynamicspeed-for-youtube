/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { isAdShowing } from '../../src/lib/youtube/ads';

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
