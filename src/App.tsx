import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MapControls } from './components/MapControls';
import { LiveMarkers } from './components/LiveMarkers';
import { Scene } from './components/Scene';
import { Cartouche, Legend, RegionCard } from './components/Sheets';
import { Workbench } from './components/Workbench';
import { ThemeToggle } from './components/ThemeToggle';
import { lessonFor } from './data/lessons';
import { LANDMARKS, TRAILHEAD, landmarkById } from './data/map';
import type { Point, RegionId } from './data/types';
import { CALLOUT_GAP, DiagramCallout } from './components/insets/DiagramCallout';
import { NO_INSETS, camAt, fit, toScreen, useCamera, useElementSize, useMediaQuery, zoomAbout, type Cam, type Insets } from './lib/camera';
import { useMapGestures } from './lib/gestures';
import { INTRO_VARS, useIntro } from './lib/intro';
import { Relief, type Framing } from './lib/relief';
import { useTheme } from './lib/theme';
import { useProgress } from './lib/progress';
import { ATLAS_BOX, regionBox, stopPoint } from './lib/geometry';
import { depthOf, hrefFor, parentOf, routeKey, useHashRoute } from './lib/route';

const COMPACT = '(max-width: 899px)';
const SIDE_COLUMN = 420; // cartouche / region card column on wide screens

