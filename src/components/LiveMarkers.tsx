import { useSyncExternalStore, type ComponentProps } from 'react';
import type { Point } from '../data/types';
import { toScreen, type Cam } from '../lib/camera';
import type { Relief } from '../lib/relief';
import { Markers } from './Markers';

type Props = Omit<ComponentProps<typeof Markers>, 'project'> & { cam: Cam; relief: Relief };

/**
 * Markers placed by whichever camera is showing the map: the flat camera, or
 * the relief model's (re-rendered on every frame the model draws).
 */
export function LiveMarkers({ cam, relief, ...rest }: Props) {
  useSyncExternalStore(relief.subscribe, relief.getFrame);
  const { stage } = rest;
  const project = relief.showing ? relief.project : (p: Point) => toScreen(cam, stage, p);
  return <Markers project={project} {...rest} />;
}
