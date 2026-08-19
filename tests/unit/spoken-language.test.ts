import { describe, expect, it } from 'vitest';
import { CAPTION_LANGUAGE_AUTO } from '../../src/lib/settings/caption-languages';
import { selectCaptionTrack } from '../../src/lib/transcript/select-track';
import {
  resolveCaptionLanguage,
  spokenLanguageFromCaptionList,
} from '../../src/lib/transcript/spoken-language';

describe('spoken language from YouTube caption lists', () => {
  it('uses the unique ASR language even when English captions also exist', () => {
    expect(
      spokenLanguageFromCaptionList({
        captionTracks: [
          { languageCode: 'de', kind: 'asr', vssId: 'a.de' },
          { languageCode: 'en', vssId: '.en' },
        ],
      }),
    ).toBe('de');
  });

  it('uses the default audio track ASR when a video is dubbed', () => {
    expect(
      spokenLanguageFromCaptionList({
        defaultAudioTrackIndex: 1,
        captionTracks: [
          { languageCode: 'de', kind: 'asr', vssId: 'a.de' },
          { languageCode: 'en', kind: 'asr', vssId: 'a.en' },
          { languageCode: 'en' },
        ],
        audioTracks: [
          { captionTrackIndices: [0], audioTrackId: 'de.0' },
          { captionTrackIndices: [1, 2], audioTrackId: 'en.4' },
        ],
      }),
    ).toBe('en');
  });

  it('does not follow a defaultCaptionTrackIndex-style English preference', () => {
    expect(
      spokenLanguageFromCaptionList({
        defaultAudioTrackIndex: 0,
        captionTracks: [
          { languageCode: 'de', kind: 'asr', vssId: 'a.de' },
          { languageCode: 'en' },
        ],
        audioTracks: [{ captionTrackIndices: [0, 1], languageCode: 'de' }],
      }),
    ).toBe('de');
  });
});

describe('resolveCaptionLanguage', () => {
  it('keeps a pinned language', () => {
    expect(resolveCaptionLanguage('en', 'de', [{ languageCode: 'de', kind: 'asr' }])).toBe(
      'en',
    );
  });

  it('uses spoken language in auto mode', () => {
    expect(
      resolveCaptionLanguage(CAPTION_LANGUAGE_AUTO, 'de', [
        { languageCode: 'de', kind: 'asr' },
        { languageCode: 'en' },
      ]),
    ).toBe('de');
  });

  it('falls back to ASR on the track list when spoken is missing', () => {
    expect(
      resolveCaptionLanguage(CAPTION_LANGUAGE_AUTO, null, [
        { languageCode: 'en' },
        { languageCode: 'fr', kind: 'asr' },
      ]),
    ).toBe('fr');
  });
});

describe('selectCaptionTrack with auto-resolved language', () => {
  it('picks German ASR over English on a German video', () => {
    const tracks = [
      { baseUrl: 'de-asr', languageCode: 'de', kind: 'asr' },
      { baseUrl: 'en-asr', languageCode: 'en', kind: 'asr' },
      { baseUrl: 'en', languageCode: 'en' },
    ];
    const language = resolveCaptionLanguage(
      CAPTION_LANGUAGE_AUTO,
      spokenLanguageFromCaptionList({ captionTracks: tracks }),
      tracks,
    );
    expect(language).toBe('de');
    expect(selectCaptionTrack(tracks, { language, preferManual: false })?.baseUrl).toBe(
      'de-asr',
    );
  });
});
