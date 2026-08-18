import { describe, expect, it } from 'vitest';
import { rangeFillStyle } from '../../src/ui/range-fill';

describe('rangeFillStyle', () => {
  it('sets the Chrome fill variable when moz progress is unavailable', () => {
    const style = rangeFillStyle(40);
    if (typeof CSS !== 'undefined' && CSS.supports('-moz-appearance', 'none')) {
      expect(style).toBeUndefined();
      return;
    }
    expect(style).toEqual({ ['--ds-fill']: '40%' });
  });
});
