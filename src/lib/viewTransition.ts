import { flushSync } from 'react-dom';
import type { Route } from './route';

const depthOf = (r: Route) => (r.concept ? 2 : r.region ? 1 : 0);

/**
 * Route changes as View Transitions, scoped to the sheets.
 *
 * The map camera flies frame by frame in JS, and a view transition shows the old
 * page as a frozen snapshot. So the stage gets its own transition name with no
 * animation and its old snapshot hidden: what shows is the live stage, flying,
 * while only the cards (and one shared title) cross-fade and slide above it.
 *
 * Names are applied only while a transition runs (`html.is-vt`), so the
 * stacking of the page is untouched the rest of the time.
 */

const SHARED = 'atlas-title';
let running = 0;

/**
 * Wide layouts only: on phones the sheets sit below the map and the page
 * scrolls to them as the route changes, which a snapshot-based transition
 * would fight. They keep their CSS entrance there.
 */
const canTransition = () =>
  typeof document !== 'undefined' &&
  typeof document.startViewTransition === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !window.matchMedia('(max-width: 899px)').matches;

/** A map label that is actually on screen (not under a card, not panned away). */
function visible(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  if (r.width === 0 || x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
  const hit = document.elementFromPoint(x, y);
  return hit && (el.contains(hit) || hit.contains(el) || el.parentElement?.contains(hit)) ? el : null;
}

/**
 * The shared title: a name on the map that lifts off into the sheet that opens.
 * Only going down a level: the destination is then a heading in a sheet that
 * stays put. Going up, the destination would be a label riding on the flying
 * camera, which a transition can only aim at where it was, so it is left out.
 */
function shared(prev: Route, next: Route): [() => HTMLElement | null, () => HTMLElement | null] | null {
  const q = (s: string) => document.querySelector<HTMLElement>(s);
  if (depthOf(prev) === 0 && depthOf(next) === 1) {
    return [() => visible(q(`[data-landmark="${next.region}"] .lm__title`)), () => q('.region-card__place')];
  }
  if (depthOf(prev) === 1 && depthOf(next) === 2 && prev.region === next.region) {
    return [() => visible(q(`[data-concept="${next.concept}"] .stop__label`)), () => q('.wb__title')];
  }
  return null;
}

/** Apply a route change, as a view transition where the browser supports one. */
export function transitionRoute(prev: Route, next: Route, apply: () => void) {
  if (!canTransition()) {
    apply();
    return;
  }
  const root = document.documentElement;
  const pair = shared(prev, next);
  const from = pair ? pair[0]() : null;
  if (from) from.style.viewTransitionName = SHARED;
  root.classList.add('is-vt');
  running++;

  let to: HTMLElement | null = null;
  const vt = document.startViewTransition(() => {
    if (from) from.style.viewTransitionName = '';
    flushSync(apply);
    if (from && pair) {
      to = pair[1]();
      if (to) to.style.viewTransitionName = SHARED;
    }
  });
  vt.finished.finally(() => {
    if (to) to.style.viewTransitionName = '';
    if (--running === 0) {
      root.classList.remove('is-vt');
    }
  });
}
