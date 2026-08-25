# DynamicSpeed for YouTube

Local-first Chrome and Firefox extension that matches YouTube playback speed to a target words-per-minute.

License: [MIT](./LICENSE). Privacy: [PRIVACY.md](./PRIVACY.md).

## Build (Firefox / AMO source review)

These steps reproduce the Firefox add-on from this source tree. Reviewers should use this section.

### Environment

- **OS:** Linux, macOS, or Windows. CI and release builds use Ubuntu + Node 22.
- **Node.js:** 22.x (LTS). `package.json` `engines.node` is `>=22`.
- **npm:** 10.x (ships with Node 22). Do not use Yarn or pnpm for a bit-for-bit lockfile install.
- **Network:** `npm ci` needs access to the npm registry. The build itself is offline after that.

Install Node from [https://nodejs.org](https://nodejs.org) (22.x LTS) or a version manager (`nvm install 22`). Confirm:

```bash
node -v   # v22.x.x
npm -v    # 10.x.x
```

### Commands

From the repository root (the directory that contains `package.json`):

```bash
npm ci
npm run build:firefox
```

`npm ci` installs the exact versions in `package-lock.json`, then runs `wxt prepare` (`postinstall`).

`npm run build:firefox` runs `wxt build -b firefox --mv3`. That compiles TypeScript/React, bundles with Vite, and writes an unpacked Manifest V3 extension.

### Output

Unpacked Firefox add-on:

```text
dist/firefox-mv3/
```

That directory is the add-on. Compare it to the uploaded `.xpi` / `.zip`. `manifest.json` is at `dist/firefox-mv3/manifest.json`.

To also produce the store zip and this sources zip:

```bash
npx wxt zip -b firefox --mv3
```

### What the build does

Source in `src/` is TypeScript and React. It is **not** pre-minified. At build time:

1. **WXT** generates the Manifest V3 layout.
2. **Vite** (esbuild) bundles and minifies extension pages and content scripts.
3. **Tailwind CSS** is compiled into CSS for the popup and options pages.
4. `scripts/patch-react-innerhtml.ts` rewrites React DOM `innerHTML` assignments so addons-linter does not flag them. The extension does not use `dangerouslySetInnerHTML`.

No remote code is fetched during the build except npm packages via `npm ci`.

### Other build scripts

| Command | Result |
| --- | --- |
| `npm run build:firefox` | Firefox unpacked build (`dist/firefox-mv3`) |
| `npm run build:chrome` | Chrome unpacked build (`dist/chrome-mv3`) |
| `npm run build` | Both browsers, then checks the manifests |

## Develop

```bash
npm install
npm run dev          # Chrome MV3
npm run dev:firefox  # Firefox MV3
```

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
