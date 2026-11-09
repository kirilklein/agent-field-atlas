import { useEffect, useRef, type CSSProperties } from 'react';
import type { RegionId } from '../../data/types';
import { StoryPlayer } from './StoryPlayer';

export const CALLOUT_GAP = 56; // from the landmark's centre to the panel's edge

type Props = {
  region: RegionId;
  concept: string | null;
  /** The landmark's screen position. */
  x: number;
  y: number;
  /** Beside the landmark: its width. Docked along the bottom: its left and right. */
  width: number;
  dock: { left: number; right: number } | null;
  stageH: number;
  reduced: boolean;
  focusOnOpen: boolean;
  onClose: () => void;
};

/** The landmark's diagram, large, beside the landmark on the map. */
export function DiagramCallout({ region, concept, x, y, width, dock, stageH, reduced, focusOnOpen, onClose }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusOnOpen) ref.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let style: CSSProperties;
  let leader: CSSProperties | null = null;
  if (dock) {
    style = { left: dock.left, right: dock.right, bottom: 10 };
  } else {
    const h = ref.current?.offsetHeight ?? width * 0.9;
    style = { left: x + CALLOUT_GAP, top: Math.max(12, Math.min(stageH - h - 12, y - h / 2)), width };
    leader = { left: x + 24, top: y, width: CALLOUT_GAP - 24 };
  }

  return (
    <>
      {leader && <span className="diagram-leader" style={leader} aria-hidden="true" />}
      <section ref={ref} className="diagram-callout" style={style} tabIndex={-1} aria-label="Big picture diagram">
        <button type="button" className="icon-btn diagram-callout__close" onClick={onClose} aria-label="Close the diagram">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <StoryPlayer region={region} concept={concept} reduced={reduced} />
      </section>
    </>
  );
}
