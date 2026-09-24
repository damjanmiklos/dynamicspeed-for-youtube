/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson, REVOKE_DELAY_MS } from '../../src/ui/download';

describe('downloadJson', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks an attached link and revokes the blob URL later, not immediately', () => {
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    let attachedOnClick = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attachedOnClick = this.isConnected;
      expect(this.download).toBe('file.json');
    });
    downloadJson('file.json', { a: 1 });
    expect(attachedOnClick).toBe(true);
    expect(document.querySelector('a')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_DELAY_MS);
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
