import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const CHARCOAL = [27, 28, 31];
const ICON_PATH =
  'M8.96 64 L19.2 64 L30.72 43.52 L43.52 97.28 L58.88 30.72 L74.24 102.4 L74.24 25.6 L115.84 64 L74.24 102.4';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) {
    throw new Error('Not a PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG ${bitDepth}/${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src];
      src += 1;
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) val = (x + paeth(a, b, c)) & 255;
      else if (filter !== 0) throw new Error(`Bad PNG filter ${filter}`);
      row[i] = val;
    }
    prev = row;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (bpp === 4) {
        row.copy(rgba, o, x * 4, x * 4 + 4);
      } else {
        rgba[o] = row[x * 3];
        rgba[o + 1] = row[x * 3 + 1];
        rgba[o + 2] = row[x * 3 + 2];
        rgba[o + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

function flattenToRgb(rgba, width, height) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const a = rgba[i * 4 + 3] / 255;
    rgb[i * 3] = Math.round(rgba[i * 4] * a + CHARCOAL[0] * (1 - a));
    rgb[i * 3 + 1] = Math.round(rgba[i * 4 + 1] * a + CHARCOAL[1] * (1 - a));
    rgb[i * 3 + 2] = Math.round(rgba[i * 4 + 2] * a + CHARCOAL[2] * (1 - a));
  }
  return rgb;
}

function writePngRgb(width, height, rgb) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function markSvg(size, strokeWidth) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" fill="none" aria-hidden="true">
    <path d="${ICON_PATH}" stroke="#ff6a3d" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function smallTileHtml(iconDataUrl) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 440px; height: 280px; overflow: hidden; }
      body {
        background: rgb(${CHARCOAL.join(' ')});
        display: flex;
        align-items: center;
        padding: 0 28px 0 32px;
        font-family: "Segoe UI", "Segoe UI Variable Display", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
      }
      img {
        width: 128px;
        height: 128px;
        flex: none;
        display: block;
      }
      .copy { margin-left: 22px; min-width: 0; max-width: 250px; }
      h1 {
        color: #ffffff;
        font-size: 26px;
        font-weight: 800;
        line-height: 1.12;
        letter-spacing: -0.04em;
      }
      p {
        margin-top: 12px;
        color: #c9cad0;
        font-size: 14px;
        font-weight: 650;
        line-height: 1.32;
        letter-spacing: -0.01em;
      }
    </style>
  </head>
  <body>
    <img alt="" width="128" height="128" src="${iconDataUrl}" />
    <div class="copy">
      <h1>DynamicSpeed<br>for YouTube</h1>
      <p>Auto-adjusts YouTube speed based on talking pace.</p>
    </div>
  </body>
</html>`;
}

function marqueeHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 1400px; height: 560px; overflow: hidden; }
      body {
        position: relative;
        background: rgb(${CHARCOAL.join(' ')});
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 72px 88px 72px 96px;
        font-family: "Segoe UI", "Segoe UI Variable Display", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: geometricPrecision;
        color: #fff;
      }
      body::before {
        content: "";
        position: absolute;
        right: 40px;
        top: -80px;
        width: 720px;
        height: 720px;
        background: radial-gradient(circle, rgba(255,106,61,0.14), transparent 64%);
        pointer-events: none;
      }
      .brand {
        position: relative;
        display: flex;
        align-items: center;
        gap: 32px;
        width: 620px;
        flex: none;
        z-index: 1;
      }
      .brand svg { flex: none; display: block; }
      .copy { min-width: 0; }
      h1 {
        font-size: 54px;
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: -0.045em;
      }
      .tagline {
        margin-top: 18px;
        max-width: 420px;
        color: #c9cad0;
        font-size: 22px;
        font-weight: 650;
        line-height: 1.35;
        letter-spacing: -0.015em;
      }
      .player {
        position: relative;
        z-index: 1;
        width: 540px;
        height: 392px;
        flex: none;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #2c313c;
        border-radius: 18px;
        background: #12141a;
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.42);
      }
      .stage {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(ellipse at 50% 42%, rgba(255,106,61,0.18), transparent 58%),
          #0c0d10;
      }
      .badge {
        position: absolute;
        top: 18px;
        left: 18px;
        padding: 7px 12px;
        border: 1px solid #3a2430;
        border-radius: 999px;
        background: rgba(18, 20, 26, 0.88);
        color: #ff8a5c;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 14px;
        height: 68px;
        padding: 0 18px;
        border-top: 1px solid #2c313c;
        background: #181b22;
      }
      .play {
        width: 0;
        height: 0;
        border-top: 8px solid transparent;
        border-bottom: 8px solid transparent;
        border-left: 13px solid #f5f6f8;
      }
      .progress {
        flex: 1;
        height: 6px;
        overflow: hidden;
        border-radius: 99px;
        background: #2c313c;
      }
      .progress span {
        display: block;
        width: 58%;
        height: 100%;
        border-radius: 99px;
        background: #ff6a3d;
      }
      .chip {
        padding: 6px 11px;
        border-radius: 8px;
        background: #ff6a3d;
        color: #fff;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: 0.03em;
      }
      .speech {
        color: #c9cad0;
        font-size: 15px;
        font-weight: 650;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <section class="brand">
      ${markSvg(168, 10.24)}
      <div class="copy">
        <h1>DynamicSpeed<br>for YouTube</h1>
        <p class="tagline">Auto-adjusts YouTube speed based on talking pace.</p>
      </div>
    </section>
    <aside class="player" aria-hidden="true">
      <div class="stage">
        <div class="badge">Target 165 WPM</div>
        ${markSvg(280, 9.5)}
      </div>
      <div class="bar">
        <div class="play"></div>
        <div class="progress"><span></span></div>
        <div class="chip">1.47×</div>
        <div class="speech">Speech ~112 WPM</div>
      </div>
    </aside>
  </body>
</html>`;
}

async function capture(page, width, height, html) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const img = page.locator('img');
  if ((await img.count()) > 0) {
    await img.first().evaluate((node) => node.decode());
  }
  const shot = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width, height },
    animations: 'disabled',
  });
  const decoded = decodePng(shot);
  if (decoded.width !== width || decoded.height !== height) {
    throw new Error(`Unexpected screenshot size ${decoded.width}x${decoded.height}`);
  }
  return writePngRgb(width, height, flattenToRgb(decoded.rgba, width, height));
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store');
const icon = readFileSync(join(root, 'public', 'icon', '128.png'));
const iconDataUrl = `data:image/png;base64,${icon.toString('base64')}`;

const tiles = [
  {
    name: 'chrome-small-promo-tile.png',
    width: 440,
    height: 280,
    html: smallTileHtml(iconDataUrl),
  },
  {
    name: 'chrome-marquee-promo-tile.png',
    width: 1400,
    height: 560,
    html: marqueeHtml(),
  },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 440, height: 280 },
    deviceScaleFactor: 1,
  });
  for (const tile of tiles) {
    const png = await capture(page, tile.width, tile.height, tile.html);
    const outPath = join(outDir, tile.name);
    writeFileSync(outPath, png);
    console.log(`Wrote ${outPath} (${tile.width}x${tile.height}, ${png.length} bytes, 24-bit PNG)`);
  }
} finally {
  await browser.close();
}
