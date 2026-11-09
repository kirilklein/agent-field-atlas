import { memo, useEffect, useState, type CSSProperties } from 'react';
import { LANDMARKS, TRAILHEAD, landmarkById } from '../data/map';
import type { RegionId } from '../data/types';
import type { Cam, Size } from '../lib/camera';
import { MAIN_TRAIL_D, STRETCHES, TERRAIN, spurPath, stopPoint } from '../lib/geometry';
import { renderHillshade } from '../lib/hillshade';
import { BRANCH_AT, LANDMARK_AT, contourAt, markReliefReady, ms } from '../lib/intro';

type Props = {
  cam: Cam;
  stage: Size;
  /** Region whose concept stops are shown (route region, or the one we are leaving). */
  focus: RegionId | null;
  revealed: boolean;
  hot: RegionId | null;
  /** 0–1: how strongly to show the fine 50 m contours (they appear as you zoom in). */
  detail: number;
  /** Comma-separated ids of landmarks with at least one visited lesson. */
  walked: string;
  /** The opening sequence is playing (or about to): trails are revealed through masks. */
  intro: boolean;
};

const at = (t: number) => ({ ['--at' as string]: ms(t) }) as CSSProperties;
const TRAIL_MASK = 'url(#intro-trail)';
const branchMask = (id: string) => `url(#intro-${id})`;

/** Shaded relief, rendered once after first paint so the map appears immediately. */
const Relief = memo(function Relief() {
  const [img, setImg] = useState<ReturnType<typeof renderHillshade> | undefined>(undefined);
  useEffect(() => {
    const t = window.setTimeout(() => setImg(renderHillshade()), 30);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (img !== undefined) markReliefReady();
  }, [img]);
  if (!img) return null;
  return <image href={img.url} x={img.x} y={img.y} width={img.w} height={img.h} preserveAspectRatio="none" className="relief" />;
});

/** Static layers never change with the camera; only the viewBox does. */
const Terrain = memo(function Terrain() {
  const grid: number[] = [];
  for (let v = -1000; v <= 2000; v += 125) grid.push(v);
  return (
    <g aria-hidden="true">
      <Relief />
      <g className="graticule">
        {grid.map((v) => (
          <line key={`v${v}`} x1={v} y1={-1000} x2={v} y2={2000} />
        ))}
        {grid.map((v) => (
          <line key={`h${v}`} x1={-1000} y1={v} x2={2000} y2={v} />
        ))}
      </g>
      <g className="contours">
        {TERRAIN.major.map((c) => (
          <path key={c.level} d={c.d} className={c.index ? 'contour contour--index' : 'contour'} style={at(contourAt(c.level))} />
        ))}
      </g>
    </g>
  );
});

/** 50 m contours: only drawn when the camera is close enough to need them. */
const MinorContours = memo(function MinorContours() {
  return <path d={TERRAIN.minor} className="contour contour--minor" />;
});

/**
 * Intro reveal masks: a wide solid stroke drawn along each route (pathLength 1,
 * dash offset animated in CSS). Masking, rather than dashing the trail itself,
 * keeps the branches' own dash pattern intact while they draw.
 */
function RevealMasks({ width }: { width: number }) {
  const box = { x: -1000, y: -1000, width: 3000, height: 3000, maskUnits: 'userSpaceOnUse' as const };
  return (
    <defs>
      <mask id="intro-trail" {...box}>
        <path d={MAIN_TRAIL_D} pathLength={1} className="intro-reveal intro-reveal--trail" strokeWidth={width} />
      </mask>
      {STRETCHES.filter((s) => s.kind === 'branch').map((s) => (
        <mask key={s.id} id={`intro-${s.id}`} {...box}>
          <path
            d={s.d}
            pathLength={1}
            className="intro-reveal intro-reveal--branch"
            strokeWidth={width}
            style={{ ['--at' as string]: ms(BRANCH_AT[s.id]!.at), ['--dur' as string]: ms(BRANCH_AT[s.id]!.ms) }}
          />
        </mask>
      ))}
    </defs>
  );
}

const Trails = memo(function Trails({ hot, walked, intro }: { hot: RegionId | null; walked: string; intro: boolean }) {
  const done = new Set(walked.split(',').filter(Boolean));
  const trailMask = intro ? TRAIL_MASK : undefined;
  const maskFor = (id: string, kind: 'main' | 'branch') => (!intro ? undefined : kind === 'main' ? TRAIL_MASK : branchMask(id));
  return (
    <g aria-hidden="true">
      {/* Paper-coloured casing separates the trail from contours underneath. */}
      <path d={MAIN_TRAIL_D} className="trail-casing" mask={trailMask} />
      {STRETCHES.filter((s) => s.kind === 'branch').map((s) => (
        <path key={`c-${s.id}`} d={s.d} className="trail-casing trail-casing--branch" mask={maskFor(s.id, 'branch')} />
      ))}
      {STRETCHES.filter((s) => s.kind === 'branch').map((s) => (
        <path key={s.id} d={s.d} className={`branch ${hot === s.id ? 'is-hot' : ''}`} mask={maskFor(s.id, 'branch')} />
      ))}
      <path d={MAIN_TRAIL_D} className="trail" mask={trailMask} />
      {/* Stretches leading to landmarks you have explored, drawn as walked. */}
      {STRETCHES.filter((s) => done.has(s.id)).map((s) => (
        <path key={`w-${s.id}`} d={s.d} className={s.kind === 'main' ? 'trail-walked' : 'branch-walked'} mask={maskFor(s.id, s.kind)} />
      ))}
      {STRETCHES.filter((s) => s.kind === 'main').map((s) => (
        <path key={s.id} d={s.d} className={`trail-hot ${hot === s.id ? 'is-hot' : ''}`} mask={trailMask} />
      ))}
    </g>
  );
});

export function Scene({ cam, stage, focus, revealed, hot, detail, walked, intro }: Props) {
  const w = stage.w / cam.k;
  const h = stage.h / cam.k;
  const viewBox = `${cam.cx - w / 2} ${cam.cy - h / 2} ${w} ${h}`;
  const r = (px: number) => px / cam.k;

  return (
    <svg className="scene" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x={-2000} y={-2000} width={5000} height={5000} className="paper" />
      <Terrain />
      {detail > 0.01 && (
        <g aria-hidden="true" style={{ opacity: detail }}>
          <MinorContours />
        </g>
      )}
      {intro && <RevealMasks width={r(26)} />}
      <Trails hot={hot} walked={walked} intro={intro} />

      {/* Concept waypoints: tiny unlabelled dots from afar, a hint of what's inside. */}
      <g aria-hidden="true">
        {LANDMARKS.map((l) =>
          l.concepts.map((_, i) => {
            if (l.id === focus) return null;
            const p = stopPoint(l, i);
            return <circle key={`${l.id}-${i}`} cx={p.x} cy={p.y} r={r(2.6)} className="waypoint" style={at(LANDMARK_AT[l.id] + 160 + i * 50)} />;
          }),
        )}
      </g>

      {focus && (
        <g className={`spurs ${revealed ? 'is-revealed' : ''}`} aria-hidden="true">
          {landmarkById[focus].concepts.map((_, i) => (
            <path key={i} d={spurPath(landmarkById[focus], i)} className="spur" />
          ))}
        </g>
      )}

      <g className="trailhead" aria-hidden="true">
        <circle cx={TRAILHEAD.x} cy={TRAILHEAD.y} r={r(5)} />
        <circle cx={TRAILHEAD.x} cy={TRAILHEAD.y} r={r(10)} className="trailhead-ring" />
      </g>
    </svg>
  );
}
