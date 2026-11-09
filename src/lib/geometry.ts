import { BRANCH_CURVES, LANDMARKS, MAIN_ROUTE, TERRAIN_NAMES, TRAILHEAD, landmarkById } from '../data/map';
import {
  CONTOUR_INTERVAL,
  DETAIL_EXTENT,
  INDEX_INTERVAL,
  MINOR_INTERVAL,
  TERRAIN_EXTENT,
  heightAt,
} from '../data/terrain';
import { contourLines, polyPath, sampleGrid, simplify, smoothPath } from './contours';
import type { Landmark, Point, RegionId } from '../data/types';

const f = (n: number) => Math.round(n * 10) / 10;

/** S-curve between two points: leave and arrive vertically, so the trail climbs. */
function climb(a: Point, b: Point): string {
  const dy = (a.y - b.y) * 0.5;
  return `C ${f(a.x)} ${f(a.y - dy)} ${f(b.x)} ${f(b.y + dy)} ${f(b.x)} ${f(b.y)}`;
}

export type Stretch = { id: RegionId; d: string; kind: 'main' | 'branch' };

/** One stretch per landmark: the part of the trail that leads to it. */
export const STRETCHES: Stretch[] = (() => {
  const out: Stretch[] = [];
  let prev: Point = TRAILHEAD;
  for (const id of MAIN_ROUTE) {
    const l = landmarkById[id];
    out.push({ id, kind: 'main', d: `M ${f(prev.x)} ${f(prev.y)} ${climb(prev, l)}` });
    prev = l;
  }
  for (const l of LANDMARKS) {
    if (l.kind !== 'branch' || !l.from) continue;
    const from = landmarkById[l.from];
    const c = BRANCH_CURVES[l.id as keyof typeof BRANCH_CURVES];
    out.push({
      id: l.id,
      kind: 'branch',
      d: `M ${f(from.x)} ${f(from.y)} C ${f(c.c1.x)} ${f(c.c1.y)} ${f(c.c2.x)} ${f(c.c2.y)} ${f(c.to.x)} ${f(c.to.y)}`,
    });
  }
  return out;
})();

export const MAIN_TRAIL_D = (() => {
  let d = `M ${TRAILHEAD.x} ${TRAILHEAD.y}`;
  let prev: Point = TRAILHEAD;
  for (const id of MAIN_ROUTE) {
    const l = landmarkById[id];
    d += ` ${climb(prev, l)}`;
    prev = l;
  }
  return d;
})();

export function stopPoint(l: Landmark, i: number): Point {
  const c = l.concepts[i];
  return { x: l.x + c.dx, y: l.y + c.dy };
}

