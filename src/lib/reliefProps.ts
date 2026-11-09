import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  type Scene,
  type Vector3,
} from 'three';
import { LANDMARKS } from '../data/map';
import { heightAt } from '../data/terrain';
import type { Point } from '../data/types';
import { liftOf } from './relief';
import type { Theme } from './theme';

const COLORS: Record<Theme, { leaf: string; trunk: string; sky: string; ground: string }> = {
  light: { leaf: '#4f9a40', trunk: '#8a5a3c', sky: '#fff4e0', ground: '#8a6a8a' },
  dark: { leaf: '#6fae86', trunk: '#8a6a90', sky: '#d6ccff', ground: '#3a2d55' },
};

const MAX_TREES = 420;
/** Trees grow on the green terraces only, and keep clear of trails and landmarks. */
const MIN_H = 260;
const MAX_H = 1250;
const TRAIL_CLEAR = 16;
const LANDMARK_CLEAR = 42;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToLines(x: number, y: number, lines: Point[][]): number {
  let best = Infinity;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const dx = pts[i].x - a.x;
      const dy = pts[i].y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
  }
  return best;
}

type Spot = { x: number; y: number; lift: number; s: number; r: number };

/** Fixed spots: the same groves on every visit. */
function plant(trails: Point[][]): Spot[] {
  const rand = mulberry32(7);
  const xs = LANDMARKS.map((l) => l.x);
  const ys = LANDMARKS.map((l) => l.y);
  const x0 = Math.min(...xs) - 380;
  const x1 = Math.max(...xs) + 380;
  const y0 = Math.min(...ys) - 260;
  const y1 = Math.max(...ys) + 420;
  const out: Spot[] = [];
  for (let n = 0; n < 9000 && out.length < MAX_TREES; n++) {
    const x = x0 + rand() * (x1 - x0);
    const y = y0 + rand() * (y1 - y0);
    // Groves, not an even scatter.
    if (Math.sin(x * 0.021) * Math.sin(y * 0.017 + 1.3) + Math.sin((x + y) * 0.009) < 0.35) continue;
    const h = heightAt(x, y);
    if (h < MIN_H || h > MAX_H) continue;
    if (LANDMARKS.some((l) => Math.hypot(l.x - x, l.y - y) < LANDMARK_CLEAR)) continue;
    if (distToLines(x, y, trails) < TRAIL_CLEAR) continue;
    out.push({ x, y, lift: liftOf(h, x, y), s: 0.75 + rand() * 0.6, r: rand() * Math.PI * 2 });
  }
  return out;
}

/** Low-poly trees on the relief model. They stand at full height in the model and shrink away as it flattens into the map. */
export class Trees {
  private spots: Spot[];
  private leaf: InstancedMesh;
  private trunk: InstancedMesh;
  private hemi = new HemisphereLight();
  private sun = new DirectionalLight();
  private exag = -1;
  private o = new Object3D();

  constructor(scene: Scene, trails: Point[][], light: Vector3) {
    this.spots = plant(trails);
    const crown = new ConeGeometry(5.5, 13, 6).translate(0, 10.5, 0);
    const stem = new CylinderGeometry(1, 1.3, 4.5, 5).translate(0, 2.25, 0);
    this.leaf = new InstancedMesh(crown, new MeshLambertMaterial({ flatShading: true }), this.spots.length);
    this.trunk = new InstancedMesh(stem, new MeshLambertMaterial({ flatShading: true }), this.spots.length);
    this.sun.position.copy(light);
    this.hemi.intensity = 1.9;
    this.sun.intensity = 1.7;
    for (const m of [this.leaf, this.trunk]) {
      m.frustumCulled = false;
      scene.add(m);
    }
    scene.add(this.hemi, this.sun);
  }

  setTheme(theme: Theme) {
    const c = COLORS[theme];
    (this.leaf.material as MeshLambertMaterial).color = new Color(c.leaf);
    (this.trunk.material as MeshLambertMaterial).color = new Color(c.trunk);
    this.hemi.color = new Color(c.sky);
    this.hemi.groundColor = new Color(c.ground);
  }

  setExag(exag: number) {
    if (exag === this.exag) return;
    this.exag = exag;
    const visible = exag > 0.02;
    this.leaf.visible = this.trunk.visible = visible;
    if (!visible) return;
    const o = this.o;
    this.spots.forEach((t, i) => {
      o.position.set(t.x, t.lift * exag, t.y);
      o.rotation.set(0, t.r, 0);
      o.scale.setScalar(t.s * exag);
      o.updateMatrix();
      this.leaf.setMatrixAt(i, o.matrix);
      this.trunk.setMatrixAt(i, o.matrix);
    });
    this.leaf.instanceMatrix.needsUpdate = true;
    this.trunk.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.leaf, this.trunk]) {
      m.geometry.dispose();
      (m.material as MeshLambertMaterial).dispose();
      m.dispose();
    }
  }
}
