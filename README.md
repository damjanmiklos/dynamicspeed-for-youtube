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
npm test
```
