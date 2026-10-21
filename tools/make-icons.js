/* ==========================================================
   tools/make-icons.js
   Generates the PWA PNG icons with zero dependencies
   (hand-rolled PNG encoder + zlib from Node's stdlib).

   Usage: node tools/make-icons.js
   ========================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'icons');

/* ---------- PNG encoder ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- drawing ---------- */
function insideRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size, opts) {
  opts = opts || {};
  const scale = opts.scale == null ? 1 : opts.scale;      // cross scale
  const round = opts.round !== false;                       // rounded corners
  const rgba = Buffer.alloc(size * size * 4);

  const radius = round ? size * 0.22 : 0;
  const barW = size * 0.17 * scale;
  const barH = size * 0.52 * scale;
  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      let bgAlpha = 255;
      if (round) {
        bgAlpha = insideRoundedRect(px, py, 0, 0, size - 1, size - 1, radius) ? 255 : 0;
      }

      // vertical gradient #ef4444 -> #b91c1c
      const t = y / (size - 1);
      let r = Math.round(239 + (185 - 239) * t);
      let g = Math.round(68 + (28 - 68) * t);
      let b = Math.round(68 + (28 - 68) * t);

      // white cross
      const inV = Math.abs(px - cx) <= barW / 2 && Math.abs(py - cy) <= barH / 2;
      const inH = Math.abs(px - cx) <= barH / 2 && Math.abs(py - cy) <= barW / 2;
      if (bgAlpha > 0 && (inV || inH)) { r = 255; g = 255; b = 255; }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = bgAlpha;
    }
  }
  return encodePNG(size, size, rgba);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const files = [
    ['icon-192.png', drawIcon(192, { scale: 1 })],
    ['icon-512.png', drawIcon(512, { scale: 1 })],
    ['icon-maskable-512.png', drawIcon(512, { scale: 0.72, round: false })]
  ];

  files.forEach(([name, buf]) => {
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log('✔ icons/' + name, '(' + buf.length + ' bytes)');
  });
}

main();
