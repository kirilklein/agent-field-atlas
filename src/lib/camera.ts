import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Point } from '../data/types';
import type { Box } from './geometry';

/** cx, cy: the world point at the centre of the stage. k: screen px per world unit. */
export type Cam = { cx: number; cy: number; k: number };
export type Size = { w: number; h: number };
export type Insets = { left: number; right: number; top: number; bottom: number };

export const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

export function toScreen(cam: Cam, stage: Size, p: Point): Point {
  return { x: (p.x - cam.cx) * cam.k + stage.w / 2, y: (p.y - cam.cy) * cam.k + stage.h / 2 };
}

/** Camera that puts world point `anchor` at screen point `at` with zoom k. */
export function camAt(anchor: Point, at: Point, k: number, stage: Size): Cam {
  return { cx: anchor.x - (at.x - stage.w / 2) / k, cy: anchor.y - (at.y - stage.h / 2) / k, k };
}

/**
 * Fit a world box inside the unobstructed part of the stage, leaving `pad` screen
 * pixels around it for labels (labels don't scale, so padding is in screen space).
 */
export function fit(box: Box, stage: Size, insets: Insets, pad: { x: number; y: number }, kMax: number): Cam {
  const rx0 = insets.left;
  const ry0 = insets.top;
  const rw = Math.max(80, stage.w - insets.left - insets.right);
  const rh = Math.max(80, stage.h - insets.top - insets.bottom);
  const bw = Math.max(1, box.x1 - box.x0);
  const bh = Math.max(1, box.y1 - box.y0);
  const k = Math.min(kMax, Math.max(0.05, (rw - 2 * pad.x) / bw), Math.max(0.05, (rh - 2 * pad.y) / bh));
  const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  return camAt(centre, { x: rx0 + rw / 2, y: ry0 + rh / 2 }, k, stage);
}

export function toWorld(cam: Cam, stage: Size, p: Point): Point {
  return { x: (p.x - stage.w / 2) / cam.k + cam.cx, y: (p.y - stage.h / 2) / cam.k + cam.cy };
}

/** Zoom to k while keeping the world point under screen point `at` fixed. */
export function zoomAbout(cam: Cam, stage: Size, at: Point, k: number): Cam {
  return camAt(toWorld(cam, stage, at), at, k, stage);
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const CAMERA_MS = 540;

/**
 * One camera, driven by a target derived from the route.
 *
 * Moves interpolate zoom geometrically and move the anchor (the selected
 * landmark) in a straight line on screen, so the anchor stays in view for the
 * whole move. A new target mid-flight restarts from wherever the camera is,
 * which keeps camera and content in sync under fast clicks and Back.
 *
 * `moveKey` changes when the route changes; a target change without a new key
 * (a resize) jumps instead of animating. `instant`: something else (the 3D
 * terrain) animates this move, so the flat camera jumps straight to the target.
 */
export function useCamera(target: Cam, anchor: Point, stage: Size, moveKey: string, reduced: boolean, instant = false) {
  const [cam, setCam] = useState<Cam>(target);
  const [progress, setProgress] = useState(1);
  const camRef = useRef<Cam>(target);
  const lastKey = useRef(moveKey);
  const raf = useRef(0);

  const tk = `${target.cx.toFixed(3)}|${target.cy.toFixed(3)}|${target.k.toFixed(5)}`;

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const animate = lastKey.current !== moveKey && !reduced && !instant;
    lastKey.current = moveKey;

    if (!animate) {
      camRef.current = target;
      setCam(target);
      setProgress(1);
      return;
    }

    const from = camRef.current;
    const a0 = toScreen(from, stage, anchor);
    const a1 = toScreen(target, stage, anchor);
    const start = performance.now();
    setProgress(0);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / CAMERA_MS);
      const e = ease(t);
      const k = from.k * Math.pow(target.k / from.k, e);
      const at = { x: a0.x + (a1.x - a0.x) * e, y: a0.y + (a1.y - a0.y) * e };
      const next = t >= 1 ? target : camAt(anchor, at, k, stage);
      camRef.current = next;
      setCam(next);
      setProgress(t);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // `tk` captures the target's value; the object itself is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tk, moveKey, reduced]);

  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  /** Free camera (user pan / zoom): set immediately, cancelling any move in flight. */
  const set = useCallback((next: Cam) => {
    cancelAnimationFrame(raf.current);
    camRef.current = next;
    setCam(next);
    setProgress(1);
  }, []);

  /** Free camera, eased over a short time (buttons, keys, recenter). */
  const tweenTo = useCallback((next: Cam, ms = 220) => {
    cancelAnimationFrame(raf.current);
    setProgress(1);
    if (reducedRef.current || ms <= 0) {
      camRef.current = next;
      setCam(next);
      return;
    }
    const from = camRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const e = ease(t);
      const c: Cam =
        t >= 1
          ? next
          : {
              k: from.k * Math.pow(next.k / from.k, e),
              cx: from.cx + (next.cx - from.cx) * e,
              cy: from.cy + (next.cy - from.cy) * e,
            };
      camRef.current = c;
      setCam(c);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  const getCam = useCallback(() => camRef.current, []);

  return { cam, progress, set, tweenTo, getCam };
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ w: 1, h: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
