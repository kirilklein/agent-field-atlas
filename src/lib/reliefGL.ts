import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { BRANCH_CURVES, LANDMARKS, MAIN_ROUTE, TRAILHEAD, landmarkById } from '../data/map';
import { DETAIL_EXTENT, heightAt } from '../data/terrain';
import type { Point } from '../data/types';
import type { Size } from './camera';
import { PLATES as RELIEF } from './hillshade';
import { Trees } from './reliefProps';
import type { Theme } from './theme';
import { FOV, MESH, liftAt, liftOf, type Framing, type View } from './relief';

/**
 * The WebGL half of the relief model (loaded on demand with three).
 *
 * The surface carries the same plate as the flat map. The paper and shaded
 * relief come from a texture; everything drawn as a line (graticule, contours,
 * trails) is drawn by the fragment shader at a fixed width in screen pixels,
 * the way the SVG's non-scaling strokes are, so lines stay crisp at every
 * distance and the hand-over to the SVG at the end of a flight matches.
 */

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

type RGB = [number, number, number];
type Plate = {
  paper: RGB; grid: RGB; contour: RGB; index: RGB; minor: RGB; copper: RGB; walked: RGB; branch: RGB; pine: RGB; head: RGB;
  /** Multiplied into slopes turned from the light. */
  shadow: RGB;
  /** Slopes facing the light lean towards this. */
  light: RGB;
  /** Line opacities, as the SVG strokes. */
  gridA: number; contourA: number; indexA: number; minorA: number;
};

/** Same colours as the SVG plate (index.css). */
const PLATES: Record<Theme, Plate> = {
  light: {
    paper: rgb('#f7e4c8'), grid: rgb('#3b2340'), contour: rgb('#3b2340'), index: rgb('#3b2340'), minor: rgb('#3b2340'),
    copper: rgb('#e8552f'), walked: rgb('#c23b2a'), branch: rgb('#5c3a5e'), pine: rgb('#3b2340'), head: rgb('#3b2340'),
    shadow: rgb('#b9a3b8'), light: rgb('#fff4d6'),
    gridA: 0.1, contourA: 0.2, indexA: 0.42, minorA: 0.1,
  },
  dark: {
    paper: rgb('#1d1530'), grid: rgb('#fdeee0'), contour: rgb('#fdeee0'), index: rgb('#fdeee0'), minor: rgb('#fdeee0'),
    copper: rgb('#ff7a52'), walked: rgb('#ffc58f'), branch: rgb('#e6cfd8'), pine: rgb('#fdeee0'), head: rgb('#ff9d78'),
    shadow: rgb('#6a5a8a'), light: rgb('#3a2d55'),
    gridA: 0.06, contourA: 0.16, indexA: 0.34, minorA: 0.08,
  },
};

/** The flat map's tint ramp, padded to RAMP_N stops for the shader. */
const RAMP_N = 7;
const reliefUniforms = (theme: Theme) => {
  const { ramp, shadow, light, lightMax, bandMix } = RELIEF[theme];
  const stops = Array.from({ length: RAMP_N }, (_, i) => ramp[Math.min(i, ramp.length - 1)]);
  return {
    rampH: { value: stops.map(([h]) => h) },
    rampC: { value: stops.flatMap(([, c]) => c.map((v) => v / 255)) },
    rampN: { value: ramp.length },
    rShadow: { value: shadow.map((v) => v / 255) },
    rLight: { value: light.map((v) => v / 255) },
    lightMax: { value: lightMax },
    bandMix: { value: bandMix },
  };
};

const plateUniforms = (p: Plate) => ({
  cPaper: { value: p.paper }, cGrid: { value: p.grid }, cContour: { value: p.contour }, cIndex: { value: p.index },
  cMinor: { value: p.minor }, cCopper: { value: p.copper }, cWalked: { value: p.walked }, cBranch: { value: p.branch },
  cPine: { value: p.pine }, cHead: { value: p.head }, cShadow: { value: p.shadow }, cLight: { value: p.light },
  gridA: { value: p.gridA }, contourA: { value: p.contourA }, indexA: { value: p.indexA }, minorA: { value: p.minorA },
});

