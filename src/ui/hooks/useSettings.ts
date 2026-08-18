import { useEffect, useState } from 'react';
import {
  loadSettings,
  patchSettings,
  watchSettings,
} from '../../lib/settings/storage';
import { DEFAULT_SETTINGS } from '../../lib/settings/defaults';
import type { DynamicSpeedSettings } from '../../lib/settings/schema';

export function useSettings() {
  const [settings, setSettings] = useState<DynamicSpeedSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSettings().then((value) => {
      setSettings(value);
      setReady(true);
    });
    return watchSettings(setSettings);
  }, []);

  const update = async (patch: Partial<DynamicSpeedSettings>) => {
    const next = await patchSettings(patch);
    setSettings(next);
    return next;
  };

  return { settings, ready, update, setSettings };
}