/** A short, slightly bowed spur from a landmark to one of its concept stops. */
export function spurPath(l: Landmark, i: number): string {
  const p = stopPoint(l, i);
  const mx = (l.x + p.x) / 2;
  const my = (l.y + p.y) / 2;
  const nx = -(p.y - l.y) * 0.18;
  const ny = (p.x - l.x) * 0.18;
  return `M ${f(l.x)} ${f(l.y)} Q ${f(mx + nx)} ${f(my + ny)} ${f(p.x)} ${f(p.y)}`;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

export function boxOf(points: Point[]): Box {
  return {
    x0: Math.min(...points.map((p) => p.x)),
    y0: Math.min(...points.map((p) => p.y)),
    x1: Math.max(...points.map((p) => p.x)),
    y1: Math.max(...points.map((p) => p.y)),
  };
}

export const ATLAS_BOX: Box = boxOf([TRAILHEAD, ...LANDMARKS]);

export function regionBox(l: Landmark): Box {
  return boxOf([l, ...l.concepts.map((_, i) => stopPoint(l, i))]);
}

/* ----- Terrain ------------------------------------------------------------ */

/** Points along every drawn route, used to keep contour labels off the trails. */
function sampleCubic(a: Point, c1: Point, c2: Point, b: Point, n = 16): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

const ROUTE_POINTS: Point[] = (() => {
  const pts: Point[] = [];
  let prev: Point = TRAILHEAD;
  for (const id of MAIN_ROUTE) {
    const l = landmarkById[id];
    const dy = (prev.y - l.y) * 0.5;
    pts.push(...sampleCubic(prev, { x: prev.x, y: prev.y - dy }, { x: l.x, y: l.y + dy }, l));
    prev = l;
  }
  for (const l of LANDMARKS) {
    if (l.kind !== 'branch' || !l.from) continue;
    const c = BRANCH_CURVES[l.id as keyof typeof BRANCH_CURVES];
    pts.push(...sampleCubic(landmarkById[l.from], c.c1, c.c2, c.to));
  }
  for (const l of LANDMARKS) l.concepts.forEach((_, i) => pts.push(stopPoint(l, i)));
  pts.push(...TERRAIN_NAMES);
  return pts;
})();

function cubicLength(a: Point, c1: Point, c2: Point, b: Point): number {
  const pts = sampleCubic(a, c1, c2, b, 96);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/**
 * Arc length along the main trail from the Trailhead to each main landmark, as a
 * fraction of the whole trail (the summit is 1). The intro uses it to stamp each
 * landmark exactly when the drawing trail reaches it.
 */
export const { TRAIL_LENGTH, TRAIL_FRACTIONS } = (() => {
  const cum: [RegionId, number][] = [];
  let prev: Point = TRAILHEAD;
  let total = 0;
  for (const id of MAIN_ROUTE) {
    const l = landmarkById[id];
    const dy = (prev.y - l.y) * 0.5;
    total += cubicLength(prev, { x: prev.x, y: prev.y - dy }, { x: l.x, y: l.y + dy }, l);
    cum.push([id, total]);
    prev = l;
  }
  return {
    TRAIL_LENGTH: total,
    TRAIL_FRACTIONS: Object.fromEntries(cum.map(([id, s]) => [id, s / total])) as Partial<Record<RegionId, number>>,
  };
})();

/** Length of each optional branch in world units (its stretch from the junction). */
export const BRANCH_LENGTHS: Partial<Record<RegionId, number>> = Object.fromEntries(
  LANDMARKS.filter((l) => l.kind === 'branch' && l.from).map((l) => {
    const c = BRANCH_CURVES[l.id as keyof typeof BRANCH_CURVES];
    return [l.id, cubicLength(landmarkById[l.from!], c.c1, c.c2, c.to)];
  }),
);

export type ContourLevel = { level: number; index: boolean; d: string };
export type ContourLabel = { x: number; y: number; angle: number; text: string; level: number };

export const TERRAIN = (() => {
  const grid = sampleGrid(heightAt, TERRAIN_EXTENT, 12);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of grid.v) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];

  const major: ContourLevel[] = [];
  const labels: ContourLabel[] = [];
  for (let level = Math.ceil(lo / CONTOUR_INTERVAL) * CONTOUR_INTERVAL; level < hi; level += CONTOUR_INTERVAL) {
    const lines = contourLines(grid, level).map((l) => simplify(l, 0.8)).filter((l) => l.length > 2);
    const index = level % INDEX_INTERVAL === 0;
    major.push({ level, index, d: lines.map(smoothPath).join(' ') });
    if (index) labels.push(...placeLabels(lines, level));
  }

  const fine = sampleGrid(heightAt, DETAIL_EXTENT, 7);
  const minorParts: string[] = [];
  for (let level = Math.ceil(lo / MINOR_INTERVAL) * MINOR_INTERVAL; level < hi; level += MINOR_INTERVAL) {
    if (level % CONTOUR_INTERVAL === 0) continue;
    for (const line of contourLines(fine, level)) {
      const s = simplify(line, 0.6);
      if (s.length > 2) minorParts.push(polyPath(s));
    }
  }
  return { major, minor: minorParts.join(' '), labels };
})();

/** Up to two labels per index contour, inside the overview and clear of routes and names. */
function placeLabels(lines: Point[][], level: number): ContourLabel[] {
  const text = level.toLocaleString('en-US');
  const box = { x0: ATLAS_BOX.x0 - 60, x1: ATLAS_BOX.x1 + 120, y0: ATLAS_BOX.y0 - 20, y1: ATLAS_BOX.y1 - 40 };
  const candidates: { p: Point; angle: number; clearance: number }[] = [];
  for (const line of lines) {
    for (let i = 2; i < line.length - 2; i++) {
      const p = line[i];
      if (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1) continue;
      const clearance = Math.min(...ROUTE_POINTS.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      if (clearance < 70) continue;
      const a = line[i - 2];
      const b = line[i + 2];
      let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      if (Math.abs(angle) > 50) continue;
      candidates.push({ p, angle, clearance });
    }
  }
  candidates.sort((a, b) => b.clearance - a.clearance);
  const picked: ContourLabel[] = [];
  for (const c of candidates) {
    if (picked.length === 2) break;
    if (picked.some((q) => Math.hypot(q.x - c.p.x, q.y - c.p.y) < 320)) continue;
    picked.push({ x: c.p.x, y: c.p.y, angle: c.angle, text, level });
  }
  return picked;
}
