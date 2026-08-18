import { useMemo, useState } from 'react';
import { Knob } from '../../ui/components/Knob';
import { SliderField } from '../../ui/components/SliderField';
import { Toggle } from '../../ui/components/Toggle';
import { useSettings } from '../../ui/hooks/useSettings';
import { resetSettings } from '../../lib/settings/storage';
import { clearTranscriptCache } from '../../lib/youtube/cache';
import { resolveDynamics } from '../../lib/pacing/feel';

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
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-ds-border py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl">
        <div className="text-sm font-medium">{title}</div>
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
  const dynamics = useMemo(() => resolveDynamics(settings), [settings]);

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
        </aside>

        <main className="min-w-0 flex-1 px-5 py-8 md:px-10">
          <div className="mb-6 flex gap-2 overflow-auto md:hidden">
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

          {section === 'general' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">General</h1>
              <p className="mb-6 max-w-2xl text-ds-muted">
                DynamicSpeed reads YouTube captions on your device and sets playback speed so
                speech lands near your target words-per-minute.
              </p>
              <Row title="Enable" hint="Master switch for automatic speed control.">
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
              >
                <SliderField
                  label=""
                  min={80}
                  max={400}
                  value={settings.targetWpm}
                  unit=" WPM"
                  onChange={(targetWpm) => void update({ targetWpm })}
                />
              </Row>
              <Row title="Minimum speed" hint="Never go slower than this, even for very fast talkers.">
                <SliderField
                  label=""
                  min={0.25}
                  max={Math.max(0.5, settings.maxSpeed - 0.05)}
                  step={0.05}
                  decimals={2}
                  value={settings.minSpeed}
                  unit="×"
                  onChange={(minSpeed) => void update({ minSpeed })}
                />
              </Row>
              <Row title="Maximum speed" hint="Cap for slow speech and optional b-roll skipping.">
                <SliderField
                  label=""
                  min={Math.min(4.9, settings.minSpeed + 0.05)}
                  max={5}
                  step={0.05}
                  decimals={2}
                  value={settings.maxSpeed}
                  unit="×"
                  onChange={(maxSpeed) => void update({ maxSpeed })}
                />
              </Row>
              <div className="grid items-center gap-6 py-6 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="text-sm font-medium">Responsiveness</div>
                  <div className="max-w-xl text-sm text-ds-muted">
                    One control for how quickly playback may change. Low is molasses-smooth.
                    High reacts to incoming speech sooner. Unlocking custom engine sliders
                    turns this knob into a display-only Custom mode.
                  </div>
                </div>
                <Knob
                  value={settings.responsiveness}
                  disabled={settings.customDynamicsUnlocked}
                  onChange={(responsiveness) => void update({ responsiveness })}
                />
              </div>
              <Row title="Caption language" hint="Preferred caption track, for example en or en-US.">
                <input
                  className="w-full rounded-lg border border-ds-border bg-ds-surface px-3 py-2"
                  value={settings.captionLanguage}
                  onChange={(event) => void update({ captionLanguage: event.target.value })}
                />
              </Row>
              <div className="mt-6 flex flex-wrap gap-3">
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
                      try {
                        const parsed = JSON.parse(await file.text());
                        await update(parsed);
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
                unless you want to override the responsiveness knob.
              </p>
              <Row
                title="Syllable-weighted WPM"
                hint="Count syllables instead of raw words so dense speech is not treated as slow."
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
                hint="Extra weight on hard words (not in the Dale-Chall easy list, 3+ syllables). 1.00 is off. 1.15 means those words count 15% more."
              >
                <SliderField
                  label=""
                  min={1}
                  max={1.5}
                  step={0.01}
                  decimals={2}
                  value={settings.jargonCompensation}
                  onChange={(jargonCompensation) => void update({ jargonCompensation })}
                />
              </Row>
              <Row
                title="Unlock custom dynamics"
                hint="Replace the feel knob with explicit Gaussian, median, and slew values."
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
              >
                <SliderField
                  label=""
                  min={2}
                  max={30}
                  step={0.5}
                  decimals={1}
                  value={settings.gaussianSigma}
                  unit="s"
                  onChange={(gaussianSigma) => void update({ gaussianSigma })}
                />
              </Row>
              <Row
                title="Median window"
                hint={`Strips caption jitter. Current feel pack: ${dynamics.medianWindowSec.toFixed(1)}s.`}
              >
                <SliderField
                  label=""
                  min={1}
                  max={15}
                  step={0.5}
                  decimals={1}
                  value={settings.medianWindowSec}
                  unit="s"
                  onChange={(medianWindowSec) => void update({ medianWindowSec })}
                />
              </Row>
              <Row
                title="Slew limit"
                hint={`Max speed change per second during seeks and setting changes. Current feel pack: ${dynamics.slewRateLimit.toFixed(2)}×/s.`}
              >
                <SliderField
                  label=""
                  min={0.05}
                  max={2}
                  step={0.05}
                  decimals={2}
                  value={settings.slewRateLimit}
                  unit="×/s"
                  onChange={(slewRateLimit) => void update({ slewRateLimit })}
                />
              </Row>
              <Row title="Minimum caption chunk" hint="Merge tiny caption fragments below this duration.">
                <SliderField
                  label=""
                  min={0.1}
                  max={1}
                  step={0.05}
                  decimals={2}
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
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.bRollAcceleration}
                    onChange={(bRollAcceleration) => void update({ bRollAcceleration })}
                  />
                </div>
              </Row>
              <Row title="Long pause" hint="Gap length that counts as a pause rather than slow speech.">
                <SliderField
                  label=""
                  min={0.5}
                  max={5}
                  step={0.1}
                  decimals={1}
                  value={settings.longPauseSec}
                  unit="s"
                  onChange={(longPauseSec) => void update({ longPauseSec })}
                />
              </Row>
              <Row
                title="Treat [Music] as b-roll"
                hint="Caption tags like [Music] or [Applause] are never counted as spoken WPM."
              >
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.treatMusicAsBRoll}
                    onChange={(treatMusicAsBRoll) => void update({ treatMusicAsBRoll })}
                  />
                </div>
              </Row>
            </section>
          )}

          {section === 'channels' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Channel rules</h1>
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
                        <span className="text-sm">Disabled</span>
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
                  <h2 className="mb-2 text-lg font-medium">Disabled videos</h2>
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
              <Row title="Ignore ads" hint="Do not drive playback rate while a YouTube ad is showing.">
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.ignoreAds}
                    onChange={(ignoreAds) => void update({ ignoreAds })}
                  />
                </div>
              </Row>
              <Row title="Ignore music videos" hint="Leave official Music-category videos at YouTube’s speed.">
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.ignoreMusicVideos}
                    onChange={(ignoreMusicVideos) => void update({ ignoreMusicVideos })}
                  />
                </div>
              </Row>
              <Row title="Enable on Shorts" hint="Apply DynamicSpeed on YouTube Shorts.">
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
              >
                <SliderField
                  label=""
                  min={0}
                  max={60}
                  value={settings.manualOverrideTimeoutSec}
                  unit="s"
                  onChange={(manualOverrideTimeoutSec) =>
                    void update({ manualOverrideTimeoutSec })
                  }
                />
              </Row>
              <Row title="Restore 1× when disabled" hint="Reset playback speed when DynamicSpeed is turned off.">
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
              <Row title="Player chip" hint="Show the current speed to the left of YouTube’s settings gear.">
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.showPlayerChip}
                    onChange={(showPlayerChip) => void update({ showPlayerChip })}
                  />
                </div>
              </Row>
              <Row title="Chip decimals" hint="1.5× vs 1.47×.">
                <SliderField
                  label=""
                  min={1}
                  max={2}
                  step={1}
                  value={settings.chipDecimalPlaces}
                  onChange={(chipDecimalPlaces) =>
                    void update({ chipDecimalPlaces: chipDecimalPlaces as 1 | 2 })
                  }
                />
              </Row>
              <Row title="WPM in tooltip" hint="Show estimated spoken WPM when hovering the chip.">
                <div className="flex justify-end">
                  <Toggle
                    checked={settings.showWpmInTooltip}
                    onChange={(showWpmInTooltip) => void update({ showWpmInTooltip })}
                  />
                </div>
              </Row>
            </section>
          )}

          {section === 'shortcuts' && (
            <section>
              <h1 className="mb-2 text-3xl font-semibold">Shortcuts</h1>
              <p className="mb-6 text-ds-muted">
                Chrome and Firefox let you change these in the browser’s extension shortcut
                page. Defaults:
              </p>
              <ul className="space-y-3 text-sm">
                <li className="rounded-xl bg-ds-surface px-4 py-3">
                  <span className="font-mono text-ds-accent">Alt+Shift+D</span> — toggle
                </li>
                <li className="rounded-xl bg-ds-surface px-4 py-3">
                  <span className="font-mono text-ds-accent">Alt+Shift+W</span> — target WPM +10
                </li>
                <li className="rounded-xl bg-ds-surface px-4 py-3">
                  <span className="font-mono text-ds-accent">Alt+Shift+S</span> — target WPM −10
                </li>
                <li className="rounded-xl bg-ds-surface px-4 py-3">
                  Force 1× and toggle b-roll can be bound in the browser shortcut settings.
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
              <button
                className="mt-6 rounded-lg border border-ds-border px-4 py-2 text-sm"
                onClick={() => void clearTranscriptCache()}
              >
                Clear caption cache
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
