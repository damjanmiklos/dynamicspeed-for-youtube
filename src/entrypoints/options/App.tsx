import { browser } from 'wxt/browser';
import { useEffect, useMemo, useState } from 'react';
import { FeelSlider } from '../../ui/components/FeelSlider';
import { SliderField } from '../../ui/components/SliderField';
import { SelectField } from '../../ui/components/SelectField';
import { SupportLink } from '../../ui/components/SupportLink';
import { Toggle } from '../../ui/components/Toggle';
import { InfoTip } from '../../ui/components/InfoTip';
import { SETTINGS_HELP, type SettingHelp } from '../../ui/settings-help';
import { useSettings } from '../../ui/hooks/useSettings';
import { resetSettings } from '../../lib/settings/storage';
import { TRANSCRIPT_CACHE_KEY } from '../../lib/settings/schema';
import {
  clearTranscriptCache,
  formatCacheBytes,
  measureTranscriptCacheUsage,
  pruneExpiredTranscriptCache,
} from '../../lib/youtube/cache';
import { resolveDynamics } from '../../lib/pacing/feel';
import { LIMITS } from '../../lib/settings/limits';
import { CAPTION_LANGUAGES } from '../../lib/settings/caption-languages';
import type { DynamicSpeedSettings } from '../../lib/settings/schema';

const NAV = [
  { id: 'general', label: 'General' },
  { id: 'pacing', label: 'Pacing engine' },
  { id: 'pauses', label: 'Pauses & b-roll' },
  { id: 'channels', label: 'Channel rules' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'display', label: 'Display' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'privacy', label: 'Privacy' },
] as const;

type NavId = (typeof NAV)[number]['id'];

