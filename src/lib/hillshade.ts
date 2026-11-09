import { TERRAIN_EXTENT, heightGrid } from '../data/terrain';
import type { Theme } from './theme';

type RGB = [number, number, number];

type Plate = { ramp: [number, RGB][]; shadow: RGB; light: RGB; lightMax: number; bandMix: number };

/**
 * A toy diorama in hard 500 m terraces. By day: saturated grass, sand, rock
 * and snow with plum shadows. At night: dusky green, mauve and a moonlit
 * peak, shadows sinking towards plum-black. Elevations in metres.
 */
export const PLATES: Record<Theme, Plate> = {
  light: {
    ramp: [
      [250, [126, 196, 92]],
      [800, [158, 214, 104]],
      [1300, [236, 210, 140]],
      [1800, [214, 170, 128]],
      [2300, [196, 176, 186]],
      [2600, [255, 250, 244]],
    ],
    shadow: [92, 54, 98],
    light: [255, 244, 214],
    lightMax: 0.5,
    bandMix: 1,
  },
  dark: {
    ramp: [
      [250, [38, 62, 56]],
      [800, [52, 80, 62]],
      [1300, [88, 80, 92]],
      [1800, [104, 86, 120]],
      [2300, [128, 112, 156]],
      [2600, [206, 200, 232]],
    ],
    shadow: [10, 6, 22],
    light: [190, 180, 230],
    lightMax: 0.3,
    bandMix: 1,
  },
};
/** Steps every 500 m (the index contours), mixed into the smooth ramp by `bandMix`. */
const BAND = 500;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function tint(RAMP: [number, RGB][], bandMix: number, h: number, out: RGB): void {
  const f = h / BAND;
  const stepped = (Math.floor(f) + smoothstep(0.72, 1, f - Math.floor(f))) * BAND;
  const e = h + (stepped - h) * bandMix;
  let i = 0;
  while (i < RAMP.length - 2 && e > RAMP[i + 1][0]) i++;
  const [h0, c0] = RAMP[i];
  const [h1, c1] = RAMP[i + 1];
  const t = Math.min(1, Math.max(0, (e - h0) / (h1 - h0)));
  out[0] = c0[0] + (c1[0] - c0[0]) * t;
  out[1] = c0[1] + (c1[1] - c0[1]) * t;
  out[2] = c0[2] + (c1[2] - c0[2]) * t;
}

/**
 * Shaded relief for the terrain: hypsometric tint plus hillshade (light from
 * the north-west) combined into one image. Contrast grows with elevation, as
 * in aerial perspective: the valley floor stays hazy, the summit crisp.
 * Rendered once per theme to an image that sits under the contours and scales
 * with the camera.
 */
type Relief = { url: string; x: number; y: number; w: number; h: number };
const cache: Partial<Record<Theme, Relief>> = {};

export function renderHillshade(theme: Theme = 'light', unitsPerPx = 2): Relief | null {
  const hit = cache[theme];
  if (hit) return hit;
  const { ramp, shadow: SHADOW, light: LIGHT, lightMax, bandMix } = PLATES[theme];
  const e = TERRAIN_EXTENT;
  const W = Math.round((e.x1 - e.x0) / unitsPerPx);
  const H = Math.round((e.y1 - e.y0) / unitsPerPx);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const W2 = W + 2;
  // Heights with a one-cell border, for central differences at the edges.
  const hgt = heightGrid(e.x0 - unitsPerPx, e.y0 - unitsPerPx, unitsPerPx, W2, H + 2);

  const img = ctx.createImageData(W, H);
  const d = img.data;
  const zScale = 0.07 / (2 * unitsPerPx); // vertical exaggeration (metres to world units), central difference
  const az = (315 * Math.PI) / 180;
  const alt = (40 * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.sin(az);
  const ly = -Math.cos(alt) * Math.cos(az);
  const lz = Math.sin(alt);

  // Per-metre lookup: tint colour and shading strength. Aerial perspective:
  // higher ground gets more contrast, the valley floor stays hazy.
  const LUT_MAX = 3200;
  const lut = new Float32Array((LUT_MAX + 1) * 4);
  const base: RGB = [0, 0, 0];
  for (let m = 0; m <= LUT_MAX; m++) {
    tint(ramp, bandMix, m, base);
    lut[m * 4] = base[0];
    lut[m * 4 + 1] = base[1];
    lut[m * 4 + 2] = base[2];
    lut[m * 4 + 3] = 0.7 + 0.55 * smoothstep(300, 2400, m);
  }

  // The relief fades out over the outer 260 world units.
  const fade = 260 / unitsPerPx;
  const ax = new Float32Array(W);
  const ay = new Float32Array(H);
  for (let i = 0; i < W; i++) ax[i] = Math.min(1, Math.min(i, W - 1 - i) / fade);
  for (let j = 0; j < H; j++) ay[j] = Math.min(1, Math.min(j, H - 1 - j) / fade);

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = (j + 1) * W2 + (i + 1);
      const dzdx = (hgt[k + 1] - hgt[k - 1]) * zScale;
      const dzdy = (hgt[k + W2] - hgt[k - W2]) * zScale;
      const inv = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const rel = (-dzdx * lx - dzdy * ly + lz) * inv - lz; // 0 flat, < 0 turned away from the light, > 0 towards it
      const steep = 1 - inv; // 0 flat, towards 1 on steep slopes

      const q = Math.min(LUT_MAX, Math.max(0, hgt[k] | 0)) * 4;
      const c = lut[q + 3];
      const s = Math.min(0.5, ((rel < 0 ? -rel : 0) * 1.1 + steep * 0.1) * c);
      const l = Math.min(lightMax, (rel > 0 ? rel : 0) * 2.4 * c);
      let r = lut[q] + (SHADOW[0] - lut[q]) * s;
      let g = lut[q + 1] + (SHADOW[1] - lut[q + 1]) * s;
      let b = lut[q + 2] + (SHADOW[2] - lut[q + 2]) * s;
      r += (LIGHT[0] - r) * l;
      g += (LIGHT[1] - g) * l;
      b += (LIGHT[2] - b) * l;

      const o = (j * W + i) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255 * Math.min(ax[i], ay[j]);
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { url: canvas.toDataURL('image/png'), x: e.x0, y: e.y0, w: e.x1 - e.x0, h: e.y1 - e.y0 };
  cache[theme] = out;
  return out;
}
