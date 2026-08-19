export type SettingHelp = {
  label: string;
  body: readonly string[];
};

export const SETTINGS_HELP = {
  enabled: {
    label: 'About Enable',
    body: [
      'Master switch for DynamicSpeed. When this is on, the extension reads captions on this device and continuously sets YouTube’s playback rate so spoken words land near your Target WPM.',
      'When it is off, DynamicSpeed does not fetch, capture, parse, or cache captions, and it does not drive playback rate. If Restore 1× when disabled is also on, playback is put back to 1×. The toolbar popup, shortcuts, and player chip still work so you can turn it back on.',
      'You can also flip this from the toolbar popup, by clicking the player chip, or with Alt+Shift+D.',
    ],
  },
  targetWpm: {
    label: 'About Target WPM',
    body: [
      'This is the listening pace you want, in words per minute. DynamicSpeed measures how fast the speaker is talking from caption timings, then sets playback rate ≈ target WPM ÷ spoken WPM (then clamped to Min/Max speed).',
      'Syllable weighting, jargon compensation, and spoken-time compensation change how pace is estimated, then a constant scale for those slider values is divided back out so this number still means ordinary WPM — not an inflated internal score. Everyday conversation is often about 150–180 WPM; lectures are slower; auction-style or hyped speech is faster.',
      'The range is 80–800. Changes apply on the current video immediately, with a short ease-in so the jump is not a hard snap.',
    ],
  },
  minSpeed: {
    label: 'About Minimum speed',
    body: [
      'A floor on YouTube playback rate. Even if the speaker is much faster than your Target WPM, the video will not go slower than this.',
      'Use a higher floor if very slow video feels unnatural (lip-sync, music beds, or motion look wrong). Use a lower floor if you want aggressive slowing for rapid speakers.',
      'Must stay below Maximum speed. This clamp is applied after WPM is mapped to a rate, so it also limits how far b-roll acceleration and fallback can go downward.',
    ],
  },
  maxSpeed: {
    label: 'About Maximum speed',
    body: [
      'A ceiling on YouTube playback rate. Slow talkers, sparse captions, and b-roll stretches cannot be sped up beyond this.',
      'Higher caps save more time on slow videos but can make motion and pitch-preserved audio feel hurried. Lower caps keep playback closer to “normal YouTube.”',
      'Must stay above Minimum speed. If B-roll acceleration is on, long pauses head toward this cap rather than interpolating between the speech on either side.',
    ],
  },
  fallbackSpeed: {
    label: 'About Default speed',
    body: [
      'The rate DynamicSpeed uses when it is enabled but does not yet have a usable caption timeline — at the start of a video, and whenever captions cannot be found.',
      'Playback eases to this value over a fraction of a second instead of jumping. Once captions arrive, speed then eases from this default toward the calculated curve over about two seconds, so the first words are not a sudden snap.',
      'Set this to 1× if you prefer ordinary YouTube until captions load. Set it nearer your usual listening speed if you would rather not wait at 1×.',
    ],
  },
  responsiveness: {
    label: 'About Responsiveness',
    body: [
      'One “feel” control that sets how quickly speed is allowed to change. It does not change Target WPM; it changes how much the speed curve is smoothed and how fast playback rate may slew toward that curve.',
      'Low is molasses-smooth: a wide Gaussian window (~18 s), a wide median window (~10 s), and a slow slew cap (~0.12× per second). High reacts sooner: tighter windows (~5 s and ~3 s) and a faster slew cap (~0.9× per second).',
      'If you unlock custom dynamics, this slider becomes display-only. The Gaussian, median, and slew sliders on the Pacing engine page then take over.',
    ],
  },
  temporarilyEnableCaptions: {
    label: 'About temporarily turning on captions',
    body: [
      'When this is on, DynamicSpeed may briefly turn on YouTube’s own captions so the player downloads timed caption data with a valid token. That download is copied in the background, then captions are put back to whatever you had before — on or off.',
      'If you had captions off, the on-screen text is hidden during the grab so it is only a short flash, if anything. A leftover selected caption language is not treated as “you wanted captions on.” If you already had captions on, they stay on.',
      'Turn this off to never touch YouTube’s CC button. Background-only loading is less reliable: YouTube often will not send caption timings unless captions are turned on, so the transcript (and therefore speed control) may fail to load.',
    ],
  },
  captionLanguage: {
    label: 'About Caption language',
    body: [
      'Default is Spoken language (this video): DynamicSpeed reads YouTube’s auto-captions / default audio track and uses that language for this video only. A German talk then uses German captions even if you also watch English videos.',
      'Pinning a language (for example English) always prefers that track when it exists. That is the wrong choice if you are bilingual, because English auto-captions on a German video will not match the speech you hear.',
      'If the spoken language has no captions, another available track is used. Changing this reloads captions for the current video. Auto-generated vs manual still follows Prefer manual captions.',
    ],
  },
  backup: {
    label: 'About backup and restore',
    body: [
      'Restore defaults puts every setting back to the shipping values, including channel overrides and disabled videos.',
      'Export JSON downloads your current settings as a text file you can keep or move to another browser profile. Nothing is uploaded.',
      'Import JSON replaces settings with a previously exported file. The file is parsed locally, dangerous keys are stripped, and invalid values fall back to defaults. Very large files are rejected.',
    ],
  },
  syllableWeighting: {
    label: 'About syllable-weighted WPM',
    body: [
      'When this is on, spoken pace is estimated from syllables rather than treating every caption word as equal. A word like “internationalization” counts more than “cat,” so dense speech is recognized as faster talking.',
      'That usually slows the video a bit on technical or formal speech and speeds it less aggressively on very short, simple words. Syllables are counted locally (no network). A constant scale (about 4.5% on typical English captions, from mean syllables per word ÷ 1.5) is then divided out so Target WPM still reads as ordinary words per minute.',
      'Turn it off if you want a simpler words-per-minute model that matches how many caption tokens appear per second.',
    ],
  },
  jargonCompensation: {
    label: 'About jargon compensation',
    body: [
      'Extra weight on hard words: three or more syllables and not in Google’s 10,000 most common English words. Those tokens are multiplied by this factor when WPM is estimated.',
      '1.00 is off. 1.15 means jargon counts 15% more, so lectures full of long technical terms are treated as slightly faster speech and the video slows a little more. A constant scale for this slider is then divided out so Target WPM stays in ordinary units.',
      'The list is English-only. If the caption track is not English, jargon compensation does nothing and every word is treated as ordinary.',
    ],
  },
  customDynamics: {
    label: 'About unlock custom dynamics',
    body: [
      'When this is off, Gaussian window, median window, and slew limit are driven by the Feel / Responsiveness slider. The sliders below still show stored numbers, but the live “feel pack” values in their hints are what actually run.',
      'Turn this on to edit those three engine values by hand. The Feel slider then stops changing the curve and shows Custom.',
      'Use this if you want, for example, very heavy smoothing with a fast slew, which the single slider cannot do because it moves all three together.',
    ],
  },
  gaussianSigma: {
    label: 'About Gaussian window',
    body: [
      'How widely spoken WPM is smoothed over time before it becomes a speed curve, in seconds (σ). Larger values blur short bursts of fast or slow speech into their neighbors, so playback rate changes more gradually.',
      'On ordinary videos this is a zero-phase Gaussian (look-ahead, so it does not lag behind the transcript). On live streams a causal smoother is used instead, because the future is not available.',
      'This slider only applies while custom dynamics are unlocked. Otherwise Responsiveness sets the window, and the hint shows the value currently in effect.',
    ],
  },
  medianWindow: {
    label: 'About median window',
    body: [
      'A moving-median filter, in seconds, applied to caption-derived WPM before Gaussian smoothing. It throws out brief spikes from messy auto-captions, overlapping speakers, or a single mistimed word.',
      'A wider window is calmer but can hide real, short changes in pace. A narrower window follows the transcript more closely and may make speed twitch if captions are noisy.',
      'This slider only applies while custom dynamics are unlocked. Otherwise Responsiveness sets the window, and the hint shows the live feel-pack value.',
    ],
  },
  slewLimit: {
    label: 'About slew limit',
    body: [
      'Maximum change in playback rate per second of real time while DynamicSpeed is automating speed. B-roll, settings changes, and a jump in the talking-rate curve all have to climb or drop through this cap. Skipping in the video still snaps to the calculated rate immediately.',
      'At 0.51×/s, a move from 1.2× to 3× takes about three and a half seconds. The speed curve can still target max speed as soon as a pause starts; this limit is how fast the player is allowed to get there.',
      'This slider only applies while custom dynamics are unlocked. Low values feel glued; high values reach the new rate sooner.',
    ],
  },
  spokenDuty: {
    label: 'About spoken-time compensation',
    body: [
      'Caption timings often include short gaps after each word, especially in lists, reaction commentary, and hunt-and-peck speech. Those gaps make spoken WPM look too low, so playback speeds up and the actual words fly by.',
      'This control estimates what fraction of caption-covered time is really voiced, then raises WPM partway toward that articulation rate: adjusted WPM = measured WPM × ((1 − strength) + strength / spoken fraction). 0% is off (old behavior). 100% fully uses voiced time only. The default 40% is a partial correction.',
      'A constant scale for the current strength (not for the current video) is then divided out so the toolbar and Target WPM stay in ordinary words-per-minute. Relative differences remain: list-like speech with short gaps still reads faster than packed speech. Gaps longer than Long pause are excluded here and stay under Pauses & b-roll.',
    ],
  },
  minChunk: {
    label: 'About minimum caption chunk',
    body: [
      'Caption words shorter than this are merged with their neighbors before WPM is computed. Auto-captions sometimes emit crumbs only tens of milliseconds long that would look like impossibly fast speech.',
      'The default is 0.10s, short enough that typical spoken words (about 0.20–0.25s) stay separate so pace changes are not hidden. 0.3s is long enough to glue two or three ordinary words into one sample. Raise it if a track is very choppy; the slider floor is 0.10s.',
      'This does not change what you see on screen as subtitles; it only changes the timeline DynamicSpeed uses internally.',
    ],
  },
  bRoll: {
    label: 'About b-roll acceleration',
    body: [
      'When this is off, a long gap in speech is not treated as “the speaker is slow.” Speed eases between the speech on either side of the gap (PCHIP), so a pause does not slam the rate around.',
      'When this is on, gaps longer than Long pause — and optional [Music]/[Applause]-style tags — target your Maximum speed so visual-only stretches and long silences skip faster. The slew limit still caps how quickly playback climbs to that max.',
      'Before speech resumes, speed eases down from that max so the first words are not still at the cap. How early that ease starts follows the Feel slew limit (faster Feel → later, shorter ease).',
      'Leave it off for interviews and talks where silence is part of the delivery. Turn it on for video essays and explainers that pad with b-roll.',
    ],
  },
  longPause: {
    label: 'About long pause',
    body: [
      'How long a gap between caption words must be before it counts as a pause (or b-roll), rather than slow talking.',
      'Shorter values treat more of the video as “not speech,” so b-roll acceleration (if on) kicks in sooner and WPM is computed on tighter speech islands. Longer values keep modest hesitations inside the speaking curve.',
      'Typical breaths and commas are well below this. Scene changes and “hold on this shot” pads are usually above it.',
    ],
  },
  treatMusic: {
    label: 'About treating [Music] as b-roll',
    body: [
      'YouTube captions often insert tags such as [Music], [Applause], or [Laughter]. Those are not spoken words, so they are never counted toward spoken WPM.',
      'When this is on, a tagged stretch is also treated like a pause for pacing: with b-roll acceleration on, it can speed up; with b-roll off, it is still excluded from the talking-rate estimate.',
      'Turn it off only if you found a caption track where those tags are misused as real dialogue.',
    ],
  },
  channelDisabled: {
    label: 'About disabling a channel',
    body: [
      'When a channel is disabled, DynamicSpeed will not automate speed on any of that channel’s videos. Other channels are unchanged.',
      'Add a channel from the toolbar popup while you are watching it (Disable this channel). Removing the override here, or turning Disabled off, restores automation.',
      'This is the right tool for music channels, speedrunners, or any creator whose pacing you never want rewritten.',
    ],
  },
  disabledVideos: {
    label: 'About disabled videos',
    body: [
      'Individual videos you turned off from the toolbar popup. DynamicSpeed skips automation on these IDs only.',
      'Enable puts that video back under normal rules (including any channel override). This list is stored in the extension; it is not sent anywhere.',
    ],
  },
  ignoreAds: {
    label: 'About ignore ads',
    body: [
      'When this is on, DynamicSpeed does not change playback rate while a YouTube ad is showing. The ad keeps whatever speed YouTube (or another extension) set.',
      'When the ad ends, automation resumes on the main video. Turning this off can make ads play at your content speed, which is often jarring and can fight YouTube’s ad player.',
      'Recommended: leave this on.',
    ],
  },
  ignoreMusic: {
    label: 'About ignore music videos',
    body: [
      'If YouTube marks the video’s category as Music, DynamicSpeed leaves playback rate alone. Official music videos are a poor fit for speech-WPM matching.',
      'This uses the player’s category, not “the video happens to contain music.” Talk videos with a music bed still automate unless you disable that channel or video.',
      'Turn this off if you want Target WPM applied to music videos as well (usually a bad idea).',
    ],
  },
  enableShorts: {
    label: 'About Enable on Shorts',
    body: [
      'When this is on, DynamicSpeed also runs on youtube.com/shorts. Captions on Shorts can be sparse or missing; if they are missing, Default speed is used.',
      'Turn it off if Shorts feel over-processed or if another extension already handles short-form speed. Regular watch-page videos are not affected.',
    ],
  },
  preferManual: {
    label: 'About prefer manual captions',
    body: [
      'When this is on, creator-uploaded caption tracks are preferred over auto-generated (ASR) tracks in the same language. The default is off, because auto-captions usually have tighter word timings for WPM.',
      'Manual captions often have cleaner wording. Auto-captions often have tighter word-level timings, which can make WPM estimation more faithful to how the person actually spoke.',
      'If the preferred kind is missing, the other kind is still used. Pair this with Caption language to pick the right track.',
    ],
  },
  manualOverride: {
    label: 'About manual override timeout',
    body: [
      'If you change speed in YouTube’s own menu (or anything else that looks like a one-off external rate change), DynamicSpeed steps aside for this many seconds, then takes over again.',
      'Set it higher if you often nudge speed by hand and hate being overridden immediately. Set it lower — even 0 — if you want the extension to reclaim control almost at once.',
      'A different extension that keeps forcing a fixed speed is not treated as a polite override; the popup will warn about that separately.',
    ],
  },
  restore1x: {
    label: 'About restore 1× when disabled',
    body: [
      'When DynamicSpeed turns off — master switch, this video, this channel, Shorts/music blocks — playback is set back to 1× so YouTube does not stay stuck at the last automated rate.',
      'Turn this off if you want the last speed to remain when you pause automation (for example you disabled the channel mid-video and like where it landed).',
      'This does not run during ads if Ignore ads is on, because we are not driving rate in that moment.',
    ],
  },
  playerChip: {
    label: 'About the player chip',
    body: [
      'Shows the current playback rate as a small control immediately to the left of YouTube’s settings gear on the player.',
      'The chip looks dimmed when automation is paused (ads, manual override, missing captions, or a disable rule). Clicking it toggles Enable.',
      'If another extension is forcing a fixed speed, the chip turns red as a second warning besides the popup banner.',
    ],
  },
  chipDecimals: {
    label: 'About chip decimals',
    body: [
      'How many digits the player chip uses: 1.5× versus 1.47×. This is display only and does not change the actual playback rate.',
      'Two decimals make small curve changes visible. One decimal is calmer and closer to YouTube’s own speed menu.',
    ],
  },
  wpmTooltip: {
    label: 'About WPM in tooltip',
    body: [
      'When this is on, hovering the player chip shows target WPM, estimated spoken WPM from captions, caption status, and why automation might be paused. If syllable weighting, jargon compensation, or spoken-time compensation is on, that estimate is labeled adjusted WPM.',
      'Turn it off for a short “DynamicSpeed” tooltip only. The chip still shows the playback rate either way.',
    ],
  },
  shortcuts: {
    label: 'About shortcuts',
    body: [
      'These commands are registered with the browser. Chrome and Firefox both let you change or disable them on the browser’s own extension-shortcut page — the extension cannot override a key the browser has rebound.',
      'Shortcuts work while a YouTube tab can receive the command. They update settings live, so the current video reacts without reloading.',
    ],
  },
  toggleShortcut: {
    label: 'About the toggle shortcut',
    body: [
      'Alt+Shift+D flips the Enable switch. Same effect as the popup toggle or clicking the player chip.',
    ],
  },
  wpmUpShortcut: {
    label: 'About WPM up',
    body: [
      'Alt+Shift+W raises Target WPM by 10, clamped to the allowed range (80–800). The speed curve rebuilds immediately on the current video.',
    ],
  },
  wpmDownShortcut: {
    label: 'About WPM down',
    body: [
      'Alt+Shift+S lowers Target WPM by 10, clamped to the allowed range. Useful when a video suddenly feels too fast without opening the popup.',
    ],
  },
  extraShortcuts: {
    label: 'About extra shortcuts',
    body: [
      'Force 1× pins playback at 1× until you toggle Enable (or otherwise rebuild automation). Toggle b-roll flips B-roll acceleration without opening this page.',
      'They have no default keys so they do not steal common shortcuts. Bind them under chrome://extensions/shortcuts or about:addons on Firefox.',
    ],
  },
  captionCache: {
    label: 'About the caption cache',
    body: [
      'Parsed caption timings are stored only in this browser so returning to a video is faster and does not need to re-download the same track.',
      'Nothing in the cache is uploaded. Clearing it does not change settings; it only drops stored timelines. They will be fetched again the next time you watch those videos.',
      'Use this if a video’s speed curve looks stuck on an old caption track after you changed language or YouTube replaced captions.',
    ],
  },
  expireCaptionCache: {
    label: 'About deleting old cache',
    body: [
      'When this is on, cached caption timings for a video are deleted if you have not watched that video in the last 7 days. Opening the video again resets the timer, and the track is fetched again the next time you return after it expires.',
      'Turn this off if you want cached videos to stay until the cache fills (15 videos or 4 MB) or you clear it yourself. Nothing in the cache is uploaded either way.',
    ],
  },
} as const satisfies Record<string, SettingHelp>;
