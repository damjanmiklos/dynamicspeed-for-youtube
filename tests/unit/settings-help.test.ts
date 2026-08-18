import { describe, expect, it } from 'vitest';
import { SETTINGS_HELP } from '../../src/ui/settings-help';

describe('settings help copy', () => {
  it('has a label and a real explanation for every control', () => {
    for (const [key, help] of Object.entries(SETTINGS_HELP)) {
      expect(help.label, key).toMatch(/^About /);
      expect(help.body.length, key).toBeGreaterThan(0);
      expect(help.body.join(' ').length, key).toBeGreaterThan(40);
    }
  });
});
