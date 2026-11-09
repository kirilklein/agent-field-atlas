import { heightAt } from '../data/terrain';
import type { Point } from '../data/types';
import { ease, type Cam, type Size } from './camera';
import type { Theme } from './theme';

/**
 * The overview as a relief model: the same height field, raised and seen at an
 * angle, with the plate draped over it. This module drives it (phases, flights,
 * idle drift) without importing three; the WebGL side (`reliefGL.ts`) is loaded
 * on demand, so the first paint is always the flat map.
 *
 * Phases:
 * - flat:   the SVG map is in charge; the canvas is hidden and not rendering.
 * - relief: the model is showing. On the overview it drifts slowly; once it
 *           follows a camera (`follow`), it is that flat camera tilted.
 * - up:     lifting from the flat map into the model, once it is ready.
 *
 * The lift starts exactly where the flat camera is: looking straight down with
 * the exaggeration at 0, a perspective camera at distance f/k shows the plane
 * at the same scale and position as the SVG's `toScreen`. The flat map stays
 * only where the model can't run (no WebGL 2, reduced motion).
 */

/** World area the model covers (most of TERRAIN_EXTENT; the plate fades out before its edges). */
export const MESH = { x0: -620, y0: -540, x1: 1620, y1: 1480 };
/** Vertical field of view, degrees. Narrow: a model photographed with a long lens. */
export const FOV = 30;
/** World units per metre of height at full exaggeration. */
const Z_SCALE = 0.105;
const BASE_H = 220;
/** World units over which the relief settles to the page at the mesh edges. */
const EDGE = 300;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Height of the model's surface above the page at world point (x, y), full exaggeration. */
export function liftAt(x: number, y: number): number {
  return liftOf(heightAt(x, y), x, y);
}

/** The same, for a height `h` already known at (x, y). */
export function liftOf(h: number, x: number, y: number): number {
  const e = Math.min(x - MESH.x0, MESH.x1 - x, y - MESH.y0, MESH.y1 - y);
  return Math.max(0, h - BASE_H) * Z_SCALE * smooth(e / EDGE);
}

/** A camera orbiting target (tx, ty, tz): tilt theta from vertical, turn phi, lens shift (sx, sy) px. */
export type View = { tx: number; ty: number; tz: number; d: number; theta: number; phi: number; sx: number; sy: number; exag: number };

/** What the overview must show, and where on the stage. */
export type Framing = {
  free: { x0: number; y0: number; x1: number; y1: number };
  /** Screen px kept clear around the points, for their labels (most labels sit to the right). */
  pad: { l: number; r: number; t: number; b: number };
  /** Largest scale (px per world unit) at the target, as the flat overview's cap. */
  kMax: number;
  /** The flat overview's scale, which the fine contours' fade is relative to. */
  overviewK: number;
  theta: number;
  points: Point[];
};

export type Phase = 'flat' | 'relief' | 'up';
export type ReliefState = { available: boolean; ready: boolean; phase: Phase; turned: boolean };

type GL = import('./reliefGL').ReliefGL;

const rad = (deg: number) => (deg * Math.PI) / 180;
const FLIGHT_MS = 980;
/** Idle drift and parallax amplitudes. */
const DRIFT_PHI = rad(2.4);
const DRIFT_THETA = rad(1.1);
const LOOK_PHI = rad(1.8);
const LOOK_THETA = rad(1.1);
/** Tilt from straight down that turning may reach. */
const TILT = { lo: rad(15), hi: rad(65) };
/** The idle drift settles after this long without the pointer moving, and rendering stops. */
const DRIFT_MS = 45_000;

/** Can this browser make a WebGL 2 context at all? (Checked once, just before loading.) */
function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

function mix(a: View, b: View, e: number): View {
  const l = (p: number, q: number) => p + (q - p) * e;
  return {
    tx: l(a.tx, b.tx),
    ty: l(a.ty, b.ty),
    tz: l(a.tz, b.tz),
    d: a.d * Math.pow(b.d / a.d, e),
    theta: l(a.theta, b.theta),
    phi: l(a.phi, b.phi),
    sx: l(a.sx, b.sx),
    sy: l(a.sy, b.sy),
    exag: l(a.exag, b.exag),
  };
}

export class Relief {
  private listeners = new Set<() => void>();
  private state: ReliefState;
  private flightT = 1;
  private frame = { n: 0, showing: false };

