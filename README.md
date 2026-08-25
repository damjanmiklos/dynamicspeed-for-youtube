# DynamicSpeed for YouTube

Local-first Chrome and Firefox extension that matches YouTube playback speed to a target words-per-minute.

## Develop

```bash
npm install
npm run dev          # Chrome MV3
npm run dev:firefox  # Firefox MV3
```

## Build both browsers

```bash
npm run build
```

Outputs:

- `dist/chrome-mv3`
- `dist/firefox-mv3`

Load unpacked in Chrome from `dist/chrome-mv3`. In Firefox (`about:debugging`) load `dist/firefox-mv3/manifest.json`.

## Test

```bash
npm test            # unit + DOM (Vitest)
npm run test:e2e    # headed Chromium with the unpacked Chrome build
```

The e2e suite loads `dist/chrome-mv3` in headed Playwright Chromium, opens the options and popup pages, then a live YouTube watch page. It fails on `console` warnings/errors and uncaught exceptions that come from the extension (service worker, isolated content script, or MAIN-world player script). YouTube’s own page noise is ignored.

YouTube often refuses playback in a fresh automated Chromium profile. To verify caption acquire against your real Chrome session:

1. Fully quit Chrome (including background processes).
2. Start it with remote debugging:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

3. Confirm DynamicSpeed is loaded, then:

```powershell
$env:E2E_CDP = 'http://127.0.0.1:9222'
npx playwright test
```
