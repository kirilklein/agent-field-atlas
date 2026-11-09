import { useCallback, useEffect, useRef, useState } from 'react';
import { landmarkById } from '../data/map';
import type { RegionId } from '../data/types';
import { transitionRoute } from './viewTransition';

export type Route = { region: RegionId | null; concept: string | null };

export const ATLAS: Route = { region: null, concept: null };

/**
 * Routes are plain `#name` fragments (`#tool-calling`, `#tool-calling--inspect-a-call`)
 * so they survive hosts that only pass simple fragments. `#/region/concept` still parses.
 */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const parts = (raw.includes('--') ? raw.split('--') : raw.split('/')).filter(Boolean);
  const region = parts[0] as RegionId | undefined;
  if (!region || !(region in landmarkById)) return ATLAS;
  const concept = parts[1];
  const known = concept && landmarkById[region].concepts.some((c) => c.id === concept);
  return { region, concept: known ? concept : null };
}

export function hrefFor(r: Route): string {
  if (!r.region) return '#atlas';
  return r.concept ? `#${r.region}--${r.concept}` : `#${r.region}`;
}

export function parentOf(r: Route): Route {
  if (r.concept) return { region: r.region, concept: null };
  return ATLAS;
}

export function depthOf(r: Route): 0 | 1 | 2 {
  return r.concept ? 2 : r.region ? 1 : 0;
}

export function routeKey(r: Route): string {
  return hrefFor(r);
}

/** The URL hash is the single source of truth for where the camera should be. */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const current = useRef(route);

  useEffect(() => {
    const onChange = () => {
      const next = parseHash(window.location.hash);
      const prev = current.current;
      if (hrefFor(next) === hrefFor(prev)) return;
      current.current = next;
      transitionRoute(prev, next, () => setRoute(next));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((r: Route) => {
    const href = hrefFor(r);
    if (hrefFor(parseHash(window.location.hash)) === href) return;
    window.location.hash = href;
  }, []);

  return [route, navigate];
}
