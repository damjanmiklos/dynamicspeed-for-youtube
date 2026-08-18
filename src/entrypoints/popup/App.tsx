import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';
import { Knob } from '../../ui/components/Knob';
import { SliderField } from '../../ui/components/SliderField';
import { SupportLink } from '../../ui/components/SupportLink';
import { Toggle } from '../../ui/components/Toggle';
import { useSettings } from '../../ui/hooks/useSettings';
import { LIMITS } from '../../lib/settings/limits';
import {
  EMPTY_PAGE_STATE,
  RUNTIME_SOURCE,
  type PageState,
  type RuntimeMessage,
} from '../../lib/messaging/protocol';
import { isYouTubeTabUrl } from '../../lib/youtube/video-id';

async function queryPageState(): Promise<PageState> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !isYouTubeTabUrl(tab.url)) {
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
    return <div className="p-3 text-sm text-ds-muted">Loading…</div>;
  }

  const channelDisabled = Boolean(
    page.channelId && settings.channelOverrides[page.channelId]?.disabled,
  );
  const videoDisabled = Boolean(
    page.videoId && settings.disabledVideoIds.includes(page.videoId),
  );

  return (
    <div className="w-[340px] overflow-hidden bg-ds-bg px-3 py-2 text-ds-text">
      <header className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ds-muted">
            DynamicSpeed
          </div>
          <h1 className="text-base font-semibold leading-tight">for YouTube</h1>
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
        <div className="mb-2 rounded-lg border border-ds-border bg-ds-surface px-2.5 py-1.5">
          <div className="text-[11px] text-ds-muted">Now playing</div>
          <div className="truncate text-sm font-medium leading-tight">
            {page.title ?? 'YouTube'}
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="font-mono text-ds-accent">
              {page.playbackRate != null ? `${page.playbackRate.toFixed(2)}×` : '—'}
            </span>
            <span className="text-ds-muted">
              {page.spokenWpm ? `${Math.round(page.spokenWpm)} WPM` : page.transcriptStatus}
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-2 rounded-lg border border-ds-border bg-ds-surface px-2.5 py-1.5 text-sm text-ds-muted">
          Open a YouTube video to use DynamicSpeed.
        </div>
      )}

      <div className="space-y-2">
        <SliderField
          compact
          label="Target WPM"
          min={LIMITS.targetWpm.min}
          max={LIMITS.targetWpm.max}
          step={LIMITS.targetWpm.step}
          value={settings.targetWpm}
          onChange={(targetWpm) => void update({ targetWpm })}
          unit=" WPM"
        />
        <div className="flex items-center justify-between rounded-lg border border-ds-border bg-ds-surface px-2.5 py-1.5">
          <div>
            <div className="text-sm font-medium">Feel</div>
            <div className="text-[11px] text-ds-muted">
              {settings.customDynamicsUnlocked
                ? 'Custom engine values unlocked'
                : 'How quickly speed may change'}
            </div>
          </div>
          <Knob
            compact
            value={settings.responsiveness}
            disabled={settings.customDynamicsUnlocked}
            onChange={(responsiveness) => void update({ responsiveness })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SliderField
            compact
            label="Min speed"
            min={LIMITS.minSpeed.min}
            max={Math.min(LIMITS.minSpeed.max, Math.max(0.5, settings.maxSpeed - 0.05))}
            step={LIMITS.minSpeed.step}
            decimals={LIMITS.minSpeed.decimals}
            value={settings.minSpeed}
            unit="×"
            onChange={(minSpeed) => void update({ minSpeed })}
          />
          <SliderField
            compact
            label="Max speed"
            min={Math.max(LIMITS.maxSpeed.min, Math.min(4.9, settings.minSpeed + 0.05))}
            max={LIMITS.maxSpeed.max}
            step={LIMITS.maxSpeed.step}
            decimals={LIMITS.maxSpeed.decimals}
            value={settings.maxSpeed}
            unit="×"
            onChange={(maxSpeed) => void update({ maxSpeed })}
          />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          className="rounded-lg border border-ds-border bg-ds-surface px-2 py-1.5 text-left text-[11px] hover:bg-ds-surface-2 disabled:opacity-40"
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
          className="rounded-lg border border-ds-border bg-ds-surface px-2 py-1.5 text-left text-[11px] hover:bg-ds-surface-2 disabled:opacity-40"
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

      <div className="mt-2 flex items-center gap-2">
        <button
          className="min-w-0 flex-1 rounded-lg bg-ds-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-ds-accent-2"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          Open full settings
        </button>
        <SupportLink compact />
      </div>
      <p className="mt-1.5 text-center text-[10px] text-ds-muted">Alt+Shift+D · W/S</p>
    </div>
  );
}
