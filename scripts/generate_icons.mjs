/**
 * Generates multi-viewport favicons, Apple Touch icons, and PWA launcher icons
 * from crisp mathematical vector geometry matching public/icon.svg and public/icon-maskable.svg.
 * Zero npm dependencies; uses Node built-ins plus ImageMagick `convert` for favicon.ico packaging.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLORS = {
  transparent: [0, 0, 0, 0],
  obsidian: [9, 9, 11, 255],      // #09090b
  zincSurface: [24, 24, 27, 255], // #18181b
  zincBorder: [39, 39, 42, 255],  // #27272a
  emerald: [52, 211, 153, 255],   // #34d399
  wrenchWhite: [244, 244, 245, 255], // #f4f4f5
};

function isInsideWrench(u, v) {
  // Left box-end ring head centered at (-88, 0): outer r=46, inner circular eye cutout r=20
  const dxL = u + 88;
  const distL2 = dxL * dxL + v * v;
  const inLeftEye = distL2 < 20 * 20;
  if (inLeftEye) return false;

  // Shaft: (-88..88, -20..20)
  const inShaft = u >= -88 && u <= 88 && Math.abs(v) <= 20;
  const inLeftHead = distL2 <= 46 * 46;

  // Right open-end jaw head centered at (88, 0): outer r=48, rounded U-slot throat at x=84, half-gap=18
  const dxR = u - 88;
  const distR2 = dxR * dxR + v * v;
  const inSlotRect = u >= 84 && Math.abs(v) <= 18;
  const dxThroat = u - 84;
  const inSlotThroat = u < 84 && dxThroat * dxThroat + v * v <= 18 * 18;
  const inRightHead = distR2 <= 48 * 48 && !inSlotRect && !inSlotThroat;

  return inShaft || inLeftHead || inRightHead;
}

function sampleStandardIcon(nx, ny) {
  // Coordinates mapped onto 512x512 viewBox
  const px = nx * 512;
  const py = ny * 512;
  const dx = px - 256;
  const dy = py - 256;

  // Rounded rectangle badge: half-size 248, corner radius 112 (matching x=8..504, rx=112)
  const half = 248;
  const corner = 112;
  const inner = half - corner;
  const qx = Math.max(Math.abs(dx) - inner, 0);
  const qy = Math.max(Math.abs(dy) - inner, 0);
  const sdfOuter = Math.hypot(qx, qy) - corner;
  if (sdfOuter > 0) return COLORS.transparent;

  const r = Math.hypot(dx, dy);
  // Subtle outer bevel stroke (#27272a, 12px)
  if (sdfOuter > -12) return COLORS.zincBorder;

  // Emerald ring: r=162..186 (center r=174, stroke-width=24)
  if (r <= 186 && r >= 162) return COLORS.emerald;

  // Inner circle surface (#18181b) & wrench rotated -45 deg
  if (r < 162) {
    // Rotate (dx, dy) by +45 deg to transform into wrench local space
    const invSqrt2 = Math.SQRT1_2;
    const u = (dx - dy) * invSqrt2;
    const v = (dx + dy) * invSqrt2;
    if (isInsideWrench(u, v)) return COLORS.wrenchWhite;
    return COLORS.zincSurface;
  }

  return COLORS.obsidian;
}

function sampleMaskableIcon(nx, ny) {
  // Coordinates mapped onto 512x512 viewBox with full-bleed #09090b & 80% safe-zone emblem
  const px = nx * 512;
  const py = ny * 512;
  const dx = px - 256;
  const dy = py - 256;
  const r = Math.hypot(dx, dy);

  // Emerald ring: center r=142, stroke-width=20 => 132..152 (well inside 80% safe zone r=204.8)
  if (r <= 152 && r >= 132) return COLORS.emerald;

  if (r < 132) {
    const invSqrt2 = Math.SQRT1_2;
    const scale = 0.8;
    const u = ((dx - dy) * invSqrt2) / scale;
    const v = ((dx + dy) * invSqrt2) / scale;
    if (isInsideWrench(u, v)) return COLORS.wrenchWhite;
    return COLORS.zincSurface;
  }

  return COLORS.obsidian;
}

function renderIconPng(size, sampler, ssaa = 4) {
  const rgba = Buffer.alloc(size * size * 4);
  const totalSamples = ssaa * ssaa;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      for (let sy = 0; sy < ssaa; sy++) {
        const ny = (y + (sy + 0.5) / ssaa) / size;
        for (let sx = 0; sx < ssaa; sx++) {
          const nx = (x + (sx + 0.5) / ssaa) / size;
          const [sr, sg, sb, sa] = sampler(nx, ny);
          const alpha = sa / 255;
          rAcc += sr * alpha;
          gAcc += sg * alpha;
          bAcc += sb * alpha;
          aAcc += sa;
        }
      }

      const avgA = aAcc / totalSamples;
      const idx = (y * size + x) * 4;
      if (avgA > 0) {
        const norm = 255 / (avgA * totalSamples);
        rgba[idx] = Math.min(255, Math.round(rAcc * norm));
        rgba[idx + 1] = Math.min(255, Math.round(gAcc * norm));
        rgba[idx + 2] = Math.min(255, Math.round(bAcc * norm));
        rgba[idx + 3] = Math.min(255, Math.round(avgA));
      }
    }
  }

  return encodePngRgba(size, size, rgba);
}

const targets = [
  // Multi-viewport desktop & mobile browser favicons
  { path: 'public/favicon-16x16.png', size: 16, sampler: sampleStandardIcon, ssaa: 6 },
  { path: 'public/favicon-32x32.png', size: 32, sampler: sampleStandardIcon, ssaa: 6 },
  { path: 'public/favicon-48x48.png', size: 48, sampler: sampleStandardIcon, ssaa: 4 },
  { path: 'public/favicon-96x96.png', size: 96, sampler: sampleStandardIcon, ssaa: 4 },
  // iOS Safari / iPadOS home-screen touch icons (opaque background required by iOS)
  { path: 'public/apple-touch-icon-120x120.png', size: 120, sampler: sampleMaskableIcon, ssaa: 4 },
  { path: 'public/apple-touch-icon-152x152.png', size: 152, sampler: sampleMaskableIcon, ssaa: 4 },
  { path: 'public/apple-touch-icon-167x167.png', size: 167, sampler: sampleMaskableIcon, ssaa: 4 },
  { path: 'public/apple-touch-icon.png', size: 180, sampler: sampleMaskableIcon, ssaa: 4 },
  // PWA launcher & shortcut icons ("any" and adaptive "maskable")
  { path: 'public/pwa-192x192.png', size: 192, sampler: sampleStandardIcon, ssaa: 4 },
  { path: 'public/pwa-maskable-192x192.png', size: 192, sampler: sampleMaskableIcon, ssaa: 4 },
  { path: 'public/pwa-384x384.png', size: 384, sampler: sampleStandardIcon, ssaa: 4 },
  { path: 'public/pwa-512x512.png', size: 512, sampler: sampleStandardIcon, ssaa: 4 },
  { path: 'public/pwa-maskable-512x512.png', size: 512, sampler: sampleMaskableIcon, ssaa: 4 },
];

for (const t of targets) {
  const buf = renderIconPng(t.size, t.sampler, t.ssaa);
  fs.writeFileSync(t.path, buf);
  console.log(`Generated ${t.path} (${t.size}x${t.size}, ${buf.length} bytes)`);
}

// Package multi-size Windows / desktop shortcut favicon.ico (16x16, 32x32, 48x48)
execFileSync('convert', [
  'public/favicon-16x16.png',
  'public/favicon-32x32.png',
  'public/favicon-48x48.png',
  'public/favicon.ico',
]);
const icoStats = fs.statSync('public/favicon.ico');
console.log(`Generated public/favicon.ico (16/32/48 multi-size, ${icoStats.size} bytes)`);