  private gl: GL | null = null;
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private loading = false;
  private mounted = false;
  private stage: Size = { w: 1, h: 1 };
  private framing: Framing | null = null;
  private base: View | null = null;
  /** The flat camera the model follows, tilted; null on the overview's own framing. */
  private cam: Cam | null = null;
  private view: View | null = null;
  private walked = '';
  private theme: Theme = 'light';
  private paintedWalked = '';

  private orbit = { phi: 0, theta: 0 };
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private flight: { from: View; to: View | null; start: number; ms: number } | null = null;
  private clock = performance.now();
  private raf = 0;
  private lastDraw = 0;
  private busyUntil = 0;
  private awakeUntil = 0;
  private amp = 0;
  private ampAt = 0;
  private hidden = typeof document !== 'undefined' && document.hidden;
  private offscreen = false;
  private io: IntersectionObserver | null = null;
  private repaintTimer = 0;
  private fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

  constructor() {
    this.state = { available: typeof window !== 'undefined' && 'WebGL2RenderingContext' in window, ready: false, phase: 'flat', turned: false };
  }

  /** From an effect: start listening (StrictMode may unmount and mount again). */
  mount() {
    this.mounted = true;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Free everything on the GPU and stop. */
  unmount() {
    this.mounted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.clearTimeout(this.repaintTimer);
    this.shutdown();
  }

  /* ----- React bindings (useSyncExternalStore) ----- */

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getState = () => this.state;
  /** Progress of the flight in the air (1 when none). Changes every frame only while flying. */
  getFlight = () => this.flightT;
  /** Changes every rendered frame: subscribers that follow the model (labels). */
  getFrame = () => this.frame;

  private emit() {
    for (const l of this.listeners) l();
  }
  private setState(patch: Partial<ReliefState>) {
    const next = { ...this.state, ...patch };
    const s = this.state;
    if (s.available === next.available && s.ready === next.ready && s.phase === next.phase && s.turned === next.turned) return;
    this.state = next;
    this.frame = { n: this.frame.n + 1, showing: next.ready && next.phase !== 'flat' };
    this.emit();
  }

  get showing() {
    return this.state.ready && this.state.phase !== 'flat';
  }

  /* ----- lifecycle ----- */

  /** Ref callback for the element the model's canvas goes in. */
  attach = (host: HTMLElement | null) => {
    if (host === this.host) return;
    this.io?.disconnect();
    this.io = null;
    this.release();
    this.host = host;
    if (host && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(([e]) => {
        this.offscreen = !e.isIntersecting;
        this.kick();
      });
      this.io.observe(host);
    }
  };

  /** Start loading three and building the model (no-op if loaded, loading or unavailable). */
  load() {
    if (this.gl || this.loading || !this.host || !this.state.available || !this.mounted) return;
    if (!webglAvailable()) {
      this.fail();
      return;
    }
    this.loading = true;
    const host = this.host;
    import('./reliefGL')
      .then(async (mod) => {
        // Let the flat map finish its first frames before the heavy work.
        await new Promise((r) => setTimeout(r, 60));
        if (!this.mounted || this.host !== host || !this.state.available) return;
        const canvas = document.createElement('canvas');
        canvas.style.opacity = '0';
        canvas.addEventListener('webglcontextlost', this.onLost);
        host.append(canvas);
        this.canvas = canvas;
        const small = Math.min(this.stage.w, this.stage.h) < 600;
        const gl = new mod.ReliefGL(canvas, { small });
        gl.setTheme(this.theme);
        // Separate tasks, so the flat map stays responsive while the model is built.
        const alive = () => this.mounted && this.canvas === canvas;
        await new Promise((r) => setTimeout(r, 0));
        if (!alive()) return gl.dispose();
        gl.paint(this.walked);
        await gl.prepare();
        if (!alive()) return gl.dispose();
        this.paintedWalked = this.walked;
        this.gl = gl;
        gl.resize(this.stage);
        this.refit();
        this.setState({ ready: true });
      })
      .catch((err) => {
        console.warn('Relief model unavailable; staying on the flat map.', err);
        this.fail();
      })
      .finally(() => {
        this.loading = false;
      });
  }

  /** Stop: unmount, or reduced motion. */
  shutdown() {
    this.release();
    this.setState({ ready: false, phase: 'flat' });
  }

  private fail() {
    this.release();
    this.setState({ available: false, ready: false, phase: 'flat' });
  }

  /** Free the GPU: dispose the model and drop its canvas. */
  private release() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.flight = null;
    this.flightT = 1;
    this.view = null;
    const canvas = this.canvas;
    this.canvas = null;
    if (canvas) canvas.removeEventListener('webglcontextlost', this.onLost);
    if (this.gl) {
      this.gl.dispose();
      this.gl = null;
    }
    canvas?.remove();
    this.base = null;
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.fail();
  };

