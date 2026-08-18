import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function writePng(size, paint) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
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

function paint(x, y, size) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const r = Math.sqrt(dx * dx + dy * dy);
  const radius = 0.46;
  if (r > radius) {
    return [0, 0, 0, 0];
  }
  const bg = [18, 20, 26, 255];
  const accent = [255, 106, 61, 255];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  let color = bg;
  if (r > 0.38) {
    color = mix(accent, bg, 0.15);
  }
  for (let i = 0; i < 3; i += 1) {
    const cx = 0.34 + i * 0.12;
    const cy = 0.5;
    const chev =
      Math.abs((nx - cx) * 0.9 + (ny - cy) * 1.6) < 0.045 &&
      nx > cx - 0.02 &&
      nx < cx + 0.16;
    if (chev) {
      color = accent;
    }
  }
  return color;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'icon');
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(dir, `${size}.png`), writePng(size, paint));
}
console.log('Wrote extension icons');
