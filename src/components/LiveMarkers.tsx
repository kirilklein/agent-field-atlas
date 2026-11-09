import { useSyncExternalStore, type ComponentProps } from 'react';
import { landmarkById } from '../data/map';
import type { Point, RegionId } from '../data/types';
import { toScreen, type Cam } from '../lib/camera';
import { spurCurve } from '../lib/geometry';
import type { Relief } from '../lib/relief';
import { Markers } from './Markers';

type Props = Omit<ComponentProps<typeof Markers>, 'project'> & { cam: Cam; relief: Relief };

/**
 * Markers placed by whichever camera is showing the map: the flat camera, or
 * the relief model's (re-rendered on every frame the model draws).
 */
export function LiveMarkers({ cam, relief, ...rest }: Props) {
  useSyncExternalStore(relief.subscribe, relief.getFrame);
  const { stage, focus, revealed } = rest;
  const project = relief.showing ? relief.project : (p: Point) => toScreen(cam, stage, p);
  return (
    <>
      {relief.showing && focus && <Spurs region={focus} revealed={revealed} project={project} />}
      <Markers project={project} {...rest} />
    </>
  );
}

/** The flat map's spurs to the concept stops, drawn through the model's camera. */
function Spurs({ region, revealed, project }: { region: RegionId; revealed: boolean; project: (p: Point) => Point }) {
  const l = landmarkById[region];
  return (
    <svg className={`scene spurs ${revealed ? 'is-revealed' : ''}`} style={{ pointerEvents: 'none' }} aria-hidden="true" focusable="false">
      {l.concepts.map((_, i) => {
        const [a, c, b] = spurCurve(l, i);
        const pts = Array.from({ length: 13 }, (_, j) => {
          const t = j / 12;
          const u = 1 - t;
          const p = project({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
          return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        });
        return <path key={i} d={`M ${pts.join(' L ')}`} className="spur" />;
      })}
    </svg>
  );
}