  private onVisibility = () => {
    this.hidden = document.hidden;
    // No frames while hidden: land a flight in progress at once.
    if (this.hidden && this.flight) {
      this.flight = null;
      this.flightT = 1;
      if (this.state.phase === 'up') this.setState({ phase: 'relief' });
    }
    this.kick(true);
  };

  /* ----- layout ----- */

  setLayout(stage: Size, framing: Framing) {
    this.stage = stage;
    this.framing = framing;
    if (!this.gl) return;
    this.gl.resize(stage);
    this.refit();
    this.kick(true);
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    if (!this.gl) return;
    this.gl.setTheme(theme);
    this.kick(true);
  }

  setWalked(walked: string) {
    this.walked = walked;
    if (this.gl && walked !== this.paintedWalked) this.schedulePaint(900);
  }

  private schedulePaint(ms: number) {
    window.clearTimeout(this.repaintTimer);
    this.repaintTimer = window.setTimeout(() => {
      if (!this.gl) return;
      this.gl.paint(this.walked);
      this.paintedWalked = this.walked;
      this.kick(true);
    }, ms);
  }

  private refit() {
    if (!this.gl || !this.framing || this.stage.w < 2) return;
    this.gl.overviewK = this.framing.overviewK;
    this.base = this.gl.fit(this.framing);
  }

  /** The flat camera as a view: straight down, flat, at the distance that gives scale k. */
  private flatView(cam: Cam): View {
    const f = this.stage.h / (2 * Math.tan(rad(FOV) / 2));
    return { tx: cam.cx, ty: 0, tz: cam.cy, d: f / cam.k, theta: 0, phi: 0, sx: 0, sy: 0, exag: 0 };
  }

  /** The flat camera tilted: the same ground point at the centre, the same scale there. */
  private tilted(cam: Cam): View {
    const f = this.stage.h / (2 * Math.tan(rad(FOV) / 2));
    const theta = this.framing?.theta ?? rad(52);
    return { tx: cam.cx, ty: liftAt(cam.cx, cam.cy), tz: cam.cy, d: f / cam.k, theta, phi: 0, sx: 0, sy: 0, exag: 1 };
  }

  /** The idle drift's amplitude: eases up to 1 while awake and back to 0 after. */
  private drift(now: number) {
    const dt = Math.min(100, Math.max(0, now - this.ampAt));
    this.ampAt = now;
    this.amp = Math.min(1, Math.max(0, this.amp + (now < this.awakeUntil ? dt : -dt) / 4000));
    return this.amp;
  }

  private wake() {
    this.awakeUntil = performance.now() + DRIFT_MS;
  }

  private live(now: number): View | null {
    if (this.cam) {
      const v = this.tilted(this.cam);
      return { ...v, phi: v.phi + this.orbit.phi, theta: v.theta + this.orbit.theta };
    }
    const b = this.base;
    if (!b) return null;
    const s = (now - this.clock) / 1000;
    const a = smooth(this.drift(now));
    return {
      ...b,
      phi: b.phi + this.orbit.phi + a * DRIFT_PHI * Math.sin((2 * Math.PI * s) / 30) + this.look.x * LOOK_PHI,
      theta: b.theta + this.orbit.theta + a * DRIFT_THETA * Math.sin((2 * Math.PI * s) / 23 + 1.1) + this.look.y * LOOK_THETA,
    };
  }

  /* ----- moves ----- */

  /** Follow the flat camera `cam` (null: back to the overview's framing). Switching eases between the two. */
  follow(cam: Cam | null) {
    const switched = (cam === null) !== (this.cam === null);
    this.cam = cam;
    if (switched) this.glide(500);
    this.kick(true);
  }

  /** Ease from wherever the model is to where it should be now (a route change). */
  glide(ms = FLIGHT_MS) {
    if (!this.gl || this.state.phase !== 'relief') return;
    const now = performance.now();
    const from = this.view ?? this.live(now);
    if (!from) return;
    this.flight = { from, to: null, start: now, ms };
    this.kick(true);
  }

  /** Lift into the model: from the flat camera `from` (when flat) or from mid-flight. */
  rise(from: Cam, ms = FLIGHT_MS) {
    if (!this.gl || !this.base) return;
    const now = performance.now();
    const start = this.state.phase === 'flat' ? this.flatView(from) : (this.view ?? this.flatView(from));
    this.flight = { from: start, to: null, start: now, ms };
    this.flightT = 0;
    this.wake();
    // The first frame is the flat camera's own picture, so it can show at once.
    this.gl.draw(start);
    this.view = start;
    if (this.canvas) this.canvas.style.opacity = '1';
    this.setState({ phase: 'up' });
    this.kick(true);
  }

