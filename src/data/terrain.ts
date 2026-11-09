/**
 * The landscape behind the trail, as a height field in metres.
 *
 * One mountain: the main trail climbs it from the valley floor (Trailhead) to
 * the summit (Evaluation). Each optional branch leaves the trail and climbs a
 * lower side peak of its own. Contours, hillshading and the elevations shown on
 * landmarks are all computed from this one function, so they always agree.
 */

export type Bump = { x: number; y: number; h: number; sx: number; sy: number };

/** Valley floor height, rising gently towards the north (smaller y). */
const FLOOR = 300;
const TILT = 0.2;

export const BUMPS: Bump[] = [
  // The main massif: summit at Evaluation, long southern flank carrying the trail.
  { x: 551, y: 156, h: 2000, sx: 175, sy: 330 },
  // Side peaks reached by the optional branches. Centres are offset so that each
  // summit (after the massif's slope is added) falls exactly under its landmark.
  { x: 202, y: 478, h: 1000, sx: 95, sy: 95 }, // Context & memory, across a col
  { x: 825, y: 578, h: 1000, sx: 75, sy: 75 }, // Permissions, at the end of a ridge
  { x: 807, y: 345, h: 1050, sx: 85, sy: 85 }, // Multi-agent, a twin summit
  // Surrounding ranges, mostly beyond the overview frame.
  { x: -200, y: 350, h: 1100, sx: 200, sy: 220 },
  { x: 1250, y: 420, h: 1200, sx: 200, sy: 220 },
  { x: 1150, y: -50, h: 1500, sx: 220, sy: 200 },
  { x: -120, y: -80, h: 1300, sx: 220, sy: 200 },
  { x: 1200, y: 950, h: 600, sx: 180, sy: 150 },
  { x: -150, y: 900, h: 650, sx: 180, sy: 150 },
];

export function heightAt(x: number, y: number): number {
  let h = FLOOR + TILT * (1000 - y);
  for (const b of BUMPS) {
    const u = (x - b.x) / b.sx;
    const v = (y - b.y) / b.sy;
    h += b.h * Math.exp(-0.5 * (u * u + v * v));
  }
  // A little relief so contours are not perfect ellipses.
  h += 22 * Math.sin(x / 57 + 1.3) * Math.cos(y / 71) + 14 * Math.sin((x + y) / 39 + 0.4);
  return h;
}

/**
 * `heightAt` sampled on a regular grid: `out[j * cols + i] = heightAt(x0 + i * step, y0 + j * step)`.
 * Same formula, factored by axis (each Gaussian and the ripple split into an x
 * part and a y part), so a large raster costs a few multiply-adds per cell
 * instead of a dozen `exp` calls.
 */
export function heightGrid(x0: number, y0: number, step: number, cols: number, rows: number): Float32Array {
  const n = BUMPS.length;
  const gx = new Float64Array(n * cols);
  const gy = new Float64Array(n * rows);
  for (let b = 0; b < n; b++) {
    const { x, y, h, sx, sy } = BUMPS[b];
    for (let i = 0; i < cols; i++) {
      const u = (x0 + i * step - x) / sx;
      gx[b * cols + i] = h * Math.exp(-0.5 * u * u);
    }
    for (let j = 0; j < rows; j++) {
      const v = (y0 + j * step - y) / sy;
      gy[b * rows + j] = Math.exp(-0.5 * v * v);
    }
  }
  // 22 sin(x/57 + 1.3) cos(y/71) + 14 sin(x/39 + 0.4 + y/39), the second term expanded.
  const r1 = new Float64Array(cols);
  const sa = new Float64Array(cols);
  const ca = new Float64Array(cols);
  for (let i = 0; i < cols; i++) {
    const x = x0 + i * step;
    r1[i] = 22 * Math.sin(x / 57 + 1.3);
    sa[i] = 14 * Math.sin(x / 39 + 0.4);
    ca[i] = 14 * Math.cos(x / 39 + 0.4);
  }
  const out = new Float32Array(cols * rows);
  const col = new Float64Array(n);
  for (let j = 0; j < rows; j++) {
    const y = y0 + j * step;
    const base = FLOOR + TILT * (1000 - y);
    const cy = Math.cos(y / 71);
    const cb = Math.cos(y / 39);
    const sb = Math.sin(y / 39);
    for (let b = 0; b < n; b++) col[b] = gy[b * rows + j];
    const o = j * cols;
    for (let i = 0; i < cols; i++) {
      let h = base + r1[i] * cy + sa[i] * cb + ca[i] * sb;
      for (let b = 0; b < n; b++) h += gx[b * cols + i] * col[b];
      out[o + i] = h;
    }
  }
  return out;
}

/** Elevation rounded the way a map prints it. */
export function elevationLabel(x: number, y: number): string {
  return `${(Math.round(heightAt(x, y) / 10) * 10).toLocaleString('en-US')} m`;
}

/** World area the terrain is drawn over. */
export const TERRAIN_EXTENT = { x0: -700, y0: -600, x1: 1700, y1: 1550 };
/** Inner area that gets fine (50 m) contours for close-up views. */
export const DETAIL_EXTENT = { x0: -150, y0: -80, x1: 1150, y1: 1100 };

export const CONTOUR_INTERVAL = 100;
export const INDEX_INTERVAL = 500;
export const MINOR_INTERVAL = 50;