export default function App() {
  const [route, navigate] = useHashRoute();
  const learner = useProgress(route);
  const walked = LANDMARKS.filter((l) => learner.share(l.id) > 0).map((l) => l.id).join(',');
  const compact = useMediaQuery(COMPACT);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [stageRef, stage] = useElementSize<HTMLDivElement>();
  const [hot, setHot] = useState<RegionId | null>(null);
  // A concept picked on the map or in the list: previewed, not yet opened.
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null);
  const depth = depthOf(route);
  const key = routeKey(route);
  const [relief] = useState(() => new Relief());
  // With the 3D model, the lift into it is the opening; the trail draw-in is the flat fallback.
  const intro = useIntro(!relief.getState().available);
  const inking = intro === 'wait' || intro === 'run';

  // The last region visited: the anchor (and fading fog) when returning to the overview.
  const lastRegion = useRef<RegionId | null>(route.region);
  useEffect(() => {
    if (route.region) lastRegion.current = route.region;
  }, [route.region]);

  // Lessons with a step-through trace get a wider, two-column workbench on large screens.
  const lessonHasTrace =
    route.region && route.concept
      ? ['trace', 'checkpoint', 'compare'].includes(lessonFor(route.region, route.concept)?.interaction?.kind ?? '')
      : false;
  const panelW = compact
    ? 0
    : lessonHasTrace && stage.w >= 1280
      ? Math.round(Math.min(980, stage.w - 520))
      : Math.round(Math.min(620, Math.max(440, stage.w * 0.42)));

  const wide = !compact && stage.w >= 900;
  // The part of the stage not covered by the cartouche / region card / workbench.
  const viewInsets: Insets = !wide
    ? NO_INSETS
    : depth === 2
      ? { ...NO_INSETS, right: panelW + 12 }
      : { ...NO_INSETS, left: SIDE_COLUMN };

  const target = useMemo(() => {
    const side: Insets = wide ? { ...NO_INSETS, left: SIDE_COLUMN } : NO_INSETS;
    if (!route.region) {
      return fit(ATLAS_BOX, stage, side, compact ? { x: 74, y: 52 } : { x: 160, y: 64 }, 1.25);
    }
    const l = landmarkById[route.region];
    const regionCam = fit(regionBox(l), stage, side, compact ? { x: 78, y: 52 } : { x: 160, y: 70 }, compact ? 1.7 : 1.9);
    if (!route.concept) return regionCam;
    // Detail: frame the landmark and the open concept stop beside the workbench,
    // never zooming out from the region scale.
    const i = l.concepts.findIndex((c) => c.id === route.concept);
    const p = stopPoint(l, i);
    const box = { x0: Math.min(l.x, p.x), y0: Math.min(l.y, p.y), x1: Math.max(l.x, p.x), y1: Math.max(l.y, p.y) };
    const insets: Insets = wide ? { ...NO_INSETS, right: panelW + 12 } : NO_INSETS;
    return fit(box, stage, insets, compact ? { x: 90, y: 70 } : { x: 150, y: 90 }, regionCam.k * 1.12);
  }, [route.region, route.concept, stage, compact, panelW, wide]);

  const anchorId = route.region ?? lastRegion.current;
  const anchor: Point = anchorId
    ? landmarkById[anchorId]
    : { x: (ATLAS_BOX.x0 + ATLAS_BOX.x1) / 2, y: (ATLAS_BOX.y0 + ATLAS_BOX.y1) / 2 };

  // Every route change animates (region → lesson too, as the panel opens); resizes jump.
  /* ---------- big-picture diagram beside the landmark ---------- */
  // Opens by itself on a landmark page (wide layouts); closing it holds for that landmark.
  const [closedFor, setClosedFor] = useState<RegionId | null>(null);
  const [focusDiagram, setFocusDiagram] = useState(false);
  const inset: RegionId | null = wide && depth === 1 && route.region && closedFor !== route.region ? route.region : null;
  const freeL = SIDE_COLUMN;
  const freeR = stage.w - 70;
  const calloutW = Math.min(640, freeR - freeL - CALLOUT_GAP - 24 - 70);
  const calloutDock = calloutW < 420 ? { left: freeL + 8, right: Math.max(78, stage.w - freeL - 8 - 640) } : null;
  const camTarget = useMemo(() => {
    if (!inset) return target;
    const l = landmarkById[inset];
    const at = calloutDock
      ? { x: (freeL + freeR) / 2, y: Math.max(70, (stage.h - 420) / 2) }
      : { x: freeL + 70, y: stage.h / 2 };
    return camAt(l, at, target.k, stage);
  }, [inset, calloutDock?.left, calloutW, freeL, freeR, stage, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDiagram = useCallback(() => {
    setFocusDiagram(true);
    setClosedFor(null);
  }, []);
  const hideDiagram = useCallback(() => {
    setClosedFor(route.region);
    setFocusDiagram(false);
  }, [route.region]);
  const closeDiagram = useCallback(() => {
    hideDiagram();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-show-diagram]')?.focus({ preventScroll: true }));
  }, [hideDiagram]);
  useEffect(() => {
    // Leaving the landmark forgets that it was closed there.
    if (closedFor && closedFor !== route.region) setClosedFor(null);
  }, [route.region, closedFor]);

  /* ---------- the relief model (3D overview) ---------- */
  // The flat overview's zoom; fine contours fade in between 1.35× and 1.9× it.
  const overviewK = useMemo(
    () => fit(ATLAS_BOX, stage, wide ? { ...NO_INSETS, left: SIDE_COLUMN } : NO_INSETS, compact ? { x: 74, y: 52 } : { x: 160, y: 64 }, 1.25).k,
    [stage, wide, compact],
  );

  const rs = useSyncExternalStore(relief.subscribe, relief.getState);
  const flightT = useSyncExternalStore(relief.subscribe, relief.getFlight);
  const inRelief = rs.ready && rs.phase !== 'flat';
  // Set when the viewer hands the overview to the flat map (zooming, arrow keys):
  // the model then waits for recenter or the next visit to the overview.
  const [flatHold, setFlatHold] = useState(false);
  // While the model is up (or about to lift), it animates route changes and the flat camera jumps.
  const modelMoves = depth === 0 ? rs.ready && !reduced : inRelief;

  const { cam, progress: camProgress, set: setFree, tweenTo, getCam } = useCamera(
    camTarget,
    anchor,
    stage,
    inset ? `${key}|diagram` : key,
    reduced,
    modelMoves,
  );
  const progress = rs.phase === 'down' || rs.phase === 'up' ? flightT : camProgress;

  useEffect(() => {
    relief.mount();
    return () => relief.unmount();
  }, [relief]);
  useEffect(() => {
    if (reduced) relief.shutdown();
  }, [relief, reduced]);
  useEffect(() => relief.setWalked(walked), [relief, walked]);
  const theme = useTheme();
  useEffect(() => relief.setTheme(theme), [relief, theme]);
  // Load three only for the overview, so a deep link into a lesson never pays for it.
  useEffect(() => {
    if (depth === 0 && !reduced && rs.available && stage.w > 1) relief.load();
  }, [relief, depth, reduced, rs.available, stage.w]);
  useEffect(() => {
    if (stage.w < 2) return;
    const framing: Framing = {
      free: { x0: wide ? SIDE_COLUMN : 0, y0: 0, x1: stage.w, y1: stage.h },
      // Branch labels sit to the right of their marks; the trailhead's below it.
      pad: compact ? { l: 64, r: 84, t: 40, b: 40 } : { l: 130, r: 210, t: 56, b: 56 },
      kMax: 1.25,
      overviewK,
      // A steeper look on tall phone screens, so the climb keeps its height.
      theta: (compact ? 42 : 52) * (Math.PI / 180),
      points: [TRAILHEAD, ...LANDMARKS],
    };
    relief.setLayout(stage, framing);
  }, [relief, stage, wide, compact, overviewK]);

  // Route changes: fly down out of the model, or lift back into it.
  const lastKeyRef = useRef(key);
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    if (depth === 0) {
      setFlatHold(false);
      // `cam` is still the flat camera from before this route change.
      if (relief.getState().ready && !reduced) relief.rise(cam);
    } else if (relief.showing) {
      relief.descend(camTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // The flat camera's target moved during a descent (the diagram opening, a resize): land there.
  useEffect(() => {
    if (depth > 0) relief.retarget(camTarget);
  }, [relief, depth, camTarget]);

  /* ---------- free pan & zoom ---------- */
  const kMin = useMemo(() => fit(ATLAS_BOX, stage, NO_INSETS, { x: 40, y: 40 }, 1.25).k * 0.6, [stage]);
  const kMax = compact ? 3 : 3.4;
  const detail = Math.min(1, Math.max(0, (cam.k / overviewK - 1.35) / 0.55));
  const clampK = useCallback((k: number) => Math.min(kMax, Math.max(kMin, k)), [kMin, kMax]);
  const clampCam = useCallback(
    (c: Cam): Cam => ({
      k: c.k,
      cx: Math.min(ATLAS_BOX.x1 + 300, Math.max(ATLAS_BOX.x0 - 300, c.cx)),
      cy: Math.min(ATLAS_BOX.y1 + 150, Math.max(ATLAS_BOX.y0 - 250, c.cy)),
    }),
    [],
  );
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef(0);
  const showHint = useCallback((m: string) => {
    window.clearTimeout(hintTimer.current);
    setHint(m);
    hintTimer.current = window.setTimeout(() => setHint(null), 1600);
  }, []);
  useMapGestures(stageRef, {
    stage,
    compact,
    getCam,
    apply: (c) => setFree(clampCam(c)),
    clampK,
    onHint: showHint,
    onDragChange: setDragging,
    relief: () => relief.showing,
    onTurn: (dx, dy) => relief.turn(dx, dy),
    onZoomIn: () => {
      if (relief.getState().phase !== 'down') handOff(camTarget);
    },
  });

  const viewCentre = {
    x: (viewInsets.left + stage.w - viewInsets.right) / 2,
    y: (viewInsets.top + stage.h - viewInsets.bottom) / 2,
  };
  /** Leave the model for the flat map, landing on the flat camera `next`. */
  const handOff = (next: Cam) => {
    setFlatHold(true);
    setFree(next);
    relief.descend(next);
  };
  const zoomBy = (f: number) => {
    const c = getCam();
    const next = clampCam(zoomAbout(c, stage, viewCentre, clampK(c.k * f)));
    if (inRelief) {
      if (f > 1) handOff(next);
      return;
    }
    tweenTo(next, 220);
  };
  const panBy = (dx: number, dy: number) => {
    const c = getCam();
    const next = clampCam({ ...c, cx: c.cx + dx / c.k, cy: c.cy + dy / c.k });
    if (inRelief) handOff(next);
    else tweenTo(next, 160);
  };
  const recenter = () => {
    if (inRelief) {
      relief.resetTurn();
      return;
    }
    if (depth === 0 && rs.ready && !reduced) {
      // Back to the whole trail: lift into the model.
      setFlatHold(false);
      relief.rise(getCam());
      setFree(camTarget);
      return;
    }
    if (depth === 0 && !reduced) {
      // The model was put away: bring it back, and it lifts once the flat map settles.
      setFlatHold(false);
      relief.load();
    }
    tweenTo(camTarget, 420);
  };
  const offTarget =
    camProgress >= 1 &&
    (Math.abs(cam.k / camTarget.k - 1) > 0.01 || Math.hypot(cam.cx - camTarget.cx, cam.cy - camTarget.cy) * cam.k > 4);
  const recenterLabel = route.region ? `Recenter on ${landmarkById[route.region].title}` : 'Show the whole trail';

  // The model lifts out of the flat overview once it is ready, unless the
  // viewer is already moving the map around.
  const firstLift = useRef(true);
  useEffect(() => {
    if (depth !== 0 || flatHold || reduced || dragging || !rs.ready || offTarget || camProgress < 1) return;
    if (relief.getState().phase !== 'flat') return;
    relief.rise(getCam(), firstLift.current ? 1500 : undefined);
    firstLift.current = false;
  }, [relief, depth, flatHold, reduced, dragging, rs.ready, offTarget, camProgress, getCam]);

  const onStageKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 90;
    switch (e.key) {
      case '+':
      case '=':
        zoomBy(1.4);
        break;
      case '-':
      case '_':
        zoomBy(1 / 1.4);
        break;
      case '0':
        recenter();
        break;
      case 'ArrowLeft':
        panBy(-step, 0);
        break;
      case 'ArrowRight':
        panBy(step, 0);
        break;
      case 'ArrowUp':
        panBy(0, -step);
        break;
      case 'ArrowDown':
        panBy(0, step);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const settling = progress < 1;
  const focus: RegionId | null = route.region ?? (settling ? lastRegion.current : null);
  const revealed = route.region !== null && progress >= 0.55;

  // Fog: dims surrounding terrain around the focused region.
  const fogOpacity = route.region ? Math.min(1, progress * 1.6) : settling ? 1 - progress : 0;
  let fogStyle: CSSProperties | undefined;
  if (focus && fogOpacity > 0.001) {
    const l = landmarkById[focus];
    const b = regionBox(l);
    const project = inRelief ? relief.project : (p: Point) => toScreen(cam, stage, p);
    const c = project({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    const p0 = project({ x: b.x0, y: b.y0 });
    const p1 = project({ x: b.x1, y: b.y1 });
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.5 + (compact ? 70 : 120);
    fogStyle = {
      opacity: fogOpacity,
      background: `radial-gradient(circle at ${c.x}px ${c.y}px, rgba(var(--paper-rgb),0) ${r * 0.72}px, rgba(var(--paper-rgb),var(--fog-mid)) ${r * 1.08}px, rgba(var(--paper-rgb),var(--fog-far)) ${r * 1.7}px)`,
    };
  }

  /* ---------- navigation ---------- */
  const goRegion = useCallback((id: RegionId) => navigate({ region: id, concept: null }), [navigate]);
  const openConcept = useCallback(
    (concept: string) => {
      if (route.region) navigate({ region: route.region, concept });
    },
    [navigate, route.region],
  );
  const goUp = useCallback(() => navigate(parentOf(route)), [navigate, route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || depthOf(route) === 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, details')) return;
      e.preventDefault();
      // Escape first closes the diagram or a preview, then goes up a level.
      if (inset) {
        closeDiagram();
        return;
      }
      if (depthOf(route) === 1 && selected) {
        const was = selected;
        setSelected(null);
        document.querySelector<HTMLElement>(`[data-concept="${was}"]`)?.focus({ preventScroll: true });
        return;
      }
      navigate(parentOf(route));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, navigate, selected, inset, closeDiagram]);

  /* ---------- focus & scroll after a route change ---------- */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const prevRoute = useRef(route);
  const firstRoute = useRef(true);
  useEffect(() => {
    const prev = prevRoute.current;
    prevRoute.current = route;
    // Coming back from a lesson keeps that stop selected; any other move clears it.
    setSelected(route.region && !route.concept && prev.region === route.region && prev.concept ? prev.concept : null);
    setHoveredConcept(null);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    if (route.concept) {
      headingRef.current?.focus({ preventScroll: true });
      if (compact) benchRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    } else if (route.region) {
      const back = prev.region === route.region && prev.concept ? q(`[data-concept="${prev.concept}"]`) : null;
      (back ?? q('#region-title'))?.focus({ preventScroll: true });
      if (compact && prev.concept) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    } else if (prev.region) {
      q(`[data-landmark="${prev.region}"]`)?.focus({ preventScroll: true });
      if (compact) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* ---------- breadcrumbs ---------- */
  const crumbs: { label: string; href: string }[] = [{ label: 'Atlas', href: '#atlas' }];
  if (route.region) crumbs.push({ label: landmarkById[route.region].title, href: hrefFor({ region: route.region, concept: null }) });
  if (route.region && route.concept) {
    const c = landmarkById[route.region].concepts.find((x) => x.id === route.concept)!;
    crumbs.push({ label: c.title, href: hrefFor(route) });
  }

  useEffect(() => {
    document.title = [...crumbs.slice(1).map((c) => c.label).reverse(), 'Agent Field Atlas'].join(' · ');
  });

  return (
    <div
      className={`app depth-${depth} ${compact ? 'is-compact' : ''} ${lessonHasTrace ? 'has-trace' : ''} ${inking ? 'intro' : ''} ${intro === 'wait' ? 'intro--hold' : ''} ${intro === 'done' ? 'intro-done' : ''}`}
      style={{ ['--panel-w' as string]: `${panelW}px`, ...(inking ? INTRO_VARS : null) }}
    >
      <a
        className="skip"
        href="#main-sheet"
        onClick={(e) => {
          // Not a route: move focus without touching the URL hash.
          e.preventDefault();
          document.querySelector<HTMLElement>('#main-sheet button, #main-sheet a, #main-sheet h2')?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="#atlas" aria-label="Agent Field Atlas, overview">
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <path d="M8 26c6-2 2-8 8-10s3-8 8-10" fill="none" stroke="var(--copper)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="24" cy="6.5" r="3" fill="var(--pine)" />
            <circle cx="8" cy="26" r="2" fill="var(--pine)" />
          </svg>
          <span className="brand__name">Agent Field Atlas</span>
        </a>
        <nav className="crumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c, i) => (
              <li key={c.href}>
                {i === crumbs.length - 1 ? (
                  <span aria-current="page">{c.label}</span>
                ) : (
                  <a href={c.href}>{c.label}</a>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <ThemeToggle />
        <button type="button" className="btn btn--ghost back" onClick={goUp} disabled={depth === 0} aria-label="Back up one level">
          <span aria-hidden="true">↑ </span>Back
        </button>
      </header>

      <main className="map-wrap">
        {depth === 0 && (
          <div className="sheet sheet--intro" id="main-sheet">
            <Cartouche onStart={() => goRegion('one-model-call')} reduced={reduced} />
          </div>
        )}

        <div
          className={`stage ${dragging ? 'is-dragging' : ''} ${inRelief ? 'is-relief' : ''}`}
          ref={stageRef}
          role="region"
          tabIndex={0}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse' || !inRelief) return;
            const r = e.currentTarget.getBoundingClientRect();
            relief.lookAt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
          }}
          onPointerLeave={() => relief.lookAt(null)}
          aria-label="Trail map. Drag to pan and scroll to zoom. With the map focused, arrow keys pan, plus and minus zoom, and 0 recenters."
          onKeyDown={onStageKey}
        >
          <Scene cam={cam} stage={stage} focus={focus} revealed={revealed} hot={hot} detail={detail} walked={walked} intro={inking} />
          {rs.available && !reduced && <div className="relief-model" ref={relief.attach} aria-hidden="true" />}
          <div className="grain" aria-hidden="true" />
          <div className="fog" style={fogStyle} aria-hidden="true" />
          <LiveMarkers
            cam={cam}
            relief={relief}
            stage={stage}
            route={route}
            focus={focus}
            revealed={revealed}
            compact={compact}
            onLandmark={(id) => (wide && depth === 1 && id === route.region ? openDiagram() : goRegion(id))}
            selected={selected}
            onSelect={setSelected}
            onOpen={openConcept}
            onHoverConcept={setHoveredConcept}
            minX={!compact && stage.w >= 900 && depth < 2 ? SIDE_COLUMN : 0}
            onHot={setHot}
            progress={learner}
          />
          {inset && rs.phase !== 'down' && (
            <>
              <div className="diagram-backdrop" onClick={closeDiagram} aria-hidden="true" />
              {(() => {
                const p = toScreen(cam, stage, landmarkById[inset]);
                return (
                  <DiagramCallout
                    key={inset}
                    region={inset}
                    concept={hoveredConcept ?? selected}
                    x={p.x}
                    y={p.y}
                    width={calloutW}
                    dock={calloutDock}
                    stageH={stage.h}
                    reduced={reduced}
                    focusOnOpen={focusDiagram}
                    onClose={closeDiagram}
                  />
                );
              })()}
            </>
          )}
          <div className="frame" aria-hidden="true">
            <span className="compass">N</span>
          </div>
          <Legend
            gestureHint={compact ? null : inRelief ? 'Drag to turn · scroll to zoom in' : 'Drag to pan · scroll to zoom'}
            progress={learner}
          />
          <MapControls
            canZoomIn={inRelief || cam.k < kMax - 1e-3}
            canZoomOut={!inRelief && cam.k > kMin + 1e-3}
            canRecenter={inRelief ? rs.turned : offTarget || (depth === 0 && flatHold && rs.available && !reduced)}
            recenterLabel={recenterLabel}
            onZoomIn={() => zoomBy(1.5)}
            onZoomOut={() => zoomBy(1 / 1.5)}
            onRecenter={recenter}
          />
          <div className={`map-hint ${hint ? 'is-on' : ''}`} aria-hidden="true">
            {hint}
          </div>
        </div>

        {depth === 1 && route.region && (
          <div className="sheet sheet--region" id="main-sheet">
            <RegionCard
              region={route.region}
              progress={learner}
              reduced={reduced}
              selected={selected}
              hovered={hoveredConcept}
              onSelect={setSelected}
              onOpen={openConcept}
              diagram={wide ? (inset ? 'open' : 'closed') : 'inline'}
              onShowDiagram={openDiagram}
              onDeeper={hideDiagram}
            />
          </div>
        )}

        {depth === 2 && route.region && route.concept && (
          <div className="sheet sheet--bench" id="main-sheet" ref={benchRef}>
            <Workbench
              key={key}
              ref={headingRef}
              region={route.region}
              concept={route.concept}
              reduced={reduced}
              onClose={goUp}
            />
          </div>
        )}
      </main>
    </div>
  );
}
