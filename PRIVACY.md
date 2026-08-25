# Privacy Policy — DynamicSpeed for YouTube

**Last updated:** 25 August 2026

DynamicSpeed for YouTube (“DynamicSpeed”) does not collect, transmit, sell, or share personal data. There is no DynamicSpeed account, analytics, advertising, or backend API.

This policy describes what stays on your device and what the extension reads on YouTube in order to match playback speed to a target words-per-minute.

## Summary

- Nothing is uploaded to us.
- Settings and a small caption-timing cache stay in this browser.
- Captions are requested from YouTube the same way the player already does, then parsed locally.
- You can clear the cache and export or reset settings from the extension options.

## Data that stays on your device

Stored only with the browser’s extension storage (`chrome.storage` / Firefox `storage`):

- Extension settings (for example target WPM, speed limits, keyboard-adjacent preferences, channel rules, and disabled video IDs).
- A local cache of parsed YouTube caption timings for recently watched videos, so the same track does not need to be downloaded again.

This data does not leave your device through DynamicSpeed. Clearing site data for the extension, using **Clear caption cache**, or removing the extension deletes it according to the browser’s usual rules.

Cached caption timings may be removed automatically for videos you have not watched in the last 7 days if that option is enabled (it is on by default). The cache is also capped in size on the device.

## What the extension accesses on YouTube

On YouTube pages you open (including `youtube.com`, `m.youtube.com`, `music.youtube.com`, and `youtube-nocookie.com`), DynamicSpeed may:

- Read caption / transcript data for the current video, used only to estimate speaking rate and drive playback speed.
- Read enough watch-page metadata to apply channel and video rules (for example channel id and whether YouTube labels the video as Music).
- Set the playback rate of the YouTube player.
- Briefly turn YouTube captions on so timings can be downloaded, then restore your previous caption setting.

DynamicSpeed does not run on unrelated websites.

## Permissions

- **storage** — save settings and the local caption cache described above.
- **Host access to YouTube** — read captions and set playback rate on YouTube pages you visit. The extension does not use this to scrape or export your viewing history to a server.

## What we do not do

- No accounts or sign-in.
- No analytics, crash telemetry, or advertising identifiers.
- No sale or sharing of data with third parties.
- No remote code loaded from our servers.
- Optional links (for example reporting a bug on GitHub, or “Buy me a coffee”) are opened only if you click them, in your own browser session.

## Your choices

In the extension options (Privacy section) you can:

- Clear the caption cache.
- Turn automatic cache expiry on or off.
- Export or import settings as a local JSON file (nothing is uploaded).
- Restore all settings to defaults.

You can also disable the extension, or remove it, from the browser’s extension manager.

## Children

DynamicSpeed is not directed at children and does not knowingly collect personal information from anyone, including children.

## Changes

If this policy changes in a way that affects how data is handled, we will update this file and the “Last updated” date.

## Contact

Questions or privacy concerns: open an issue at [https://github.com/damjanmiklos/dynamicspeed-for-youtube/issues](https://github.com/damjanmiklos/dynamicspeed-for-youtube/issues).

Security issues: see [SECURITY.md](./SECURITY.md).
