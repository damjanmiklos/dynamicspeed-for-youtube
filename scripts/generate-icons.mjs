import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCENT = [255, 106, 61];

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

function writePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function cover(distPx) {
  return clamp01(0.5 - distPx);
}

function sdCapsule(px, py, ax, ay, bx, by, radius) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay;
  const t = denom <= 1e-12 ? 0 : clamp01((pax * bax + pay * bay) / denom);
  const dx = pax - bax * t;
  const dy = pay - bay * t;
  return Math.hypot(dx, dy) - radius;
}

/**
 * Waveform flowing into a play triangle as one stroke. No badge, no ring.
 * The last trough lands on the triangle’s bottom-left; the rise is its left edge.
 */
function layout(size) {
  const simple = size <= 16;
  const tl = simple ? [0.58, 0.2] : [0.58, 0.2];
  const tip = simple ? [0.9, 0.5] : [0.905, 0.5];
  const bl = simple ? [0.58, 0.8] : [0.58, 0.8];
  const wave = simple
    ? [
        [0.08, 0.5],
        [0.24, 0.28],
        [0.36, 0.76],
        bl,
      ]
    : [
        [0.07, 0.5],
        [0.15, 0.5],
        [0.24, 0.34],
        [0.34, 0.76],
        [0.46, 0.24],
        bl,
      ];
  const path = [...wave, tl, tip, bl];
  const segments = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    segments.push([path[i], path[i + 1]]);
  }
  const stroke = simple ? 0.15 : size <= 32 ? 0.1 : 0.08;
  return { wave, tl, tip, bl, path, segments, radius: stroke / 2 };
}

function markSdf(nx, ny, geo) {
  let dist = 1e9;
  for (const [a, b] of geo.segments) {
    dist = Math.min(dist, sdCapsule(nx, ny, a[0], a[1], b[0], b[1], geo.radius));
  }
  return dist;
}

function render(size) {
  const geo = layout(size);
  const grid = size <= 16 ? 8 : size <= 32 ? 6 : 5;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let a = 0;
      for (let sy = 0; sy < grid; sy += 1) {
        for (let sx = 0; sx < grid; sx += 1) {
          const nx = (x + (sx + 0.5) / grid) / size;
          const ny = (y + (sy + 0.5) / grid) / size;
          a += cover(markSdf(nx, ny, geo) * size);
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = ACCENT[0];
      rgba[i + 1] = ACCENT[1];
      rgba[i + 2] = ACCENT[2];
      rgba[i + 3] = Math.round((a / (grid * grid)) * 255);
    }
  }
  return writePng(size, rgba);
}

function svgMarkup() {
  const geo = layout(128);
  const s = 128;
  const pt = (p) => `${(p[0] * s).toFixed(2)} ${(p[1] * s).toFixed(2)}`;
  const d = geo.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(p)}`).join(' ');
  const stroke = (geo.radius * 2 * s).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" fill="none">
  <path d="${d}" stroke="#ff6a3d" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'icon');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'logo.svg'), svgMarkup());
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(dir, `${size}.png`), render(size));
}
console.log('Wrote extension icons');
