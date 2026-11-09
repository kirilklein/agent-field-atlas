import { memo, useEffect, useState } from 'react';
import { LANDMARKS, TRAILHEAD, landmarkById } from '../data/map';
import type { RegionId } from '../data/types';
import type { Cam, Size } from '../lib/camera';
import { MAIN_TRAIL_D, STRETCHES, TERRAIN, spurPath, stopPoint } from '../lib/geometry';
import { renderHillshade } from '../lib/hillshade';
import { useTheme } from '../lib/theme';

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
};

/** Shaded relief, rendered after first paint (once per theme) so the map appears immediately. */
const Relief = memo(function Relief() {
  const theme = useTheme();
  const [made, setMade] = useState<{ theme: string; img: ReturnType<typeof renderHillshade> } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setMade({ theme, img: renderHillshade(theme) }), 30);
    return () => window.clearTimeout(t);
  }, [theme]);
  // Never show the other theme's relief while this one is being drawn.
  const img = made?.theme === theme ? made.img : null;
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
          <path key={c.level} d={c.d} className={c.index ? 'contour contour--index' : 'contour'} />
        ))}
      </g>
    </g>
  );
});

/** 50 m contours: only drawn when the camera is close enough to need them. */
const MinorContours = memo(function MinorContours() {
  return <path d={TERRAIN.minor} className="contour contour--minor" />;
});

const Trails = memo(function Trails({ hot, walked, glow }: { hot: RegionId | null; walked: string; glow: boolean }) {
  const done = new Set(walked.split(',').filter(Boolean));
  return (
    <g aria-hidden="true">
      {/* At night the trail is lit: a blurred copper layer underneath it. */}
      {glow && <path d={MAIN_TRAIL_D} className="trail-glow" filter="url(#trail-glow)" />}
      {/* Paper-coloured casing separates the trail from contours underneath. */}
      <path d={MAIN_TRAIL_D} className="trail-casing" />
      {STRETCHES.filter((s) => s.kind === 'branch').map((s) => (
        <path key={`c-${s.id}`} d={s.d} className="trail-casing trail-casing--branch" />
      ))}
      {STRETCHES.filter((s) => s.kind === 'branch').map((s) => (
        <path key={s.id} d={s.d} className={`branch ${hot === s.id ? 'is-hot' : ''}`} />
      ))}
      <path d={MAIN_TRAIL_D} className="trail" />
      {/* Stretches leading to landmarks you have explored, drawn as walked. */}
      {STRETCHES.filter((s) => done.has(s.id)).map((s) => (
        <path key={`w-${s.id}`} d={s.d} className={s.kind === 'main' ? 'trail-walked' : 'branch-walked'} />
      ))}
      {STRETCHES.filter((s) => s.kind === 'main').map((s) => (
        <path key={s.id} d={s.d} className={`trail-hot ${hot === s.id ? 'is-hot' : ''}`} />
      ))}
    </g>
  );
});

export function Scene({ cam, stage, focus, revealed, hot, detail, walked }: Props) {
  const w = stage.w / cam.k;
  const h = stage.h / cam.k;
  const viewBox = `${cam.cx - w / 2} ${cam.cy - h / 2} ${w} ${h}`;
  const r = (px: number) => px / cam.k;
  const night = useTheme() === 'dark';

  return (
    <svg className="scene" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {night && (
        <defs>
          {/* Blur in screen pixels, whatever the zoom. */}
          <filter id="trail-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={r(5)} />
          </filter>
        </defs>
      )}
      <rect x={-2000} y={-2000} width={5000} height={5000} className="paper" />
      <Terrain />
      {detail > 0.01 && (
        <g aria-hidden="true" style={{ opacity: detail }}>
          <MinorContours />
        </g>
      )}
      <Trails hot={hot} walked={walked} glow={night} />

      {/* Concept waypoints: tiny unlabelled dots from afar, a hint of what's inside. */}
      <g aria-hidden="true">
        {LANDMARKS.map((l) =>
          l.concepts.map((_, i) => {
            if (l.id === focus) return null;
            const p = stopPoint(l, i);
            return <circle key={`${l.id}-${i}`} cx={p.x} cy={p.y} r={r(2.6)} className="waypoint" />;
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
