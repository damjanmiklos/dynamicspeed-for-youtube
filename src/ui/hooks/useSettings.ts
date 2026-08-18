import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSettings,
  saveSettings,
  watchSettings,
} from '../../lib/settings/storage';
import { DEFAULT_SETTINGS, parseSettings } from '../../lib/settings/defaults';
import type { DynamicSpeedSettings } from '../../lib/settings/schema';

/** Firefox IndexedDB storage.local.set is too slow to await on every slider tick. */
const PERSIST_MS = 50;

export function useSettings() {
  const [settings, setSettings] = useState<DynamicSpeedSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const dirtyRef = useRef(false);
  const persistTimer = useRef(0);
  const persistChain = useRef(Promise.resolve());

  const persistNow = useCallback(() => {
    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = 0;
    }
    persistChain.current = persistChain.current
      .then(async () => {
        while (dirtyRef.current) {
          dirtyRef.current = false;
          await saveSettings(settingsRef.current);
        }
      })
      .catch(() => {
        dirtyRef.current = true;
      });
    return persistChain.current;
  }, []);

  const schedulePersist = useCallback(() => {
    dirtyRef.current = true;
    if (persistTimer.current) {
      return;
    }
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = 0;
      void persistNow();
    }, PERSIST_MS);
  }, [persistNow]);

  useEffect(() => {
    void loadSettings().then((value) => {
      setSettings(value);
      setReady(true);
    });
    const stopWatch = watchSettings((incoming) => {
      if (dirtyRef.current || persistTimer.current) {
        return;
      }
      setSettings(incoming);
    });
    const onRelease = () => {
      void persistNow();
    };
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    window.addEventListener('blur', onRelease);
    document.addEventListener('visibilitychange', onRelease);
    return () => {
      stopWatch();
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('blur', onRelease);
      document.removeEventListener('visibilitychange', onRelease);
      void persistNow();
    };
  }, [persistNow]);

  const update = async (patch: Partial<DynamicSpeedSettings>) => {
    const next = parseSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    schedulePersist();
    return next;
  };

  return { settings, ready, update, setSettings };
}
