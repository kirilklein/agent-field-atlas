import { BRANCH_CURVES, LANDMARKS, MAIN_ROUTE, TRAILHEAD, landmarkById } from '../data/map';
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

/** A short, slightly bowed spur from a landmark to one of its concept stops: start, control, end. */
export function spurCurve(l: Landmark, i: number): [Point, Point, Point] {
  const p = stopPoint(l, i);
  const c = { x: (l.x + p.x) / 2 - (p.y - l.y) * 0.18, y: (l.y + p.y) / 2 + (p.x - l.x) * 0.18 };
  return [{ x: l.x, y: l.y }, c, p];
}

export function spurPath(l: Landmark, i: number): string {
  const [a, c, b] = spurCurve(l, i);
  return `M ${f(a.x)} ${f(a.y)} Q ${f(c.x)} ${f(c.y)} ${f(b.x)} ${f(b.y)}`;
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

export const TERRAIN = (() => {
  const grid = sampleGrid(heightAt, TERRAIN_EXTENT, 12);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of grid.v) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];

  const major: ContourLevel[] = [];
  for (let level = Math.ceil(lo / CONTOUR_INTERVAL) * CONTOUR_INTERVAL; level < hi; level += CONTOUR_INTERVAL) {
    const lines = contourLines(grid, level).map((l) => simplify(l, 0.8)).filter((l) => l.length > 2);
    const index = level % INDEX_INTERVAL === 0;
    major.push({ level, index, d: lines.map(smoothPath).join(' ') });
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
  return { major, minor: minorParts.join(' ') };
})();
