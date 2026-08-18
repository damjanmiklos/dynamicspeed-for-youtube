import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCENT = [255, 106, 61];
const ACCENT_HI = [255, 150, 104];
const FILL = [14, 16, 22];

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

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mix3(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function cover(distPx) {
  return clamp01(0.5 - distPx);
}

function snap(value, size) {
  if (size > 32) {
    return value;
  }
  return Math.round(value * size) / size;
}

function snapCenter(value, size) {
  if (size > 32) {
    return value;
  }
  return (Math.round(value * size - 0.5) + 0.5) / size;
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function sdTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax;
  const e0y = by - ay;
  const e1x = cx - bx;
  const e1y = cy - by;
  const e2x = ax - cx;
  const e2y = ay - cy;
  const v0x = px - ax;
  const v0y = py - ay;
  const v1x = px - bx;
  const v1y = py - by;
  const v2x = px - cx;
  const v2y = py - cy;
  const d0 = e0x * e0x + e0y * e0y;
  const d1 = e1x * e1x + e1y * e1y;
  const d2 = e2x * e2x + e2y * e2y;
  const t0 = clamp01((v0x * e0x + v0y * e0y) / d0);
  const t1 = clamp01((v1x * e1x + v1y * e1y) / d1);
  const t2 = clamp01((v2x * e2x + v2y * e2y) / d2);
  const p0x = v0x - e0x * t0;
  const p0y = v0y - e0y * t0;
  const p1x = v1x - e1x * t1;
  const p1y = v1y - e1y * t1;
  const p2x = v2x - e2x * t2;
  const p2y = v2y - e2y * t2;
  const s = Math.sign(e0x * e2y - e0y * e2x);
  let minSq = p0x * p0x + p0y * p0y;
  let minArea = s * (v0x * e0y - v0y * e0x);
  const sq1 = p1x * p1x + p1y * p1y;
  const area1 = s * (v1x * e1y - v1y * e1x);
  if (sq1 < minSq) {
    minSq = sq1;
    minArea = area1;
  }
  const sq2 = p2x * p2x + p2y * p2y;
  const area2 = s * (v2x * e2y - v2y * e2x);
  if (sq2 < minSq) {
    minSq = sq2;
    minArea = area2;
  }
  return -Math.sqrt(minSq) * Math.sign(minArea);
}

function layout(size) {
  const outer = 0.49;
  const ringW = Math.max(2 / size, size >= 64 ? 0.058 : 0.09);
  const ringOuter = outer - (size <= 16 ? 0 : 0.006);
  const ringInner = ringOuter - ringW;
  const gap = Math.max(0.078, 2.1 / size);
  const barHalf = (size <= 16 ? 0.8 : size <= 32 ? 1.25 : 3.8) / size;
  const playW = size <= 16 ? 0.24 : 0.195;
  const playH = size <= 16 ? 0.4 : 0.34;
  const barH1 = 0.24;
  const barH2 = 0.36;
  const groupW = playW + gap + barHalf * 2 + gap + barHalf * 2;
  const x0 = snap(0.5 - groupW / 2, size);
  const playLeft = x0;
  const playRight = x0 + playW;
  const bar1 = snapCenter(playRight + gap + barHalf, size);
  const bar2 = snapCenter(bar1 + barHalf + gap + barHalf, size);
  return {
    outer,
    ringOuter,
    ringInner,
    playLeft,
    playRight,
    playH,
    bar1,
    bar2,
    barHalf,
    barH1,
    barH2,
    roundPlay: size >= 48 ? 0.014 : 0.004,
  };
}

function markSdf(nx, ny, geo) {
  const top = 0.5 - geo.playH / 2;
  const bot = 0.5 + geo.playH / 2;
  const play =
    sdTriangle(nx, ny, geo.playLeft, top, geo.playLeft, bot, geo.playRight, 0.5) -
    geo.roundPlay;
  const bar1 = sdRoundedBox(
    nx,
    ny,
    geo.bar1,
    0.5,
    geo.barHalf,
    geo.barH1 / 2,
    geo.barHalf,
  );
  const bar2 = sdRoundedBox(
    nx,
    ny,
    geo.bar2,
    0.5,
    geo.barHalf,
    geo.barH2 / 2,
    geo.barHalf,
  );
  return Math.min(play, bar1, bar2);
}

function sample(nx, ny, size, geo) {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const r = Math.hypot(dx, dy);
  const circleA = cover((r - geo.outer) * size);
  if (circleA <= 0) {
    return [0, 0, 0, 0];
  }

  let rgb = FILL.slice();
  const ring = Math.max(r - geo.ringOuter, geo.ringInner - r);
  const ringA = cover(ring * size);
  const hi = clamp01(0.35 - dy * 0.45) * 0.18;
  rgb = mix3(rgb, mix3(ACCENT, ACCENT_HI, hi), ringA);

  const mark = markSdf(nx, ny, geo);
  if (size >= 48) {
    rgb = mix3(rgb, ACCENT, Math.exp(-Math.max(mark, 0) * size * 0.85) * 0.1);
  }
  rgb = mix3(rgb, ACCENT, cover(mark * size));
  return [
    Math.round(rgb[0]),
    Math.round(rgb[1]),
    Math.round(rgb[2]),
    Math.round(circleA * 255),
  ];
}

function stamp(rgba, size, x, y, rgb) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  rgba[i] = rgb[0];
  rgba[i + 1] = rgb[1];
  rgba[i + 2] = rgb[2];
  rgba[i + 3] = 255;
}