  /** Turn the model by dPhi (bearing, free) and tilt it by dTheta (clamped), in radians. */
  turn(dPhi: number, dTheta: number) {
    if (this.state.phase !== 'relief') return;
    const base = (this.cam ? this.framing?.theta : this.base?.theta) ?? rad(52);
    this.orbit.phi = Math.atan2(Math.sin(this.orbit.phi + dPhi), Math.cos(this.orbit.phi + dPhi));
    this.orbit.theta = Math.min(TILT.hi - base, Math.max(TILT.lo - base, this.orbit.theta + dTheta));
    this.busyUntil = performance.now() + 400;
    this.wake();
    if (!this.state.turned) this.setState({ turned: true });
    this.kick(true);
  }

  /** Screen angle of north in degrees (0: north is up), for the compass. */
  northAngle(): number {
    const v = this.view;
    if (!this.gl || !v || !this.showing) return 0;
    const a = this.gl.project({ x: v.tx, y: v.tz });
    const b = this.gl.project({ x: v.tx, y: v.tz - 60 });
    return (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI;
  }

  /** Recenter: ease the turn back to the default view. */
  resetTurn() {
    if (!this.base || this.state.phase !== 'relief') return;
    const now = performance.now();
    const from = this.view ?? this.live(now);
    this.orbit = { phi: 0, theta: 0 };
    if (from) {
      this.flight = { from, to: null, start: now, ms: 520 };
    }
    this.setState({ turned: false });
    this.kick(true);
  }

  /** Pointer position over the stage, -1..1 from the centre (parallax). Null when it leaves. */
  lookAt(nx: number | null, ny = 0) {
    if (!this.fine || this.cam) return;
    this.look.tx = nx === null ? 0 : Math.max(-1, Math.min(1, nx));
    this.look.ty = nx === null ? 0 : Math.max(-1, Math.min(1, ny));
    if (nx !== null) this.wake();
    this.kick();
  }

  /** World point → stage point through the model's current camera. */
  project = (p: Point): Point => (this.gl ? this.gl.project(p) : p);
  /** Stage point → the world point on the ground under it, through the model's current camera. */
  unproject = (p: Point): Point | null => (this.gl ? this.gl.unproject(p) : null);

  /* ----- render loop ----- */

  /** Make sure a frame is coming. `now`: draw it even if the model has settled. */
  private kick(now = false) {
    if (now) this.lastDraw = 0;
    if (this.raf || !this.gl || !this.showing || this.hidden) return;
    if (this.offscreen && !this.flight) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const gl = this.gl;
    if (!gl || !this.showing || this.hidden) return;
    const { phase } = this.state;

    // Parallax eases towards the pointer.
    const lx = this.look.tx - this.look.x;
    const ly = this.look.ty - this.look.y;
    const looking = Math.abs(lx) + Math.abs(ly) > 0.002;
    this.look.x += lx * 0.07;
    this.look.y += ly * 0.07;

    let v: View | null;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.start) / f.ms);
      const to = f.to ?? this.live(now);
      if (!to) return;
      v = t >= 1 ? to : mix(f.from, to, ease(t));
      if (t >= 1) {
        this.flight = null;
        this.flightT = 1;
        if (phase === 'up') this.setState({ phase: 'relief' });
      } else if (phase === 'up') {
        this.flightT = t;
      }
    } else {
      const interacting = looking || now < this.busyUntil;
      const drifting = !this.cam && (now < this.awakeUntil || this.amp > 0);
      // Settled: draw once more where it rests, then stop until something moves.
      if (!interacting && !drifting && this.lastDraw !== 0 && (this.cam || this.lastDraw > this.awakeUntil)) return;
      // Idle drift: 30 fps is plenty for motion this slow.
      if (!interacting && now - this.lastDraw < 30) {
        this.raf = requestAnimationFrame(this.tick);
        return;
      }
      v = this.live(now);
    }
    if (!v) return;
    this.lastDraw = now;
    gl.draw(v);
    this.view = v;
    if (this.canvas) this.canvas.style.opacity = '1';
    this.frame = { n: this.frame.n + 1, showing: true };
    this.emit();
    if (!this.offscreen || this.flight) this.raf = requestAnimationFrame(this.tick);
  };
}
