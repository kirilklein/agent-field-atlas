import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A tiny timeline for the field insets. A story is a list of steps; each step
 * animates for `move` ms (t goes 0 → 1, eased) and then rests until `ms`.
 * Drawings are pure functions of (step, t), so reduced motion, scrubbing and
 * pausing are all the same thing: pick a step and set t = 1.
 */
export type Step = { caption: string; ms?: number; move?: number };

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

export function useStory(steps: Step[], reduced: boolean, first = 0, autoplay = true) {
  const n = steps.length;
  const [step, setStepState] = useState(first);
  const [t, setT] = useState(reduced || !autoplay ? 1 : 0);
  const [playing, setPlaying] = useState(!reduced && autoplay);
  const [fading, setFading] = useState(false);
  const start = useRef(0);
  const raf = useRef(0);

  // Restart the clock whenever the step changes or playback resumes.
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!playing || reduced) {
      setT(1);
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
      } else if (step < n - 1) {
        setT(0);
        setStepState(step + 1);
      } else {
        // End of the story: fade, then start over.
        setFading(true);
        window.setTimeout(() => {
          setFading(false);
          setStepState(0);
          setT(0);
        }, LOOP_FADE_MS);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, playing, reduced, n]);

  /** Jump to a step and show it finished; pauses playback. */
  const goTo = useCallback(
    (k: number) => {
      cancelAnimationFrame(raf.current);
      setPlaying(false);
      setFading(false);
      setStepState(Math.max(0, Math.min(n - 1, k)));
      setT(1);
    },
    [n],
  );
  const toggle = useCallback(() => {
    setFading(false);
    setPlaying((p) => {
      // Resuming at the very end starts over.
      if (!p && step === n - 1) {
        setStepState(0);
        setT(0);
      }
      return !p;
    });
  }, [step, n]);
  const replay = useCallback(() => {
    setFading(false);
    setStepState(0);
    setT(0);
    setPlaying(true);
  }, []);

  return { step, t, playing, fading, goTo, toggle, replay };
}
