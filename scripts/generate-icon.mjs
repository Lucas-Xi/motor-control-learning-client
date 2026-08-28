// 生成应用图标：256×256 PNG + 同尺寸 ICO（PNG 条目），零依赖。
// 设计沿用应用视觉令牌：深海军蓝底 + cyan 转子环 + 三相相位点。
// electron-builder 的 NSIS/portable 要求图标 ≥256×256。
//
// Run: node scripts/generate-icon.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SIZE = 256;

// 视觉令牌（与 tailwind.config.js colors 一致）
const BG = [13, 25, 41]; // #0d1929 bg-base
const INK = [231, 243, 255]; // #e7f3ff
const PHASES = [
  [52, 214, 255], // #34d6ff accent.primary (cyan)
  [67, 247, 181], // #43f7b5 accent.measure (mint)
  [255, 184, 77], // #ffb84d accent.warn (amber)
];

/** 像素几何：圆角矩形内的"转子环 + 三相点"构图 */
function pixel(x, y) {
  const c = (SIZE - 1) / 2;
  const R = SIZE * 0.344; // 环半径
  const T = SIZE * 0.055; // 环半厚度
  const r = Math.hypot(x - c, y - c);

  // 圆角方形：到最近边的距离 dx/dy，仅在两向都小于圆角半径时按角圆圆心判定
  const cornerR = SIZE * 0.19;
  const dx = x < SIZE / 2 ? x : SIZE - 1 - x;
  const dy = y < SIZE / 2 ? y : SIZE - 1 - y;
  const inRound = dx >= cornerR || dy >= cornerR
    ? true
    : Math.hypot(cornerR - dx, cornerR - dy) <= cornerR;
  if (!inRound) return null; // 圆角外透明

  // 三相相位点：环上 120° 均布（三色，避免与环同色融合）
  for (let k = 0; k < 3; k += 1) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const px = c + R * Math.cos(a);
    const py = c + R * Math.sin(a);
    if (Math.hypot(x - px, y - py) < SIZE * 0.062) return PHASES[k];
  }
  if (Math.abs(r - R) < T) return INK; // 转子环（亮白）
  if (r < SIZE * 0.075) return PHASES[0]; // 转子轴心（cyan）
  return BG;
}

// ---------- 最小 PNG 编码器（RGBA8，filter=0） ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let k = 0; k < 8; k += 1) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
  return v >>> 0;
});
const crc32 = (buf) => {
  let v = 0xffffffff;
  for (const b of buf) v = CRC_TABLE[(v ^ b) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = rgba[y * width + x];
      raw[rowStart + 1 + x * 4] = r;
      raw[rowStart + 2 + x * 4] = g;
      raw[rowStart + 3 + x * 4] = b;
      raw[rowStart + 4 + x * 4] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- ICO 容器（单一 256×256 PNG 条目，Vista+ 格式，字段小端） ----------
function wrapIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 0 表示 256
  entry[1] = 0;
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // 数据偏移 = 6 + 16
  return Buffer.concat([header, entry, png]);
}

// ---------- 渲染 ----------
const rgba = new Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const rgb = pixel(x, y);
    rgba[y * SIZE + x] = rgb ? [...rgb, 255] : [0, 0, 0, 0];
  }
}

const png = encodePng(rgba, SIZE, SIZE);
for (const [file, data] of [
  ['build/icon.png', png],
  ['build/icon.ico', wrapIco(png)],
  ['public/favicon.ico', wrapIco(png)],
]) {
  const p = fileURLToPath(new URL(`../${file}`, import.meta.url));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log(`[icon] ${file}  ${data.length} bytes`);
}
console.log(`[icon] done  ${SIZE}x${SIZE}`);
