import { useEffect, useState, type CSSProperties } from 'react';
import { LANDMARKS, TERRAIN_NAMES } from '../data/map';
import type { RegionId } from '../data/types';
import { BRANCH_LENGTHS, TERRAIN, TRAIL_FRACTIONS, TRAIL_LENGTH } from './geometry';
import { parseHash } from './route';

/**
 * The opening of the overview: the plate is inked in front of you. Contours
 * print from the valley floor up over the shaded relief, the copper trail draws
 * itself from the Trailhead to the summit, each landmark is stamped as the pen
 * reaches it, the branches run out from their junctions, and the place names,
 * card and legend follow.
 *
 * Every time below is in milliseconds from the start of the sequence. Landmark
 * times are not hand-tuned: each is the moment the eased trail drawing reaches
 * that landmark's share of the trail's arc length.
 */

type Bezier = readonly [number, number, number, number];

/** The pen: gathers speed out of the valley, slows onto the summit. */
const TRAIL_EASE: Bezier = [0.42, 0, 0.32, 1];
/** Branches: already moving as they leave the junction, settling at the end. */
const BRANCH_EASE: Bezier = [0.25, 0.1, 0.25, 1];
const css = (b: Bezier) => `cubic-bezier(${b.join(', ')})`;

const bz = (p1: number, p2: number, u: number) => 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;

/** Share of the duration after which a CSS cubic-bezier easing reaches `progress`. */
function timeAt(e: Bezier, progress: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bz(e[1], e[3], mid) < progress) lo = mid;
    else hi = mid;
  }
  return bz(e[0], e[2], (lo + hi) / 2);
}

const round = Math.round;

const CONTOUR_SPREAD = 720; // first contour starts → last contour starts
const CONTOUR_MS = 520;
const RELIEF_AT = 80;
const RELIEF_MS = 1100;
const TRAILHEAD_AT = 300;
const TRAIL_AT = 420;
const TRAIL_MS = 1550;
const STAMP_MS = 520;
const BRANCH_LAG = 140; // a branch leaves once its junction has been stamped
const BRANCH_SPEED = 1.1; // ms per world unit, plus a fixed lead-in
const CARD_AT = 1560;
const CARD_MS = 640;
const NAMES_AT = 1700;
const NAMES_STAGGER = 90;
const NAMES_MS = 700;
const CHROME_AT = 2150;
const CHROME_MS = 460;

const LEVELS = TERRAIN.major.map((c) => c.level);
const LO = Math.min(...LEVELS);
const HI = Math.max(...LEVELS);

/** When the contour at `level` starts to fade in: low ground first. */
export function contourAt(level: number): number {
  return round(((level - LO) / Math.max(1, HI - LO)) * CONTOUR_SPREAD);
}

/**
 * A landmark's mark is ~19px in radius, about 20 world units at the overview
 * scale; the pen touches it that far before the landmark's centre.
 */
const MARK_RIM = 20;

/** When the trail's pen reaches the rim of a main landmark's mark. */
const reach = (id: RegionId) => {
  const share = Math.max(0, (TRAIL_FRACTIONS[id] ?? 1) - MARK_RIM / TRAIL_LENGTH);
  return round(TRAIL_AT + timeAt(TRAIL_EASE, share) * TRAIL_MS);
};

/** Each optional branch: when it starts drawing out of its junction, and for how long. */
export const BRANCH_AT: Partial<Record<RegionId, { at: number; ms: number }>> = Object.fromEntries(
  LANDMARKS.filter((l) => l.kind === 'branch' && l.from).map((l) => [
    l.id,
    { at: reach(l.from!) + BRANCH_LAG, ms: round(180 + (BRANCH_LENGTHS[l.id] ?? 250) * BRANCH_SPEED) },
  ]),
);

/** When each landmark is stamped: main ones as the trail reaches them, branch ends as their branch does. */
export const LANDMARK_AT = Object.fromEntries(
  LANDMARKS.map((l) => {
    const b = BRANCH_AT[l.id];
    if (!b) return [l.id, reach(l.id)];
    // The end marker is stamped as the eased branch drawing reaches its (smaller) rim.
    const share = 1 - (MARK_RIM * 0.75) / (BRANCH_LENGTHS[l.id] ?? 250);
    return [l.id, b.at + round(timeAt(BRANCH_EASE, share) * b.ms)];
  }),
) as Record<RegionId, number>;

