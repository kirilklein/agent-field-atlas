import { LANDMARKS, TERRAIN_NAMES, TRAILHEAD, landmarkById } from '../data/map';
import type { LabelSide, Point, RegionId } from '../data/types';
import type { Size } from '../lib/camera';
import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { TEASERS } from '../data/sketches';
import { stopPoint } from '../lib/geometry';
import type { Progress } from '../lib/progress';
import { LANDMARK_AT, NAME_AT, TRAILHEAD_LABEL_AT, ms } from '../lib/intro';
import type { Route } from '../lib/route';

type Props = {
  /** World point → stage point: the flat camera's `toScreen`, or the relief model's projection. */
  project: (p: Point) => Point;
  stage: Size;
  route: Route;
  focus: RegionId | null;
  revealed: boolean;
  compact: boolean;
  onLandmark: (id: RegionId) => void;
  /** Concept previewed on the map (selected, not yet opened). */
  selected: string | null;
  onSelect: (concept: string | null) => void;
  onOpen: (concept: string) => void;
  onHoverConcept: (concept: string | null) => void;
  /** Screen x the callout must stay right of (the side panel). */
  minX: number;
  onHot: (id: RegionId | null) => void;
  progress: Progress;
};

const at = (x: number, y: number) => ({ transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)` });

export function Markers({ project, stage, route, focus, revealed, compact, onLandmark, selected, onSelect, onOpen, onHoverConcept, minX, onHot, progress }: Props) {
  const inRegion = route.region !== null;
  const th = project(TRAILHEAD);

  // What the preview card for stop i must not cover: the landmark's mark and
  // label, and every stop's dot and label (its own included).
  const calloutAvoid = (region: RegionId, i: number): Box[] => {
    const l = landmarkById[region];
    const lp = project(l);
    const side: LabelSide = compact && l.compactSide ? l.compactSide : l.side;
    const boxes: Box[] = [[lp.x - 30, lp.y - 30, lp.x + 30, lp.y + 30], labelBox(lp.x, lp.y, side, 230, 28)];
    l.concepts.forEach((c, j) => {
      const p = project(stopPoint(l, j));
      const w = c.title.length * 8.4 + 12;
      boxes.push([p.x - 14, p.y - 14, p.x + 14, p.y + 14]);
      // Weight the selected stop's own label more: covering it hides what you picked.
      const lb = labelBox(p.x, p.y, c.side, w, 16);
      boxes.push(lb);
      if (j === i) boxes.push(lb, lb);
    });
    return boxes;
  };

  return (
    <div className="markers">
      {/* Place names belong to the overview scale and fade as you descend. */}
      <div className={`terrain-names ${inRegion ? 'is-hidden' : ''}`} aria-hidden="true">
        {TERRAIN_NAMES.map((n, i) => {
          const p = project(n);
          return (
            <span key={n.text} className="terrain-name" style={{ ...at(p.x, p.y), ['--at' as string]: ms(NAME_AT[i]) }}>
              <span style={{ transform: `translate(-50%, -50%) rotate(${n.rotate ?? 0}deg)` }}>{n.text}</span>
            </span>
          );
        })}
        <span className="terrain-name terrain-name--trailhead" style={{ ...at(th.x, th.y), ['--at' as string]: ms(TRAILHEAD_LABEL_AT) }}>
          <span>Trailhead</span>
        </span>
      </div>

      {LANDMARKS.map((l) => {
        const p = project(l);
        const selected = route.region === l.id;
        const dimmed = inRegion && !selected;
        const side: LabelSide = compact && l.compactSide ? l.compactSide : l.side;
        const kicker = l.kind === 'main' ? `Landmark ${l.mark}` : `Branch ${l.mark}`;
        return (
          <button
            key={l.id}
            type="button"
            data-landmark={l.id}
            className={[
              'lm',
              `lm--${l.kind}`,
              `side-${side}`,
              selected ? 'is-selected' : '',
              dimmed ? 'is-dimmed' : '',
            ].join(' ')}
            style={{ ...at(p.x, p.y), ['--at' as string]: ms(LANDMARK_AT[l.id]) }}
            aria-current={selected && !route.concept ? 'location' : undefined}
            aria-label={`${kicker}: ${l.title}. ${l.builds}${l.kind === 'branch' ? ` Optional branch from ${landmarkById[l.from!].title}.` : ''} ${Math.round(progress.share(l.id) * l.concepts.length)} of ${l.concepts.length} lessons visited.`}
            onClick={() => onLandmark(l.id)}
            onMouseEnter={() => onHot(l.id)}
            onMouseLeave={() => onHot(null)}
            onFocus={() => onHot(l.id)}
            onBlur={() => onHot(null)}
          >
            <span className="lm__mark" aria-hidden="true">
              {l.mark}
              {progress.share(l.id) > 0 && (
                <svg className="lm__ring" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="22" pathLength="100" strokeDasharray={`${progress.share(l.id) * 100} 100`} />
                </svg>
              )}
            </span>
            <span className="lm__label" aria-hidden="true">
              <span className="lm__title">{l.title}</span>
            </span>
          </button>
        );
      })}

      {focus &&
        landmarkById[focus].concepts.map((c, i) => {
          const l = landmarkById[focus];
          const p = project(stopPoint(l, i));
          const open = route.region === focus && route.concept === c.id;
          const picked = route.region === focus && !route.concept && selected === c.id;
          const active = open || picked;
          const visible = revealed && route.region === focus;
          return (
            <Fragment key={`${focus}-${c.id}`}>
            <button
              type="button"
              data-concept={c.id}
              className={`stop side-${compact ? 'below' : c.side} ${c.detour ? 'stop--detour' : ''} ${visible ? 'is-revealed' : ''} ${active ? 'is-active' : ''} ${progress.has(focus, c.id) ? 'is-visited' : ''}`}
              style={{ ...at(p.x, p.y), ['--i' as string]: i }}
              tabIndex={visible || route.region === focus ? 0 : -1}
              aria-hidden={route.region === focus ? undefined : true}
              aria-current={open ? 'page' : undefined}
              aria-expanded={route.concept ? undefined : picked}
              aria-label={`Concept ${i + 1} of ${l.concepts.length}: ${c.title}${progress.has(focus, c.id) ? ' (visited)' : ''}${picked ? '. Selected: press again to open the lesson' : ''}`}
              title={picked ? 'Click again to open the lesson' : undefined}
              onClick={() => (picked || route.concept ? onOpen(c.id) : onSelect(c.id))}
              onMouseEnter={() => onHoverConcept(c.id)}
              onMouseLeave={() => onHoverConcept(null)}
              onFocus={() => onHoverConcept(c.id)}
              onBlur={() => onHoverConcept(null)}
            >
              <span className="stop__dot" aria-hidden="true">
                {i + 1}
              </span>
              <span className="stop__label" aria-hidden="true">
                {c.title}
              </span>
            </button>
            {picked && visible && (
              <Callout
                x={p.x}
                y={p.y}
                stage={stage}
                compact={compact}
                minX={minX}
                avoid={calloutAvoid(focus, i)}
                kicker={`Stop ${i + 1} of ${l.concepts.length}`}
                title={c.title}
                text={TEASERS[`${focus}/${c.id}`] ?? ''}
                onOpen={() => onOpen(c.id)}
                onClose={() => onSelect(null)}
              />
            )}
            </Fragment>
          );
        })}
    </div>
  );
}

type CalloutProps = {
  x: number;
  y: number;
  stage: Size;
  compact: boolean;
  minX: number;
  /** Screen boxes the card should not cover: the landmark, its label, the stop's label. */
  avoid: Box[];
  kicker: string;
  title: string;
  text: string;
  onOpen: () => void;
  onClose: () => void;
};

type Box = [x0: number, y0: number, x1: number, y1: number];

const CALLOUT_W = 272;
const GAP = 18;

/** The box a marker's label occupies, given the marker's centre and label side. */
function labelBox(x: number, y: number, side: LabelSide, w: number, r: number): Box {
  switch (side) {
    case 'right':
      return [x + r, y - 30, x + r + w, y + 30];
    case 'left':
      return [x - r - w, y - 30, x - r, y + 30];
    case 'below':
      return [x - w / 2, y + r, x + w / 2, y + r + 52];
    default:
      return [x - w / 2, y - r - 52, x + w / 2, y - r];
  }
}

function overlap(a: Box, b: Box) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Try the four corners around the stop (diagonal, so the card clears the stop's
 * own label row) and keep the one that covers the least of the landmark and
 * labels, then the least off-screen. Ties go to the order tried.
 */
function placeCallout({ x, y, h, stage, minX, avoid }: { x: number; y: number; h: number; stage: Size; minX: number; avoid: Box[] }) {
  const lo = minX + 12;
  const hi = stage.w - 70;
  const cands = [
    [x + GAP, y + GAP],
    [x + GAP, y - GAP - h],
    [x - GAP - CALLOUT_W, y + GAP],
    [x - GAP - CALLOUT_W, y - GAP - h],
  ];
  let best = { left: 0, top: 0, score: Infinity };
  for (const [l0, t0] of cands) {
    const box: Box = [l0, t0, l0 + CALLOUT_W, t0 + h];
    const off =
      Math.max(0, lo - box[0]) + Math.max(0, box[2] - hi) + Math.max(0, 16 - box[1]) + Math.max(0, box[3] - (stage.h - 16));
    const covered = avoid.reduce((s, b) => s + overlap(box, b), 0);
    const score = covered + off * 400;
    if (score < best.score) best = { left: l0, top: t0, score };
  }
  return {
    left: Math.max(lo, Math.min(hi - CALLOUT_W, best.left)),
    top: Math.max(16, Math.min(stage.h - h - 16, best.top)),
  };
}

/** A small card next to the selected stop: what it is about, and the explicit way in. */
function Callout({ x, y, stage, compact, minX, avoid, kicker, title, text, onOpen, onClose }: CalloutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(150);
  useEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [title, text]);

  let style: CSSProperties;
  if (compact) {
    style = { left: 12, right: 12, bottom: 58 };
  } else {
    style = { ...placeCallout({ x, y, h, stage, minX, avoid }), width: CALLOUT_W };
  }
  return (
    <div ref={ref} className={`callout ${compact ? 'callout--docked' : ''}`} style={style} role="group" aria-label={`${title}: preview`}>
      <p className="callout__kicker">{kicker}</p>
      <p className="callout__title">{title}</p>
      <p className="callout__text">{text}</p>
      <div className="callout__actions">
        <button type="button" className="btn btn--primary callout__open" onClick={onOpen}>
          Open the lesson <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="icon-btn callout__close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