function render16() {
  const size = 16;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x + 0.5 - 7.5, y + 0.5 - 7.5);
      const outer = 7.55;
      const inner = 5.45;
      const i = (y * size + x) * 4;
      if (dist <= inner) {
        rgba[i] = FILL[0];
        rgba[i + 1] = FILL[1];
        rgba[i + 2] = FILL[2];
        rgba[i + 3] = 255;
      } else if (dist <= outer) {
        rgba[i] = ACCENT[0];
        rgba[i + 1] = ACCENT[1];
        rgba[i + 2] = ACCENT[2];
        rgba[i + 3] = 255;
      } else if (dist < outer + 0.62) {
        const a = clamp01(outer + 0.5 - dist);
        rgba[i] = ACCENT[0];
        rgba[i + 1] = ACCENT[1];
        rgba[i + 2] = ACCENT[2];
        rgba[i + 3] = Math.round(a * 255);
      }
    }
  }
  const play = [
    [5, 5],
    [5, 6],
    [5, 7],
    [5, 8],
    [5, 9],
    [5, 10],
    [6, 6],
    [6, 7],
    [6, 8],
    [6, 9],
    [7, 7],
    [7, 8],
  ];
  const bars = [
    [9, 6],
    [9, 7],
    [9, 8],
    [9, 9],
    [11, 5],
    [11, 6],
    [11, 7],
    [11, 8],
    [11, 9],
    [11, 10],
  ];
  for (const [x, y] of [...play, ...bars]) {
    stamp(rgba, size, x, y, ACCENT);
  }
  return writePng(size, rgba);
}

function render(size) {
  if (size === 16) {
    return render16();
  }
  const geo = layout(size);
  const grid = size <= 32 ? 8 : 5;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < grid; sy += 1) {
        for (let sx = 0; sx < grid; sx += 1) {
          const nx = (x + (sx + 0.5) / grid) / size;
          const ny = (y + (sy + 0.5) / grid) / size;
          const pixel = sample(nx, ny, size, geo);
          r += pixel[0];
          g += pixel[1];
          b += pixel[2];
          a += pixel[3];
        }
      }
      const n = grid * grid;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return writePng(size, rgba);
}

function svgMarkup() {
  const geo = layout(128);
  const s = 128;
  const px = (n) => (n * s).toFixed(2);
  const top = 0.5 - geo.playH / 2;
  const bot = 0.5 + geo.playH / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <circle cx="64" cy="64" r="${px(geo.outer)}" fill="#0e1016"/>
  <circle cx="64" cy="64" r="${px((geo.ringOuter + geo.ringInner) / 2)}" fill="none" stroke="#ff6a3d" stroke-width="${px(geo.ringOuter - geo.ringInner)}"/>
  <path fill="#ff6a3d" d="M${px(geo.playLeft)} ${px(top)} L${px(geo.playLeft)} ${px(bot)} L${px(geo.playRight)} 64 Z"/>
  <rect x="${px(geo.bar1 - geo.barHalf)}" y="${px(0.5 - geo.barH1 / 2)}" width="${px(geo.barHalf * 2)}" height="${px(geo.barH1)}" rx="${px(geo.barHalf)}" fill="#ff6a3d"/>
  <rect x="${px(geo.bar2 - geo.barHalf)}" y="${px(0.5 - geo.barH2 / 2)}" width="${px(geo.barHalf * 2)}" height="${px(geo.barH2)}" rx="${px(geo.barHalf)}" fill="#ff6a3d"/>
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