function Row({
  title,
  hint,
  help,
  children,
  inactive = false,
}: {
  title: string;
  hint: string;
  help: SettingHelp;
  children: React.ReactNode;
  inactive?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b border-ds-border py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${
        inactive ? 'opacity-60' : ''
      }`}
      aria-disabled={inactive || undefined}
    >
      <div className="max-w-xl">
        <div className="flex items-center">
          <div className="text-sm font-medium">{title}</div>
          <InfoTip help={help} />
        </div>
        <div className="text-sm text-ds-muted">{hint}</div>
      </div>
      <div className="sm:w-72">{children}</div>
    </div>
  );
}

export function OptionsApp() {
  const { settings, ready, update } = useSettings();
  const [section, setSection] = useState<NavId>('general');
  const [importError, setImportError] = useState<string | null>(null);
  const [cacheUsage, setCacheUsage] = useState<{ bytes: number; videos: number } | null>(
    null,
  );
  const dynamics = useMemo(() => resolveDynamics(settings), [settings]);

  useEffect(() => {
    if (section !== 'privacy') {
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void measureTranscriptCacheUsage().then((usage) => {
        if (!cancelled) {
          setCacheUsage(usage);
        }
      });
    };
    refresh();
    const onChanged = (
      changes: Record<string, unknown>,
      area?: string,
    ) => {
      if (area && area !== 'local') {
        return;
      }
      if (TRANSCRIPT_CACHE_KEY in changes) {
        refresh();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, [section]);

  if (!ready) {
    return <div className="p-10 text-ds-muted">Loading settings…</div>;
  }

  return (
    <div className="min-h-screen bg-ds-bg text-ds-text">
      <div className="mx-auto flex max-w-6xl gap-0 md:gap-8">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-ds-border bg-ds-bg-2 p-6 md:block">
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ds-muted">
              DynamicSpeed
            </div>
            <div className="text-xl font-semibold">Settings</div>
          </div>
          <nav className="space-y-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                  section === item.id
                    ? 'bg-ds-surface text-white'
                    : 'text-ds-muted hover:bg-ds-surface/60 hover:text-white'
                }`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-8">
            <SupportLink />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
          <div className="mb-6 flex items-center justify-between gap-3 md:hidden">
            <div className="flex gap-2 overflow-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
                  section === item.id ? 'bg-ds-accent text-white' : 'bg-ds-surface text-ds-muted'
                }`}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
            </div>
            <SupportLink compact />
          </div>

          {section === 'general' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">General</h1>
              <p className="mb-6 max-w-2xl text-ds-muted">
                DynamicSpeed reads YouTube captions on your device and sets playback speed so
                speech lands near your target words-per-minute.
              </p>
              <Row title="Enable" hint="Master switch for automatic speed control." help={SETTINGS_HELP.enabled}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.enabled}
                    onChange={(enabled) => void update({ enabled })}
                  />
                </div>
              </Row>
              <Row
                title="Target WPM"
                hint="How fast you want speech to feel. Typical conversation is about 150–180."
                help={SETTINGS_HELP.targetWpm}
              >
                <SliderField
                  label=""
                  min={LIMITS.targetWpm.min}
                  max={LIMITS.targetWpm.max}
                  step={LIMITS.targetWpm.step}
                  value={settings.targetWpm}
                  unit=" WPM"
                  onChange={(targetWpm) => void update({ targetWpm })}
                />
              </Row>
              <Row title="Minimum speed" hint="Never go slower than this, even for very fast talkers." help={SETTINGS_HELP.minSpeed}>
                <SliderField
                  label=""
                  min={LIMITS.minSpeed.min}
                  max={Math.min(LIMITS.minSpeed.max, Math.max(0.5, settings.maxSpeed - 0.05))}
                  step={LIMITS.minSpeed.step}
                  decimals={LIMITS.minSpeed.decimals}
                  value={settings.minSpeed}
                  unit="×"
                  onChange={(minSpeed) => void update({ minSpeed })}
                />
              </Row>
              <Row title="Maximum speed" hint="Cap for slow speech and optional b-roll skipping." help={SETTINGS_HELP.maxSpeed}>
                <SliderField
                  label=""
                  min={Math.max(LIMITS.maxSpeed.min, Math.min(4.9, settings.minSpeed + 0.05))}
                  max={LIMITS.maxSpeed.max}
                  step={LIMITS.maxSpeed.step}
                  decimals={LIMITS.maxSpeed.decimals}
                  value={settings.maxSpeed}
                  unit="×"
                  onChange={(maxSpeed) => void update({ maxSpeed })}
                />
              </Row>
              <Row
                title="Default speed"
                hint="Used before captions are ready, and whenever a transcript cannot be found."
                help={SETTINGS_HELP.fallbackSpeed}
              >
                <SliderField
                  label=""
                  min={LIMITS.fallbackSpeed.min}
                  max={LIMITS.fallbackSpeed.max}
                  step={LIMITS.fallbackSpeed.step}
                  decimals={LIMITS.fallbackSpeed.decimals}
                  value={settings.fallbackSpeed}
                  unit="×"
                  onChange={(fallbackSpeed) => void update({ fallbackSpeed })}
                />
              </Row>
              <Row
                title="Responsiveness"
                hint="Low is molasses-smooth. High reacts to incoming speech sooner. Unlocking custom engine sliders turns this into a display-only Custom mode."
                help={SETTINGS_HELP.responsiveness}
                inactive={settings.customDynamicsUnlocked}
              >
                <FeelSlider
                  value={settings.responsiveness}
                  disabled={settings.customDynamicsUnlocked}
                  onChange={(responsiveness) => void update({ responsiveness })}
                />
              </Row>
              <Row title="Caption language" hint="Preferred caption track when several exist." help={SETTINGS_HELP.captionLanguage}>
                <SelectField
                  value={settings.captionLanguage}
                  options={CAPTION_LANGUAGES}
                  onChange={(captionLanguage) => void update({ captionLanguage })}
                />
              </Row>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="mr-1 inline-flex items-center text-sm font-medium">
                  Backup
                  <InfoTip help={SETTINGS_HELP.backup} />
                </span>
                <button
                  className="rounded-lg border border-ds-border px-4 py-2 text-sm"
                  onClick={() => void resetSettings()}
                >
                  Restore defaults
                </button>
                <button
                  className="rounded-lg border border-ds-border px-4 py-2 text-sm"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(settings, null, 2)], {
                      type: 'application/json',
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'dynamicspeed-settings.json';
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export JSON
                </button>
                <label className="rounded-lg border border-ds-border px-4 py-2 text-sm">
                  Import JSON
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      if (file.size > 100_000) {
                        setImportError('Settings file is too large.');
                        return;
                      }
                      try {
                        const parsed: unknown = JSON.parse(await file.text());
                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                          setImportError('Could not import that file.');
                          return;
                        }
                        await update(parsed as Partial<DynamicSpeedSettings>);
                        setImportError(null);
                      } catch {
                        setImportError('Could not import that file.');
                      }
                    }}
                  />
                </label>
              </div>
              {importError ? <p className="mt-3 text-sm text-ds-accent">{importError}</p> : null}
            </section>
          )}

          {section === 'pacing' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Pacing engine</h1>
              <p className="mb-6 max-w-2xl text-ds-muted">
                These controls change how spoken WPM is estimated. Leave custom values locked
                unless you want to override the responsiveness slider.
              </p>
              <Row
                title="Syllable-weighted WPM"
                hint="Count syllables instead of raw words so dense speech is not treated as slow."
                help={SETTINGS_HELP.syllableWeighting}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.syllableWeighting}
                    onChange={(syllableWeighting) => void update({ syllableWeighting })}
                  />
                </div>
              </Row>
              <Row
                title="Jargon compensation"
                hint="Extra weight on hard English words (not in Google's 10k English list, 3+ syllables). Ignored for non-English captions. 1.00 is off. 1.15 means those words count 15% more."
                help={SETTINGS_HELP.jargonCompensation}
              >
                <SliderField
                  label=""
                  min={LIMITS.jargonCompensation.min}
                  max={LIMITS.jargonCompensation.max}
                  step={LIMITS.jargonCompensation.step}
                  decimals={LIMITS.jargonCompensation.decimals}
                  value={settings.jargonCompensation}
                  onChange={(jargonCompensation) => void update({ jargonCompensation })}
                />
              </Row>
              <Row
                title="Unlock custom dynamics"
                hint="Replace the feel slider with explicit Gaussian, median, and slew values."
                help={SETTINGS_HELP.customDynamics}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.customDynamicsUnlocked}
                    onChange={(customDynamicsUnlocked) =>
                      void update({ customDynamicsUnlocked })
                    }
                  />
                </div>
              </Row>
              <Row
                title="Gaussian window (σ)"
                hint={`Seconds of zero-phase smoothing. Current feel pack: ${dynamics.gaussianSigma.toFixed(1)}s.`}
                help={SETTINGS_HELP.gaussianSigma}
                inactive={!settings.customDynamicsUnlocked}
              >
                <SliderField
                  label=""
                  min={LIMITS.gaussianSigma.min}
                  max={LIMITS.gaussianSigma.max}
                  step={LIMITS.gaussianSigma.step}
                  decimals={LIMITS.gaussianSigma.decimals}
                  value={
                    settings.customDynamicsUnlocked
                      ? settings.gaussianSigma
                      : dynamics.gaussianSigma
                  }
                  unit="s"
                  disabled={!settings.customDynamicsUnlocked}
                  onChange={(gaussianSigma) => void update({ gaussianSigma })}
                />
              </Row>
              <Row
                title="Median window"
                hint={`Strips caption jitter. Current feel pack: ${dynamics.medianWindowSec.toFixed(1)}s.`}
                help={SETTINGS_HELP.medianWindow}
                inactive={!settings.customDynamicsUnlocked}
              >
                <SliderField
                  label=""
                  min={LIMITS.medianWindowSec.min}
                  max={LIMITS.medianWindowSec.max}
                  step={LIMITS.medianWindowSec.step}
                  decimals={LIMITS.medianWindowSec.decimals}
                  value={
                    settings.customDynamicsUnlocked
                      ? settings.medianWindowSec
                      : dynamics.medianWindowSec
                  }
                  unit="s"
                  disabled={!settings.customDynamicsUnlocked}
                  onChange={(medianWindowSec) => void update({ medianWindowSec })}
                />
              </Row>
              <Row
                title="Slew limit"
                hint={`Max playback-rate change per second. Seeks snap instantly. Current feel pack: ${dynamics.slewRateLimit.toFixed(2)}×/s.`}
                help={SETTINGS_HELP.slewLimit}
                inactive={!settings.customDynamicsUnlocked}
              >
                <SliderField
                  label=""
                  min={LIMITS.slewRateLimit.min}
                  max={LIMITS.slewRateLimit.max}
                  step={LIMITS.slewRateLimit.step}
                  decimals={LIMITS.slewRateLimit.decimals}
                  value={
                    settings.customDynamicsUnlocked
                      ? settings.slewRateLimit
                      : dynamics.slewRateLimit
                  }
                  unit="×/s"
                  disabled={!settings.customDynamicsUnlocked}
                  onChange={(slewRateLimit) => void update({ slewRateLimit })}
                />
              </Row>
              <Row title="Minimum caption chunk" hint="Merge tiny caption fragments below this duration." help={SETTINGS_HELP.minChunk}>
                <SliderField
                  label=""
                  min={LIMITS.minChunkSec.min}
                  max={LIMITS.minChunkSec.max}
                  step={LIMITS.minChunkSec.step}
                  decimals={LIMITS.minChunkSec.decimals}
                  value={settings.minChunkSec}
                  unit="s"
                  onChange={(minChunkSec) => void update({ minChunkSec })}
                />
              </Row>
            </section>
          )}

          {section === 'pauses' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Pauses & b-roll</h1>
              <p className="mb-6 max-w-2xl text-ds-muted">
                Long gaps in speech are not treated as slow talking. With b-roll off, speed
                eases between the speech on either side (monotone cubic / PCHIP). With b-roll
                on, long silences head toward max speed.
              </p>
              <Row
                title="B-roll acceleration"
                hint="Speed up long pauses and visual-only stretches instead of interpolating through them."
                help={SETTINGS_HELP.bRoll}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.bRollAcceleration}
                    onChange={(bRollAcceleration) => void update({ bRollAcceleration })}
                  />
                </div>
              </Row>
              <Row title="Long pause" hint="Gap length that counts as a pause rather than slow speech." help={SETTINGS_HELP.longPause}>
                <SliderField
                  label=""
                  min={LIMITS.longPauseSec.min}
                  max={LIMITS.longPauseSec.max}
                  step={LIMITS.longPauseSec.step}
                  decimals={LIMITS.longPauseSec.decimals}
                  value={settings.longPauseSec}
                  unit="s"
                  onChange={(longPauseSec) => void update({ longPauseSec })}
                />
              </Row>
              <Row
                title="Treat [Music] as b-roll"
                hint="Caption tags like [Music] or [Applause] are never counted as spoken WPM."
                help={SETTINGS_HELP.treatMusic}
                inactive={!settings.bRollAcceleration}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.treatMusicAsBRoll}
                    disabled={!settings.bRollAcceleration}
                    onChange={(treatMusicAsBRoll) => void update({ treatMusicAsBRoll })}
                  />
                </div>
              </Row>
            </section>
          )}

          {section === 'channels' && (
            <section>
              <h1 className="mb-2 flex items-center text-3xl font-semibold">
                Channel rules
                <InfoTip help={SETTINGS_HELP.channelDisabled} />
              </h1>
              <p className="mb-6 max-w-2xl text-ds-muted">
                Disable a channel from the toolbar popup while watching. Overrides appear here.
              </p>
              {Object.keys(settings.channelOverrides).length === 0 ? (
                <div className="rounded-xl border border-ds-border bg-ds-surface p-6 text-ds-muted">
                  No channel overrides yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(settings.channelOverrides).map(([id, override]) => (
                    <div
                      key={id}
                      className="rounded-xl border border-ds-border bg-ds-surface p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">{override.name ?? id}</div>
                          <div className="text-xs text-ds-muted">{id}</div>
                        </div>
                        <button
                          className="text-sm text-ds-accent"
                          onClick={() => {
                            const next = { ...settings.channelOverrides };
                            delete next[id];
                            void update({ channelOverrides: next });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="inline-flex items-center text-sm">
                          Disabled
                          <InfoTip help={SETTINGS_HELP.channelDisabled} />
                        </span>
                        <Toggle
                          checked={Boolean(override.disabled)}
                          onChange={(disabled) =>
                            void update({
                              channelOverrides: {
                                ...settings.channelOverrides,
                                [id]: { ...override, disabled },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {settings.disabledVideoIds.length > 0 ? (
                <div className="mt-6">
                  <h2 className="mb-2 flex items-center text-lg font-medium">
                    Disabled videos
                    <InfoTip help={SETTINGS_HELP.disabledVideos} />
                  </h2>
                  <ul className="space-y-2 text-sm">
                    {settings.disabledVideoIds.map((id) => (
                      <li key={id} className="flex justify-between rounded-lg bg-ds-surface px-3 py-2">
                        <span className="font-mono">{id}</span>
                        <button
                          className="text-ds-accent"
                          onClick={() =>
                            void update({
                              disabledVideoIds: settings.disabledVideoIds.filter(
                                (item) => item !== id,
                              ),
                            })
                          }
                        >
                          Enable
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          )}

          {section === 'behavior' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Behavior</h1>
              <Row title="Ignore ads" hint="Do not drive playback rate while a YouTube ad is showing." help={SETTINGS_HELP.ignoreAds}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.ignoreAds}
                    onChange={(ignoreAds) => void update({ ignoreAds })}
                  />
                </div>
              </Row>
              <Row title="Ignore music videos" hint="Leave official Music-category videos at YouTube’s speed." help={SETTINGS_HELP.ignoreMusic}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.ignoreMusicVideos}
                    onChange={(ignoreMusicVideos) => void update({ ignoreMusicVideos })}
                  />
                </div>
              </Row>
              <Row title="Enable on Shorts" hint="Apply DynamicSpeed on YouTube Shorts." help={SETTINGS_HELP.enableShorts}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.enableOnShorts}
                    onChange={(enableOnShorts) => void update({ enableOnShorts })}
                  />
                </div>
              </Row>
              <Row
                title="Prefer manual captions"
                hint="Use creator-uploaded captions when they exist. Auto-captions often have better word timing."
                help={SETTINGS_HELP.preferManual}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.preferManualCaptions}
                    onChange={(preferManualCaptions) => void update({ preferManualCaptions })}
                  />
                </div>
              </Row>
              <Row
                title="Manual override timeout"
                hint="If you change speed in YouTube’s menu, wait this long before taking over again."
                help={SETTINGS_HELP.manualOverride}
              >
                <SliderField
                  label=""
                  min={LIMITS.manualOverrideTimeoutSec.min}
                  max={LIMITS.manualOverrideTimeoutSec.max}
                  step={LIMITS.manualOverrideTimeoutSec.step}
                  value={settings.manualOverrideTimeoutSec}
                  unit="s"
                  onChange={(manualOverrideTimeoutSec) =>
                    void update({ manualOverrideTimeoutSec })
                  }
                />
              </Row>
              <Row title="Restore 1× when disabled" hint="Reset playback speed when DynamicSpeed is turned off." help={SETTINGS_HELP.restore1x}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.restore1xWhenDisabled}
                    onChange={(restore1xWhenDisabled) =>
                      void update({ restore1xWhenDisabled })
                    }
                  />
                </div>
              </Row>
            </section>
          )}

          {section === 'display' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Display</h1>
              <Row title="Player chip" hint="Show the current speed to the left of YouTube’s settings gear." help={SETTINGS_HELP.playerChip}>
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.showPlayerChip}
                    onChange={(showPlayerChip) => void update({ showPlayerChip })}
                  />
                </div>
              </Row>
              <Row title="Chip decimals" hint="1.5× vs 1.47×." help={SETTINGS_HELP.chipDecimals} inactive={!settings.showPlayerChip}>
                <SliderField
                  label=""
                  min={LIMITS.chipDecimalPlaces.min}
                  max={LIMITS.chipDecimalPlaces.max}
                  step={LIMITS.chipDecimalPlaces.step}
                  value={settings.chipDecimalPlaces}
                  disabled={!settings.showPlayerChip}
                  onChange={(chipDecimalPlaces) =>
                    void update({ chipDecimalPlaces: chipDecimalPlaces as 1 | 2 })
                  }
                />
              </Row>
              <Row
                title="WPM in tooltip"
                hint="Show estimated spoken WPM when hovering the chip."
                help={SETTINGS_HELP.wpmTooltip}
                inactive={!settings.showPlayerChip}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.showWpmInTooltip}
                    disabled={!settings.showPlayerChip}
                    onChange={(showWpmInTooltip) => void update({ showWpmInTooltip })}
                  />
                </div>
              </Row>
            </section>
          )}

          {section === 'shortcuts' && (
            <section>
              <h1 className="mb-2 flex items-center text-3xl font-semibold">
                Shortcuts
                <InfoTip help={SETTINGS_HELP.shortcuts} />
              </h1>
              <p className="mb-6 text-ds-muted">
                Chrome and Firefox let you change these in the browser’s extension shortcut
                page. Defaults:
              </p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center rounded-xl bg-ds-surface px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-ds-accent">Alt+Shift+D</span> — toggle
                  </span>
                  <InfoTip help={SETTINGS_HELP.toggleShortcut} align="end" />
                </li>
                <li className="flex items-center rounded-xl bg-ds-surface px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-ds-accent">Alt+Shift+W</span> — target WPM +10
                  </span>
                  <InfoTip help={SETTINGS_HELP.wpmUpShortcut} align="end" />
                </li>
                <li className="flex items-center rounded-xl bg-ds-surface px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-ds-accent">Alt+Shift+S</span> — target WPM −10
                  </span>
                  <InfoTip help={SETTINGS_HELP.wpmDownShortcut} align="end" />
                </li>
                <li className="flex items-center rounded-xl bg-ds-surface px-4 py-3">
                  <span className="min-w-0 flex-1">
                    Force 1× and toggle b-roll can be bound in the browser shortcut settings.
                  </span>
                  <InfoTip help={SETTINGS_HELP.extraShortcuts} align="end" />
                </li>
              </ul>
            </section>
          )}

          {section === 'privacy' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Privacy</h1>
              <p className="max-w-2xl text-ds-muted">
                Nothing leaves this browser. Captions are fetched from YouTube as the player
                already does, parsed locally, and cached as compact word timings on this
                device only. There is no account, no analytics, and no remote API.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-lg border border-ds-border px-4 py-2 text-sm"
                  onClick={() => {
                    void clearTranscriptCache().then(() =>
                      setCacheUsage({ bytes: 0, videos: 0 }),
                    );
                  }}
                >
                  Clear caption cache
                </button>
                <span className="text-sm text-ds-muted">
                  {cacheUsage == null
                    ? 'Measuring…'
                    : `Using ${formatCacheBytes(cacheUsage.bytes)}${
                        cacheUsage.videos === 0
                          ? ''
                          : ` · ${cacheUsage.videos} video${cacheUsage.videos === 1 ? '' : 's'}`
                      }`}
                </span>
                <InfoTip help={SETTINGS_HELP.captionCache} />
              </div>
              <Row
                title="Delete cache after a week"
                hint="Remove caption timings for videos you have not watched in the last 7 days."
                help={SETTINGS_HELP.expireCaptionCache}
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.expireCaptionCacheAfterWeek}
                    onChange={(expireCaptionCacheAfterWeek) => {
                      void update({ expireCaptionCacheAfterWeek });
                      if (expireCaptionCacheAfterWeek) {
                        void pruneExpiredTranscriptCache(true);
                      }
                    }}
                  />
                </div>
              </Row>
              <div className="mt-8">
                <SupportLink />
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
