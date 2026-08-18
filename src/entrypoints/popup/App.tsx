import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';
import { Knob } from '../../ui/components/Knob';
import { SliderField } from '../../ui/components/SliderField';
import { Toggle } from '../../ui/components/Toggle';
import { useSettings } from '../../ui/hooks/useSettings';
import {
  EMPTY_PAGE_STATE,
  RUNTIME_SOURCE,
  type PageState,
  type RuntimeMessage,
} from '../../lib/messaging/protocol';

async function queryPageState(): Promise<PageState> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.includes('youtube.com')) {
    return EMPTY_PAGE_STATE;
  }
  try {
    const response = (await browser.tabs.sendMessage(tab.id, {
      source: RUNTIME_SOURCE,
      type: 'GET_PAGE_STATE',
    } satisfies RuntimeMessage)) as RuntimeMessage;
    if (response.type === 'PAGE_STATE') {
      return { ...response.state, isYouTube: true };
    }
  } catch {
    return { ...EMPTY_PAGE_STATE, isYouTube: true, transcriptStatus: 'unavailable' };
  }
  return EMPTY_PAGE_STATE;
}

export function PopupApp() {
  const { settings, ready, update } = useSettings();
  const [page, setPage] = useState<PageState>(EMPTY_PAGE_STATE);

  useEffect(() => {
    void queryPageState().then(setPage);
    const timer = window.setInterval(() => {
      void queryPageState().then(setPage);
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready) {
    return <div className="p-4 text-sm text-ds-muted">Loading…</div>;
  }

  const channelDisabled = Boolean(
    page.channelId && settings.channelOverrides[page.channelId]?.disabled,
  );
  const videoDisabled = Boolean(
    page.videoId && settings.disabledVideoIds.includes(page.videoId),
  );

  return (
    <div className="w-[360px] bg-ds-bg p-4 text-ds-text">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ds-muted">
            DynamicSpeed
          </div>
          <h1 className="text-lg font-semibold">for YouTube</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ds-muted">
            {settings.enabled ? 'On' : 'Off'}
          </span>
          <Toggle
            checked={settings.enabled}
            label="Enable DynamicSpeed"
            onChange={(enabled) => void update({ enabled })}
          />
        </div>
      </header>

      {page.isYouTube ? (
        <div className="mb-4 rounded-xl border border-ds-border bg-ds-surface p-3">
          <div className="text-xs text-ds-muted">Now playing</div>
          <div className="truncate text-sm font-medium">
            {page.title ?? 'YouTube'}
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="font-mono text-ds-accent">
              {page.playbackRate != null ? `${page.playbackRate.toFixed(2)}×` : '—'}
            </span>
            <span className="text-ds-muted">
              {page.spokenWpm ? `${Math.round(page.spokenWpm)} WPM` : page.transcriptStatus}
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-ds-border bg-ds-surface p-3 text-sm text-ds-muted">
          Open a YouTube video to use DynamicSpeed.
        </div>
      )}

      <div className="space-y-4">
        <SliderField
          label="Target WPM"
          hint="Spoken words you want to hear per minute"
          min={120}
          max={250}
          value={Math.min(250, Math.max(120, settings.targetWpm))}
          onChange={(targetWpm) => void update({ targetWpm })}
          unit=" WPM"
        />
        <div className="flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface px-3 py-3">
          <div>
            <div className="text-sm font-medium">Feel</div>
            <div className="text-xs text-ds-muted">
              {settings.customDynamicsUnlocked
                ? 'Custom engine values unlocked'
                : 'How quickly speed may change'}
            </div>
          </div>
          <Knob
            value={settings.responsiveness}
            disabled={settings.customDynamicsUnlocked}
            onChange={(responsiveness) => void update({ responsiveness })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SliderField
            label="Min speed"
            min={0.25}
            max={Math.max(0.5, settings.maxSpeed - 0.05)}
            step={0.05}
            decimals={2}
            value={settings.minSpeed}
            unit="×"
            onChange={(minSpeed) => void update({ minSpeed })}
          />
          <SliderField
            label="Max speed"
            min={Math.min(4.9, settings.minSpeed + 0.05)}
            max={5}
            step={0.05}
            decimals={2}
            value={settings.maxSpeed}
            unit="×"
            onChange={(maxSpeed) => void update({ maxSpeed })}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-left text-xs hover:bg-ds-surface-2 disabled:opacity-40"
          disabled={!page.channelId}
          onClick={() =>
            void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
              if (tab?.id) {
                void browser.tabs.sendMessage(tab.id, {
                  source: RUNTIME_SOURCE,
                  type: 'TOGGLE_CHANNEL',
                } satisfies RuntimeMessage);
              }
            })
          }
        >
          {channelDisabled ? 'Enable this channel' : 'Disable this channel'}
        </button>
        <button
          className="rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-left text-xs hover:bg-ds-surface-2 disabled:opacity-40"
          disabled={!page.videoId}
          onClick={() =>
            void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
              if (tab?.id) {
                void browser.tabs.sendMessage(tab.id, {
                  source: RUNTIME_SOURCE,
                  type: 'TOGGLE_VIDEO',
                } satisfies RuntimeMessage);
              }
            })
          }
        >
          {videoDisabled ? 'Enable this video' : 'Disable this video'}
        </button>
      </div>

      <button
        className="mt-4 w-full rounded-lg bg-ds-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-ds-accent-2"
        onClick={() => void browser.runtime.openOptionsPage()}
      >
        Open full settings
      </button>
      <p className="mt-3 text-[11px] text-ds-muted">
        Alt+Shift+D toggle · Alt+Shift+W / S target WPM
      </p>
    </div>
  );
}