export const NAME_AT: number[] = TERRAIN_NAMES.map((_, i) => NAMES_AT + i * NAMES_STAGGER);
export const TRAILHEAD_LABEL_AT = TRAILHEAD_AT + 140;
/** Elevation figures are printed just after their contour line. */
export const CONTOUR_LABEL_LAG = 260;

/** When everything has settled. */
export const INTRO_MS = Math.max(
  CHROME_AT + CHROME_MS,
  CARD_AT + CARD_MS,
  ...Object.values(LANDMARK_AT).map((t) => t + STAMP_MS),
  NAME_AT[NAME_AT.length - 1] + NAMES_MS,
);

export const ms = (n: number) => `${n}ms`;

/** The timeline, handed to the stylesheet. */
export const INTRO_VARS = {
  '--intro-contour-ms': ms(CONTOUR_MS),
  '--intro-relief-at': ms(RELIEF_AT),
  '--intro-relief-ms': ms(RELIEF_MS),
  '--intro-trailhead-at': ms(TRAILHEAD_AT),
  '--intro-trail-at': ms(TRAIL_AT),
  '--intro-trail-ms': ms(TRAIL_MS),
  '--intro-trail-ease': css(TRAIL_EASE),
  '--intro-branch-ease': css(BRANCH_EASE),
  '--intro-stamp-ms': ms(STAMP_MS),
  '--intro-names-ms': ms(NAMES_MS),
  '--intro-card-at': ms(CARD_AT),
  '--intro-card-ms': ms(CARD_MS),
  '--intro-chrome-at': ms(CHROME_AT),
  '--intro-chrome-ms': ms(CHROME_MS),
} as CSSProperties;

/* ----- Relief readiness ------------------------------------------------ */

// The shaded relief is computed on the main thread after first paint. The intro
// waits for it, so that work never stalls the drawing halfway through.
let reliefReady = false;
const waiting = new Set<() => void>();

export function markReliefReady() {
  reliefReady = true;
  waiting.forEach((f) => f());
  waiting.clear();
}

function whenReliefReady(f: () => void): () => void {
  if (reliefReady) {
    f();
    return () => {};
  }
  waiting.add(f);
  return () => waiting.delete(f);
}

/* ----- Phase ------------------------------------------------------------ */

/**
 * wait: first render, held at the blank plate (no flash of the finished map).
 * run: the sequence is playing.
 * done: finished or skipped; still the first overview, so nothing replays.
 * off: never played (deep link, reduced motion, seen this session), or navigated away.
 */
export type IntroPhase = 'wait' | 'run' | 'done' | 'off';

const SEEN_KEY = 'atlas:intro-seen';
const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function shouldPlay(): boolean {
  if (parseHash(window.location.hash).region) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    if (window.sessionStorage.getItem(SEEN_KEY)) return false;
  } catch {
    // Storage blocked: nothing to remember it with, so play it.
  }
  return true;
}

export function useIntro(enabled = true): IntroPhase {
  const [phase, setPhase] = useState<IntroPhase>(() => (enabled && shouldPlay() ? 'wait' : 'off'));
  const live = phase === 'wait' || phase === 'run';

  // Any input or scroll finishes it at once; leaving the overview ends it for good.
  useEffect(() => {
    if (phase === 'off') return;
    const skip = () => setPhase((p) => (p === 'wait' || p === 'run' ? 'done' : p));
    const leave = () => {
      if (parseHash(window.location.hash).region) setPhase('off');
    };
    if (live) for (const e of SKIP_EVENTS) window.addEventListener(e, skip, { passive: true, capture: true });
    window.addEventListener('hashchange', leave);
    return () => {
      for (const e of SKIP_EVENTS) window.removeEventListener(e, skip, { capture: true });
      window.removeEventListener('hashchange', leave);
    };
  }, [phase, live]);

  // Start once the relief is on the page (or stop waiting for it).
  useEffect(() => {
    if (phase !== 'wait') return;
    let raf = 0;
    const go = () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(raf);
      // Two frames, so the relief image has painted before the clock starts.
      raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setPhase((p) => (p === 'wait' ? 'run' : p)))));
    };
    const fallback = window.setTimeout(go, 1500);
    const cancel = whenReliefReady(go);
    return () => {
      cancel();
      window.clearTimeout(fallback);
      cancelAnimationFrame(raf);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'run') return;
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Not remembered: a reload plays it again.
    }
    const t = window.setTimeout(() => setPhase((p) => (p === 'run' ? 'done' : p)), INTRO_MS + 60);
    return () => window.clearTimeout(t);
  }, [phase]);

  return phase;
}
