import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { RegionId } from '../../data/types';
import { landmarkById } from '../../data/map';
import type { Size } from '../../lib/camera';
import { useStory } from './engine';
import { STORIES, VIEW } from './stories';

export const INSET_W = 400;
export const INSET_GAP = 56; // from the landmark's centre to the inset's edge

type Props = {
  region: RegionId;
  /** The landmark's screen position: the inset hangs off it. */
  x: number;
  y: number;
  stage: Size;
  /** Docked along the bottom of the map (no room beside the landmark). */
  dock: { left: number; right: number } | null;
  reduced: boolean;
  onClose: () => void;
};

/**
 * An animated diagram that unfolds from the landmark, like an inset on a
 * printed map: the mechanism of this stretch of the trail, step by step.
 */
export function FieldInset({ region, x, y, stage, dock, reduced, onClose }: Props) {
  const story = STORIES[region];
  const l = landmarkById[region];
  const { step, t, playing, fading, goTo, toggle, replay } = useStory(story.steps, reduced);
  const ref = useRef<HTMLElement>(null);
  const titleId = `inset-title-${region}`;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  // Captions differ in length; measure so the inset stays inside the map.
  const [h, setH] = useState(380);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  }, [step]);

  let style: CSSProperties;
  let leader: { x: number; y: number; w: number } | null = null;
  if (dock) {
    style = { left: dock.left, right: dock.right, bottom: 8 };
  } else {
    const left = x + INSET_GAP;
    const top = Math.max(12, Math.min(stage.h - h - 12, y - h / 2));
    style = { left, top, width: INSET_W };
    leader = { x: x + 24, y, w: INSET_GAP - 24 };
  }

  return (
    <>
      {leader && <span className="inset-leader" style={{ left: leader.x, top: leader.y, width: leader.w }} aria-hidden="true" />}
      <section
        ref={ref}
        className={`inset ${dock ? 'inset--docked' : ''}`}
        style={style}
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') goTo(step + 1);
          else if (e.key === 'ArrowLeft') goTo(step - 1);
          else if (e.key === ' ' && e.target === e.currentTarget) toggle();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <header className="inset__head">
          <div>
            <p className="inset__kicker">
              Field inset · {l.kind === 'main' ? `Landmark ${l.mark}` : `Branch ${l.mark}`}
            </p>
            <h3 className="inset__title" id={titleId}>
              {story.title}
            </h3>
          </div>
          <button type="button" className="icon-btn inset__close" onClick={onClose} aria-label="Close the inset">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <svg
          className={`inset__svg ${fading ? 'is-fading' : ''}`}
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          role="img"
          aria-label={`${story.title}: step ${step + 1} of ${story.steps.length}. ${story.steps[step].caption}`}
        >
          {story.draw(step, t)}
        </svg>
        <p className="inset__caption" aria-live="polite">
          <span className="inset__num">{step + 1}</span>
          {story.steps[step].caption}
        </p>
        <div className="inset__controls">
          <button type="button" className="inset__btn" onClick={() => goTo(step - 1)} disabled={step === 0} aria-label="Previous step">
            ‹
          </button>
          <button type="button" className="inset__btn inset__play" onClick={toggle} aria-pressed={playing}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="inset__btn" onClick={() => goTo(step + 1)} disabled={step === story.steps.length - 1} aria-label="Next step">
            ›
          </button>
          <ol className="inset__dots" aria-label="Steps">
            {story.steps.map((st, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`inset__dot ${i === step ? 'is-on' : ''} ${i < step ? 'is-past' : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={`Step ${i + 1}: ${st.caption}`}
                  aria-current={i === step ? 'step' : undefined}
                />
              </li>
            ))}
          </ol>
          <button type="button" className="inset__btn inset__replay" onClick={replay}>
            Replay
          </button>
        </div>
      </section>
    </>
  );
}
