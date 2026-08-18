/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { formatRate, upsertPlayerChip } from '../../src/lib/youtube/chip';

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
    const again = upsertPlayerChip({ label: '1.50×', title: 'DynamicSpeed' });
    expect(document.querySelectorAll('.dynamicspeed-chip')).toHaveLength(1);
    expect(again).toBe(chip);
  });
});