/** Trail distance field: covers the trail network with a margin, at TRAIL_RES world units per texel. */
const TRAIL_BOX = { x0: 150, y0: 130, x1: 880, y1: 1000 };
const TRAIL_RES = 1;
/** Distances are exact within RANGE world units of a line; FAR beyond. */
const RANGE = 24;
const FAR = 1000;
/** Side of the coarse triangles the model is lit by, in world units. */
const FACET = 34;

const VERT = /* glsl */ `
attribute float h;
attribute vec2 grad;
attribute vec2 hgrad;
uniform float exag;
varying vec2 vW;
varying float vH;
varying vec2 vG;
varying vec3 vN;
varying float vDepth;
void main() {
  vec3 p = position;
  p.y *= exag;
  vW = position.xz;
  vH = h;
  vG = hgrad;
  vN = normalize(vec3(-exag * grad.x, 1.0, -exag * grad.y));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
#define RAMP_N ${RAMP_N}
uniform sampler2D trails;
uniform vec4 meshBox;   // x0, y0, w, h
uniform vec4 trailBox;  // x0, y0, w, h
uniform float dpr;
uniform vec3 lightDir;
uniform float shadow;
uniform float highlight;
uniform float edge;
uniform vec2 haze;      // depth at which haze starts, strength
uniform float hazeFar;
uniform vec3 cPaper, cGrid, cContour, cIndex, cCopper, cWalked, cBranch, cPine, cHead, cShadow, cLight, cMinor;
uniform float gridA, contourA, indexA, minorA;
uniform float rampH[RAMP_N];
uniform vec3 rampC[RAMP_N];
uniform float rampN, lightMax, bandMix, exag;
uniform vec3 rShadow, rLight;
uniform vec2 trailhead;
uniform float minor;
uniform vec4 detailBox; // x0, y0, x1, y1
varying vec2 vW;
varying float vH;
varying vec2 vG;
varying vec3 vN;
varying float vDepth;

// Hypsometric tint, as hillshade.ts.
vec3 tint(float h) {
  float f = h / 500.0;
  float e = h + ((floor(f) + smoothstep(0.72, 1.0, fract(f))) * 500.0 - h) * bandMix;
  vec3 col = rampC[0];
  for (int i = 0; i < RAMP_N - 1; i++) {
    if (float(i) < rampN - 1.0 && (i == 0 || e > rampH[i]))
      col = mix(rampC[i], rampC[i + 1], clamp((e - rampH[i]) / (rampH[i + 1] - rampH[i]), 0.0, 1.0));
  }
  return col;
}

// Coverage of a line of width w (CSS px) at distance d (device px) from its centre.
float line(float d, float w) {
  return clamp(w * dpr * 0.5 + 0.5 - d, 0.0, 1.0);
}

void main() {
  // The flat map's shaded relief (hillshade.ts), lit from the north-west at 40 degrees.
  vec3 col = tint(vH);
  vec2 dz = vG * 0.07;
  float inv = 1.0 / length(vec3(dz, 1.0));
  float rel = (0.54168 * (dz.x + dz.y) + 0.64279) * inv - 0.64279;
  float c = 0.7 + 0.55 * smoothstep(300.0, 2400.0, vH);
  col = mix(col, rShadow, min(0.5, (max(-rel, 0.0) * 1.1 + (1.0 - inv) * 0.1) * c));
  col = mix(col, rLight, min(lightMax, max(rel, 0.0) * 2.4 * c));

  // Graticule every 125 world units.
  vec2 g = abs(fract(vW / 125.0 + 0.5) - 0.5) * 125.0;
  float gx = g.x / max(length(vec2(dFdx(vW.x), dFdy(vW.x))), 1e-5);
  float gy = g.y / max(length(vec2(dFdx(vW.y), dFdy(vW.y))), 1e-5);
  col = mix(col, cGrid, max(line(gx, 0.6), line(gy, 0.6)) * gridA);

  // Contours every 100 m, index contours every 500 m.
  float hg = max(length(vec2(dFdx(vH), dFdy(vH))), 1e-5);
  float d100 = abs(fract(vH / 100.0 + 0.5) - 0.5) * 100.0 / hg;
  float d500 = abs(fract(vH / 500.0 + 0.5) - 0.5) * 500.0 / hg;
  // Fine 50 m contours fade in when close, as on the flat map (inside its detail area).
  if (minor > 0.0 && vW.x > detailBox.x && vW.y > detailBox.y && vW.x < detailBox.z && vW.y < detailBox.w) {
    float d50 = abs(fract(vH / 50.0 + 0.5) - 0.5) * 50.0 / hg;
    col = mix(col, cMinor, line(d50, 0.5) * minorA * minor);
  }
  col = mix(col, cContour, line(d100, 0.75) * contourA);
  col = mix(col, cIndex, line(d500, 1.3) * indexA);

  // Trails, from the distance field. Widths are in screen px at the local scale.
  vec2 ex = dFdx(vW);
  vec2 ey = dFdy(vW);
  float upx = sqrt(max(abs(ex.x * ey.y - ex.y * ey.x), 1e-10)); // world units per device px
  vec2 tuv = (vW - trailBox.xy) / trailBox.zw;
  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
    vec4 t = texture2D(trails, tuv);
    vec3 px = t.rga / upx;                   // device px to the main trail, a branch, a walked stretch
    float css = 1.0 / (upx * dpr);           // CSS px per world unit
    // Branch dashes, 7 on 6 off in CSS px from the branch's start, round caps.
    float ph = mod(t.b * css, 13.0);
    float along = ph < 7.0 ? 0.0 : min(ph - 7.0, 13.0 - ph);
    float dash = length(vec2(along * dpr, px.y));
    // In the model the main trail is a road; it narrows to the printed trail as the model flattens.
    col = mix(col, cPaper, max(line(px.x, mix(10.0, 19.0, exag)), line(px.y, 8.0)));
    col = mix(col, cBranch, line(dash, 2.0));
    col = mix(col, cCopper, line(px.x, mix(3.4, 11.0, exag)));
    bool onMain = t.r <= t.g + 0.01;
    col = mix(col, onMain ? cWalked : cPine, onMain ? line(px.z, mix(4.4, 11.0, exag)) : line(max(px.z, dash), 2.6));
    col = mix(col, cPaper, line(px.x, 1.4) * exag * 0.9);
  }

  // The trailhead (dot and ring), as the SVG.
  float th = length(vW - trailhead) / upx;
  col = mix(col, cHead, max(line(th, 10.0), line(abs(th - 10.0 * dpr), 1.0)));

  // Light from the north-west, as the hillshade. Flat ground is untouched, so
  // the model flattened is exactly the printed plate. Slopes turned away take a
  // cool sage-slate wash, slopes facing the light warm towards the card, the way
  // a shaded relief is printed in tinted inks rather than grey.
  vec3 n = normalize(vN);
  float k = dot(n, lightDir) - lightDir.y;
  float sh = smoothstep(0.0, 0.75, -k);
  float hi = smoothstep(0.0, 0.35, k);
  col = mix(col, col * cShadow, sh * shadow);
  col = mix(col, cLight, hi * highlight);

  // The model settles into the page at its edges, and far ground hazes towards it.
  float e = min(min(vW.x - meshBox.x, meshBox.x + meshBox.z - vW.x), min(vW.y - meshBox.y, meshBox.y + meshBox.w - vW.y));
  float a = smoothstep(0.0, edge, e);
  float hz = clamp((vDepth - haze.x) / max(hazeFar - haze.x, 1.0), 0.0, 1.0) * haze.y;
  col = mix(cPaper, col, a * (1.0 - hz));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ----- trail polylines ----- */

function cubic(a: Point, c1: Point, c2: Point, b: Point, n: number, out: Point[]) {
  for (let i = out.length ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return out;
}

/** The same curves as geometry.ts: one polyline per stretch. */
function stretches(): { id: string; kind: 'main' | 'branch'; pts: Point[] }[] {
  const out: { id: string; kind: 'main' | 'branch'; pts: Point[] }[] = [];
  let prev: Point = TRAILHEAD;
  for (const id of MAIN_ROUTE) {
    const l = landmarkById[id];
    const dy = (prev.y - l.y) * 0.5;
    out.push({ id, kind: 'main', pts: cubic(prev, { x: prev.x, y: prev.y - dy }, { x: l.x, y: l.y + dy }, l, 64, []) });
    prev = l;
  }
  for (const l of LANDMARKS) {
    if (l.kind !== 'branch' || !l.from) continue;
    const c = BRANCH_CURVES[l.id as keyof typeof BRANCH_CURVES];
    out.push({ id: l.id, kind: 'branch', pts: cubic(landmarkById[l.from], c.c1, c.c2, c.to, 64, []) });
  }
  return out;
}

/** Nearest-distance raster of polylines (world units) into channel `ch`; optionally the arc length there into `sch`. */
function rasterize(data: Float32Array, W: number, H: number, ch: number, lines: Point[][], sch = -1) {
  const b = TRAIL_BOX;
  for (const pts of lines) {
    let s0 = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const c = pts[i];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const len = Math.hypot(dx, dy);
      const l2 = Math.max(1e-9, len * len);
      const i0 = Math.max(0, Math.floor((Math.min(a.x, c.x) - RANGE - b.x0) / TRAIL_RES));
      const i1 = Math.min(W - 1, Math.ceil((Math.max(a.x, c.x) + RANGE - b.x0) / TRAIL_RES));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, c.y) - RANGE - b.y0) / TRAIL_RES));
      const j1 = Math.min(H - 1, Math.ceil((Math.max(a.y, c.y) + RANGE - b.y0) / TRAIL_RES));
      for (let j = j0; j <= j1; j++) {
        const y = b.y0 + j * TRAIL_RES;
        for (let i = i0; i <= i1; i++) {
          const x = b.x0 + i * TRAIL_RES;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
          const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
          const o = (j * W + i) * 4;
          if (d < data[o + ch]) {
            data[o + ch] = d;
            if (sch >= 0) data[o + sch] = s0 + t * len;
          }
        }
      }
      s0 += len;
    }
  }
}

/**
 * The trails as a distance field, sampled by the shader: R distance to the main
 * trail, G to a branch, B arc length along that branch (for its dashes), A to a
 * walked stretch. Lines are then drawn at fixed screen widths, like the SVG's.
 */
function trailField(walked: Set<string>) {
  const W = Math.round((TRAIL_BOX.x1 - TRAIL_BOX.x0) / TRAIL_RES) + 1;
  const H = Math.round((TRAIL_BOX.y1 - TRAIL_BOX.y0) / TRAIL_RES) + 1;
  const f = new Float32Array(W * H * 4).fill(FAR);
  const all = stretches();
  rasterize(f, W, H, 0, all.filter((s) => s.kind === 'main').map((s) => s.pts));
  rasterize(f, W, H, 1, all.filter((s) => s.kind === 'branch').map((s) => s.pts), 2);
  rasterize(f, W, H, 3, all.filter((s) => walked.has(s.id)).map((s) => s.pts));
  const half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = DataUtils.toHalfFloat(f[i]);
  return { data: half, W, H };
}

/* ----- the model ----- */

function terrainGeometry(segs: number): BufferGeometry {
  const w = MESH.x1 - MESH.x0;
  const hgt = MESH.y1 - MESH.y0;
  const nx = segs;
  const ny = Math.round((segs * hgt) / w);
  const sx = w / nx;
  const sy = hgt / ny;
  const n = (nx + 1) * (ny + 1);
  const pos = new Float32Array(n * 3);
  const h = new Float32Array(n);
  const grad = new Float32Array(n * 2);
  const hgrad = new Float32Array(n * 2);
  const lift = new Float32Array((nx + 3) * (ny + 3));
  const hgt0 = new Float32Array((nx + 3) * (ny + 3));
  for (let j = -1; j <= ny + 1; j++) {
    for (let i = -1; i <= nx + 1; i++) {
      const x = MESH.x0 + i * sx;
      const y = MESH.y0 + j * sy;
      const k = (j + 1) * (nx + 3) + (i + 1);
      hgt0[k] = heightAt(x, y);
      lift[k] = liftOf(hgt0[k], x, y);
    }
  }
  const L = (i: number, j: number) => lift[(j + 1) * (nx + 3) + (i + 1)];
  // Low-poly light: slopes of a coarse triangulation, FACET world units on a side.
  const cx = Math.ceil(w / FACET) + 1;
  const cy = Math.ceil(hgt / FACET) + 1;
  const coarse = new Float32Array(cx * cy);
  for (let j = 0; j < cy; j++) {
    for (let i = 0; i < cx; i++) {
      const x = MESH.x0 + i * FACET;
      const y = MESH.y0 + j * FACET;
      coarse[j * cx + i] = liftOf(heightAt(x, y), x, y);
    }
  }
  const C = (i: number, j: number) => coarse[Math.min(j, cy - 1) * cx + Math.min(i, cx - 1)];
  const M = (i: number, j: number) => hgt0[(j + 1) * (nx + 3) + (i + 1)];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = MESH.x0 + i * sx;
      const y = MESH.y0 + j * sy;
      pos[k * 3] = x;
      pos[k * 3 + 1] = L(i, j);
      pos[k * 3 + 2] = y;
      h[k] = hgt0[(j + 1) * (nx + 3) + (i + 1)];
      hgrad[k * 2] = (M(i + 1, j) - M(i - 1, j)) / (2 * sx);
      hgrad[k * 2 + 1] = (M(i, j + 1) - M(i, j - 1)) / (2 * sy);
      const u = (x - MESH.x0) / FACET;
      const v = (y - MESH.y0) / FACET;
      const ci = Math.min(cx - 2, Math.floor(u));
      const cj = Math.min(cy - 2, Math.floor(v));
      if (u - ci + (v - cj) < 1) {
        grad[k * 2] = (C(ci + 1, cj) - C(ci, cj)) / FACET;
        grad[k * 2 + 1] = (C(ci, cj + 1) - C(ci, cj)) / FACET;
      } else {
        grad[k * 2] = (C(ci + 1, cj + 1) - C(ci, cj + 1)) / FACET;
        grad[k * 2 + 1] = (C(ci + 1, cj + 1) - C(ci + 1, cj)) / FACET;
      }
    }
  }
  const idx = new Uint32Array(nx * ny * 6);
  let o = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.set([a, c, b, b, c, d], o);
      o += 6;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('h', new BufferAttribute(h, 1));
  g.setAttribute('grad', new BufferAttribute(grad, 2));
  g.setAttribute('hgrad', new BufferAttribute(hgrad, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export class ReliefGL {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 10000);
  private mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private trees: Trees;
  private trails: DataTexture | null = null;
  private size: Size = { w: 1, h: 1 };
  private dpr = 1;
  private exag = 1;
  private groundY = 0;
  private v = new Vector3();
  private last: View | null = null;
  /** The flat overview's scale (px per world unit): fine contours show from 1.35× it. */
  overviewK = 1;

  constructor(canvas: HTMLCanvasElement, { small }: { small: boolean }) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer = new WebGLRenderer({
      // Shaders draw every line with their own antialiasing; MSAA only softens the silhouette.
      canvas,
      antialias: this.dpr < 1.5,
      alpha: false,
      powerPreference: 'high-performance',
      // A software renderer (GPU blocklisted) would make the page crawl: stay flat.
      failIfMajorPerformanceCaveat: true,
    });
    this.renderer.setPixelRatio(this.dpr);

    const light = new Vector3(-0.5, Math.SQRT1_2, -0.5).normalize();
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        trails: { value: null },
        meshBox: { value: [MESH.x0, MESH.y0, MESH.x1 - MESH.x0, MESH.y1 - MESH.y0] },
        // Texel centres sit on the grid points the field was sampled at.
        trailBox: {
          value: [
            TRAIL_BOX.x0 - TRAIL_RES / 2,
            TRAIL_BOX.y0 - TRAIL_RES / 2,
            TRAIL_BOX.x1 - TRAIL_BOX.x0 + TRAIL_RES,
            TRAIL_BOX.y1 - TRAIL_BOX.y0 + TRAIL_RES,
          ],
        },
        dpr: { value: this.dpr },
        exag: { value: 1 },
        lightDir: { value: light },
        shadow: { value: 0.75 },
        highlight: { value: 0.55 },
        edge: { value: 260 },
        haze: { value: [0, 0] },
        hazeFar: { value: 1 },
        ...plateUniforms(PLATES.light),
        ...reliefUniforms('light'),
        minor: { value: 0 },
        detailBox: { value: [DETAIL_EXTENT.x0, DETAIL_EXTENT.y0, DETAIL_EXTENT.x1, DETAIL_EXTENT.y1] },
        trailhead: { value: new Vector2(TRAILHEAD.x, TRAILHEAD.y) },
      },
    });
    this.mesh = new Mesh(terrainGeometry(small ? 224 : 448), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.trees = new Trees(this.scene, stretches().map((s) => s.pts), light);
  }

  /** Compile the shader off the main thread where the browser can (KHR_parallel_shader_compile). */
  async prepare() {
    if (this.renderer.extensions.has('KHR_parallel_shader_compile')) await this.renderer.compileAsync(this.scene, this.camera);
  }

  setTheme(theme: Theme) {
    const plate = PLATES[theme];
    const u = this.mesh.material.uniforms;
    for (const [k, v] of Object.entries({ ...plateUniforms(plate), ...reliefUniforms(theme) })) u[k].value = v.value;
    this.renderer.setClearColor(new Color().setRGB(...plate.paper, SRGBColorSpace), 1);
    this.trees.setTheme(theme);
  }

  /** (Re)draw the trail field: on load, and when lessons are visited. */
  paint(walked: string) {
    const f = trailField(new Set(walked.split(',').filter(Boolean)));
    const tex = new DataTexture(f.data, f.W, f.H, RGBAFormat, HalfFloatType);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    this.trails?.dispose();
    this.trails = tex;
    this.mesh.material.uniforms.trails.value = tex;
  }

  resize(stage: Size) {
    this.size = stage;
    this.renderer.setSize(stage.w, stage.h, false);
  }

  private aim(v: View) {
    const { w, h } = this.size;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.near = Math.max(1, v.d * 0.15);
    cam.far = v.d * 3 + 3000;
    cam.setViewOffset(w, h, -v.sx, -v.sy, w, h);
    cam.updateProjectionMatrix();
    const st = Math.sin(v.theta);
    cam.position.set(v.tx + v.d * st * Math.sin(v.phi), v.ty + v.d * Math.cos(v.theta), v.tz + v.d * st * Math.cos(v.phi));
    // Screen-up is the way the camera faces across the ground: no roll as it turns.
    cam.up.set(-Math.sin(v.phi), 0, -Math.cos(v.phi));
    cam.lookAt(v.tx, v.ty, v.tz);
    cam.updateMatrixWorld();
    this.exag = v.exag;
    this.groundY = v.ty;
  }

  draw(v: View) {
    this.last = v;
    this.aim(v);
    const u = this.mesh.material.uniforms;
    u.exag.value = v.exag;
    // The same zoom fade as the flat map's fine contours, from the scale at the target.
    const k = this.size.h / (2 * Math.tan(rad(FOV) / 2)) / v.d;
    u.minor.value = Math.min(1, Math.max(0, (k / this.overviewK - 1.35) / 0.55));
    // Haze only when looking across the model, none when looking straight down.
    const s = Math.min(1, Math.sin(v.theta) / Math.sin(rad(45)));
    u.haze.value = [v.d * 0.95, 0.42 * s * s];
    u.hazeFar.value = v.d * 2.1;
    this.trees.setExag(v.exag);
    this.renderer.render(this.scene, this.camera);
  }

  /** World point on the surface → stage px, through the last drawn view. */
  /** Stage point → world point where its ray meets the ground at the camera's target height. */
  unproject(p: Point): Point | null {
    const { w, h } = this.size;
    const cam = this.camera;
    const v = this.v.set((p.x / w) * 2 - 1, 1 - (p.y / h) * 2, 0.5).unproject(cam);
    const o = cam.position;
    const dy = v.y - o.y;
    if (dy > -1e-6) return null;
    const t = (this.groundY - o.y) / dy;
    return { x: o.x + (v.x - o.x) * t, y: o.z + (v.z - o.z) * t };
  }

  project(p: Point): Point {
    const v = this.v.set(p.x, liftAt(p.x, p.y) * this.exag, p.y).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.size.w, y: ((1 - v.y) / 2) * this.size.h };
  }

  /**
   * The overview view: tilted by `theta`, at the distance and lens shift that
   * fit `points` (and their labels' padding) inside the free part of the stage.
   */
  fit(fr: Framing): View {
    const pts = fr.points;
    const x0 = Math.min(...pts.map((p) => p.x));
    const x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y));
    const y1 = Math.max(...pts.map((p) => p.y));
    const ty = pts.reduce((s, p) => s + liftAt(p.x, p.y), 0) / pts.length;
    const base: View = { tx: (x0 + x1) / 2, ty, tz: (y0 + y1) / 2, d: 1000, theta: fr.theta, phi: 0, sx: 0, sy: 0, exag: 1 };
    const fw = fr.free.x1 - fr.free.x0 - fr.pad.l - fr.pad.r;
    const fh = fr.free.y1 - fr.free.y0 - fr.pad.t - fr.pad.b;
    const box = (d: number) => {
      this.aim({ ...base, d });
      const s = pts.map((p) => this.project(p));
      return {
        x0: Math.min(...s.map((p) => p.x)),
        x1: Math.max(...s.map((p) => p.x)),
        y0: Math.min(...s.map((p) => p.y)),
        y1: Math.max(...s.map((p) => p.y)),
      };
    };
    let lo = 50;
    let hi = 40000;
    for (let i = 0; i < 40; i++) {
      const m = Math.sqrt(lo * hi);
      const b = box(m);
      if (b.x1 - b.x0 <= fw && b.y1 - b.y0 <= fh) hi = m;
      else lo = m;
    }
    const f = this.size.h / (2 * Math.tan(rad(FOV) / 2));
    const d = Math.max(hi, f / fr.kMax);
    const b = box(d);
    const cx = (fr.free.x0 + fr.pad.l + fr.free.x1 - fr.pad.r) / 2;
    const cy = (fr.free.y0 + fr.pad.t + fr.free.y1 - fr.pad.b) / 2;
    if (this.last) this.aim(this.last);
    return { ...base, d, sx: cx - (b.x0 + b.x1) / 2, sy: cy - (b.y0 + b.y1) / 2 };
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.trails?.dispose();
    this.trees.dispose();
    this.renderer.dispose();
    // Hand the context back now rather than at garbage collection.
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
  }
}
