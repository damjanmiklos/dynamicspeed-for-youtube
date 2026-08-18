import { describe, expect, it, vi } from 'vitest';
import { acquireTranscript } from '../../src/lib/youtube/acquire';
import { parseSettings } from '../../src/lib/settings/defaults';

describe('acquireTranscript', () => {
  it('does not fetch or parse captions when DynamicSpeed is off', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(acquireTranscript(parseSettings({ enabled: false }))).rejects.toThrow(
      'DynamicSpeed is off',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
