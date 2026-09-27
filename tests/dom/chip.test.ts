/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import {
  chipHoldDetail,
  chipHoldReason,
  formatRate,
  upsertPlayerChip,
} from '../../src/lib/youtube/chip';

describe('player chip', () => {
  it('formats missing rates as an em dash', () => {
    expect(formatRate(null, 2)).toBe('—');
    expect(formatRate(1.472, 2)).toBe('1.47×');
  });

  it('inserts the chip before the settings button', () => {
    document.body.innerHTML = `
      <div class="ytp-chrome-bottom">
        <div class="ytp-right-controls">
          <button class="ytp-subtitles-button ytp-button"></button>
          <button class="ytp-settings-button ytp-button"></button>
        </div>
      </div>
    `;
    const chip = upsertPlayerChip({
      label: '1.50×',
      title: 'DynamicSpeed',
    });
    const settings = document.querySelector('.ytp-settings-button');
    expect(chip).toBeTruthy();
    expect(chip?.nextElementSibling).toBe(settings);
    const again = upsertPlayerChip({ label: '1.50×', title: 'DynamicSpeed', conflict: true });
    expect(document.querySelectorAll('.dynamicspeed-chip')).toHaveLength(1);
    expect(again).toBe(chip);
    expect(again?.dataset.dsConflict).toBe('true');
  });

  it('shows a short reason beside the rate when a rule holds speed', () => {
    document.body.innerHTML = `
      <div class="ytp-right-controls">
        <button class="ytp-settings-button ytp-button"></button>
      </div>
    `;
    const chip = upsertPlayerChip({
      label: '1.00×',
      reason: 'music',
      title: 'DynamicSpeed',
    });
    const why = () => chip?.querySelector<HTMLElement>('.ds-why');
    expect(chip?.querySelector('.ds-rate')?.textContent).toBe('1.00×');
    expect(why()?.textContent).toBe('music');
    expect(why()?.hidden).toBe(false);
    expect(chip?.getAttribute('aria-label')).toBe('DynamicSpeed playback rate, music');

    upsertPlayerChip({ label: '1.80×', reason: null, title: 'DynamicSpeed' });
    expect(why()?.hidden).toBe(true);
    expect(why()?.textContent).toBe('');
  });
});

describe('chip hold reasons', () => {
  it('names the rule that pins music videos at 1×', () => {
    expect(
      chipHoldReason({
        blockReason: 'music-disabled',
        transcriptStatus: 'ready',
        curveActive: true,
      }),
    ).toBe('music');
    expect(chipHoldDetail('music', true)).toBe('Music category, held at 1×');
  });

  it('names caption fallback and disable rules that use Default speed', () => {
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'loading',
        curveActive: false,
      }),
    ).toBe('loading');
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'missing',
        curveActive: false,
      }),
    ).toBe('no captions');
    expect(
      chipHoldReason({
        blockReason: 'paused',
        transcriptStatus: 'ready',
        curveActive: false,
      }),
    ).toBe('off');
    expect(chipHoldDetail('off', true)).toBe('DynamicSpeed is off, using Default speed');
    expect(chipHoldDetail('off', false)).toBe('DynamicSpeed is off');
  });

  it('stays quiet while the curve is driving speed, and during ads or a manual override', () => {
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'ready',
        curveActive: true,
      }),
    ).toBeNull();
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'ready',
        curveActive: true,
        mode: 'ad',
      }),
    ).toBeNull();
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'ready',
        curveActive: false,
        mode: 'manual',
      }),
    ).toBeNull();
    expect(
      chipHoldReason({
        blockReason: null,
        transcriptStatus: 'ready',
        curveActive: false,
        mode: 'forced 1.00×',
      }),
    ).toBe('held');
  });
});
