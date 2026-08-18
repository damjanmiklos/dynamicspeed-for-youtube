/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  playerResponseBelongsToVideo,
  readVisibleWatchTitle,
  titleFromDocumentTitle,
} from '../../src/lib/youtube/watch-meta';

describe('playerResponseBelongsToVideo', () => {
  it('rejects the bootstrapped response from a previous watch page', () => {
    expect(
      playerResponseBelongsToVideo(
        { videoDetails: { videoId: 'aaaaaaaaaaa' } },
        'bbbbbbbbbbb',
      ),
    ).toBe(false);
  });

  it('accepts a response for the URL video', () => {
    expect(
      playerResponseBelongsToVideo(
        { videoDetails: { videoId: 'aaaaaaaaaaa' } },
        'aaaaaaaaaaa',
      ),
    ).toBe(true);
  });
});

describe('watch title', () => {
  it('strips the YouTube suffix and notification count', () => {
    expect(titleFromDocumentTitle('(2) A talk about cats - YouTube')).toBe(
      'A talk about cats',
    );
    expect(titleFromDocumentTitle('YouTube')).toBeNull();
  });

  it('prefers the live watch heading over document.title', () => {
    document.title = 'Old video - YouTube';
    document.body.innerHTML = `
      <h1 class="ytd-watch-metadata">
        <yt-formatted-string>New video title</yt-formatted-string>
      </h1>
    `;
    expect(readVisibleWatchTitle()).toBe('New video title');
  });
});
