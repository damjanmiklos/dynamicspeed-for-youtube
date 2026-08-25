import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WIDTH = 440;
const HEIGHT = 280;
const CHARCOAL = [27, 28, 31];

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

function tileHtml(iconDataUrl) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
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
        image-rendering: auto;
      }
      .copy {
        margin-left: 22px;
        min-width: 0;
        max-width: 250px;
      }
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconPath = join(root, 'public', 'icon', '128.png');
const outDir = join(root, 'store');
const outPath = join(outDir, 'chrome-small-promo-tile.png');

const icon = readFileSync(iconPath);
const html = tileHtml(`data:image/png;base64,${icon.toString('base64')}`);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.locator('img').evaluate((img) => img.decode());
  const shot = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    animations: 'disabled',
  });
  const decoded = decodePng(shot);
  if (decoded.width !== WIDTH || decoded.height !== HEIGHT) {
    throw new Error(`Unexpected screenshot size ${decoded.width}x${decoded.height}`);
  }
  const png = writePngRgb(WIDTH, HEIGHT, flattenToRgb(decoded.rgba, WIDTH, HEIGHT));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${WIDTH}x${HEIGHT}, ${png.length} bytes, 24-bit PNG)`);
} finally {
  await browser.close();
}
