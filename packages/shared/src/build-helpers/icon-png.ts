// Rasterize the extension icon (same design as assets/icons/icon.svg) to a
// 128×128 PNG for Chrome, which doesn't accept SVG manifest icons. Pure
// Node, no dependencies: signed-distance fields for the strokes and a
// minimal PNG encoder. The Chrome build calls it, so dist/ never drifts from
// the SVG; scripts/generate-icon.mjs writes the committed copy for the store.
import { deflateSync } from "node:zlib";

const SIZE = 128;

const BACKGROUND = [0, 0, 0];
const PAPER = [255, 255, 255];
const HALF_STROKE = 4;

type Rect = { x: number; y: number; w: number; h: number; r: number };
type Point = readonly [number, number];

const MOUNTAIN: Point[] = [
  ...quadratic([16, 98], [41.7, 74.5], [46, 40]),
  [82, 40],
  ...quadratic([82, 40], [86.3, 74.5], [112, 98]),
];
const SNOW: Point[] = [[40.7, 62], [52.4, 72], [64, 62], [75.7, 72], [87.3, 62]];

function quadratic(p0: Point, p1: Point, p2: Point, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const w = [(1 - t) ** 2, 2 * (1 - t) * t, t ** 2];
    return [
      w[0]! * p0[0] + w[1]! * p1[0] + w[2]! * p2[0],
      w[0]! * p0[1] + w[1]! * p1[1] + w[2]! * p2[1],
    ];
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const coverage = (distance: number) => clamp01(0.5 - distance);
const blend = (rgb: number[], over: number[], t: number) =>
  rgb.map((c, i) => mix(c, over[i] ?? c, t));

function roundedRectSDF(px: number, py: number, rect: Rect): number {
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const dx = Math.abs(px - (rect.x + halfW)) - (halfW - rect.r);
  const dy = Math.abs(py - (rect.y + halfH)) - (halfH - rect.r);
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rect.r
  );
}

function segmentDistance(px: number, py: number, [ax, ay]: Point, [bx, by]: Point): number {
  const ex = bx - ax;
  const ey = by - ay;
  const lengthSquared = ex * ex + ey * ey;
  const t = lengthSquared ? clamp01(((px - ax) * ex + (py - ay) * ey) / lengthSquared) : 0;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}

function polylineSDF(px: number, py: number, points: readonly Point[]): number {
  let d = Infinity;
  for (let i = 1; i < points.length; i++) {
    d = Math.min(d, segmentDistance(px, py, points[i - 1]!, points[i]!));
  }
  return d - HALF_STROKE;
}

function glyphSDF(px: number, py: number): number {
  return Math.min(
    polylineSDF(px, py, MOUNTAIN),
    polylineSDF(px, py, SNOW)
  );
}

function pixel(x: number, y: number): number[] {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const shape = coverage(roundedRectSDF(cx, cy, { x: 0, y: 0, w: SIZE, h: SIZE, r: 28 }));
  if (shape === 0) return [0, 0, 0, 0];

  const rgb = blend(BACKGROUND, PAPER, coverage(glyphSDF(cx, cy)));

  return [...rgb.map(Math.round), Math.round(shape * 255)];
}

// --- Minimal PNG encoder (RGBA, 8-bit, no interlace) ---
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function renderIconPng(): Buffer {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < SIZE; x++) {
      raw.set(pixel(x, y), row + 1 + x * 4);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
