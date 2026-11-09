import { TERRAIN_EXTENT, heightAt } from '../data/terrain';
import type { Theme } from './theme';

type Relief = { url: string; x: number; y: number; w: number; h: number };
const cache: Partial<Record<Theme, Relief>> = {};

/**
 * Shaded relief for the terrain: light from the north-west, plus a faint
 * elevation tint (greener valleys, paler heights). Rendered once per theme to an
 * image that sits under the contours and scales with the camera.
 *
 * On paper the shading darkens slopes turned away from the light. At night it
 * works the other way: the ground is near-black, so slopes facing the (moon)light
 * are lifted towards pale sage and the far sides sink, which keeps the relief
 * legible where multiplying a dark colour would barely change it.
 */
export function renderHillshade(theme: Theme = 'light', unitsPerPx = 2.5): Relief | null {
  const hit = cache[theme];
  if (hit) return hit;
  const e = TERRAIN_EXTENT;
  const W = Math.round((e.x1 - e.x0) / unitsPerPx);
  const H = Math.round((e.y1 - e.y0) / unitsPerPx);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const hgt = new Float32Array((W + 2) * (H + 2));
  for (let j = 0; j < H + 2; j++) {
    for (let i = 0; i < W + 2; i++) hgt[j * (W + 2) + i] = heightAt(e.x0 + (i - 1) * unitsPerPx, e.y0 + (j - 1) * unitsPerPx);
  }

  const img = ctx.createImageData(W, H);
  const zScale = 0.07; // vertical exaggeration: metres to world units
  const az = (315 * Math.PI) / 180;
  const alt = (45 * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.sin(az);
  const ly = -Math.cos(alt) * Math.cos(az);
  const lz = Math.sin(alt);
  const night = theme === 'dark';
  const paper = night ? [15, 27, 23] : [243, 237, 222];
  const valley = night ? [11, 23, 19] : [230, 232, 214];
  const height = night ? [27, 40, 34] : [248, 245, 236];
  const moon = [150, 178, 150]; // the colour lit slopes lift towards at night
  const fade = 260; // world units over which the relief fades out at the edges

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = (j + 1) * (W + 2) + (i + 1);
      const dzdx = ((hgt[k + 1] - hgt[k - 1]) * zScale) / (2 * unitsPerPx);
      const dzdy = ((hgt[k + W + 2] - hgt[k - W - 2]) * zScale) / (2 * unitsPerPx);
      const len = Math.hypot(dzdx, dzdy, 1);
      const shade = (-dzdx * lx - dzdy * ly + lz) / len; // 1 = facing the light
      const d = shade - lz; // -lz (facing away) to 1 - lz (facing the light)
      const m = 1 + 0.12 * d;
      const t = Math.min(1, Math.max(0, (hgt[k] - 450) / 1900));
      const base = paper.map((p, c) => {
        const tint = t < 0.5 ? valley[c] + (p - valley[c]) * (t * 2) : p + (height[c] - p) * ((t - 0.5) * 2);
        return tint;
      });
      const wx = e.x0 + i * unitsPerPx;
      const wy = e.y0 + j * unitsPerPx;
      const edge = Math.min(wx - e.x0, e.x1 - wx, wy - e.y0, e.y1 - wy);
      const a = Math.min(1, Math.max(0, edge / fade));
      const o = (j * W + i) * 4;
      if (night) {
        // Lit slopes lift towards moonlight; shadowed ones sink a little.
        const lift = d > 0 ? 0.3 * Math.min(1, d / (1 - lz)) : 0;
        const sink = d < 0 ? 1 - 0.5 * Math.min(1, -d / lz) : 1;
        img.data[o] = Math.max(0, base[0] * sink + (moon[0] - base[0]) * lift);
        img.data[o + 1] = Math.max(0, base[1] * sink + (moon[1] - base[1]) * lift);
        img.data[o + 2] = Math.max(0, base[2] * sink + (moon[2] - base[2]) * lift);
      } else {
        img.data[o] = Math.min(255, base[0] * m);
        img.data[o + 1] = Math.min(255, base[1] * m);
        img.data[o + 2] = Math.min(255, base[2] * m);
      }
      img.data[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { url: canvas.toDataURL('image/png'), x: e.x0, y: e.y0, w: e.x1 - e.x0, h: e.y1 - e.y0 };
  cache[theme] = out;
  return out;
}
