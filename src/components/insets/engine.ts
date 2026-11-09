import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A tiny timeline for the field insets. A story is a list of steps; each step
 * animates for `move` ms (t goes 0 → 1, eased) and then rests until `ms`.
 * Drawings are pure functions of (step, t), so reduced motion, scrubbing and
 * pausing are all the same thing: pick a step and set t = 1.
 */
/**
 * `still` is the t a paused or reduced-motion frame shows (default 1, the end
 * of the move). Pick it so the frame still shows what moved: a chip in flight
 * reads better than an empty wire after it has arrived and faded.
 */
export type Step = { caption: string; ms?: number; move?: number; still?: number };

const DEFAULT_MS = 2600;
const DEFAULT_MOVE = 1000;
const LOOP_FADE_MS = 420;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress of a sub-interval [a, b] of t, clamped and eased. */
export const seg = (t: number, a: number, b: number) => easeInOut(clamp01((t - a) / (b - a)));

/** Progress of event `k` given the current step: 0 before it, t during it, 1 after. */
export const at = (step: number, t: number, k: number) => (step > k ? 1 : step === k ? t : 0);

export type Pt = { x: number; y: number };

/** Point on a quadratic Bézier from a to b with control point c. */
export function qbez(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Point on a circle; angles in degrees, 0° = east, clockwise on screen. */
export function onCircle(cx: number, cy: number, r: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path along a circle from deg a to deg b (clockwise). */
export function arcPath(cx: number, cy: number, r: number, a: number, b: number): string {
  if (b - a >= 359.99) b = a + 359.99;
  const p = onCircle(cx, cy, r, a);
  const q = onCircle(cx, cy, r, b);
  const large = b - a > 180 ? 1 : 0;
  return `M${p.x.toFixed(2)} ${p.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
}

/** A little shake for refusals: 0 at the ends, oscillating in between. */
export const shake = (t: number) => Math.sin(t * Math.PI * 6) * (1 - t) * 4;

export type Range = { from: number; to: number };

type Options = {
  reduced: boolean;
  /** Steps to play; the rest stay reachable with the arrows and dots. */
  range?: Range | null;
  autoplay?: boolean;
  /** Start over at the end of the range; otherwise rest on its last step. */
  loop?: boolean;
};

export const stillOf = (steps: Step[], k: number) => steps[k]?.still ?? 1;

export function useStory(steps: Step[], { reduced, range = null, autoplay = true, loop = true }: Options) {
  const n = steps.length;
  const from = Math.max(0, Math.min(n - 1, range?.from ?? 0));
  const to = Math.max(from, Math.min(n - 1, range?.to ?? n - 1));
  const play0 = !reduced && autoplay;
  const [step, setStepState] = useState(from);
  const [t, setT] = useState(play0 ? 0 : stillOf(steps, from));
  const [playing, setPlaying] = useState(play0);
  const [fading, setFading] = useState(false);
  const start = useRef(0);
  const raf = useRef(0);
  const timer = useRef(0);

  // Restart the clock whenever the step changes or playback resumes.
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!playing || reduced) {
      setT(stillOf(steps, step));
      return;
    }
    const s = steps[step];
    const move = s.move ?? DEFAULT_MOVE;
    const ms = Math.max(move + 600, s.ms ?? DEFAULT_MS);
    start.current = performance.now();
    const tick = (now: number) => {
      const e = now - start.current;
      setT(easeInOut(clamp01(e / move)));
      if (e < ms) {
        raf.current = requestAnimationFrame(tick);
      } else if (step < to) {
        setT(0);
        setStepState(step + 1);
      } else if (!loop || step > to) {
        // Played through (or wandered past the range): rest on this frame.
        setPlaying(false);
      } else {
        // End of the range: fade, then start over.
        setFading(true);
        timer.current = window.setTimeout(() => {
          setFading(false);
          setStepState(from);
          setT(0);
        }, LOOP_FADE_MS);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, playing, reduced, n, from, to, loop]);

  /** Jump to a step and show its still frame; pauses playback. */
  const goTo = useCallback(
    (k: number) => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(timer.current);
      const j = Math.max(0, Math.min(n - 1, k));
      setPlaying(false);
      setFading(false);
      setStepState(j);
      setT(stillOf(steps, j));
    },
    [n, steps],
  );
  const toggle = useCallback(() => {
    setFading(false);
    setPlaying((p) => {
      // Resuming at (or past) the end of the range starts the range over.
      if (!p && (step >= to || step < from)) {
        setStepState(from);
        setT(0);
      } else if (!p) {
        setT(0);
      }
      return !p;
    });
  }, [step, from, to]);
  const replay = useCallback(() => {
    window.clearTimeout(timer.current);
    setFading(false);
    setStepState(from);
    setT(0);
    setPlaying(true);
  }, [from]);

  return { step, t, playing, fading, from, to, goTo, toggle, replay };
}
