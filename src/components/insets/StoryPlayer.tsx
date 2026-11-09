import { useEffect, useRef } from 'react';
import type { RegionId } from '../../data/types';
import { useStory } from './engine';
import { STORIES, VIEW, conceptRange } from './stories';

type Props = {
  region: RegionId;
  /** A concept to show: the diagram plays that concept's steps once and rests on the last. */
  concept: string | null;
  reduced: boolean;
  /** Hold the diagram on this step (paused), e.g. the trace step someone selected. */
  pinned?: number | null;
  /** Called whenever the shown step changes, e.g. to highlight matching code. */
  onStep?: (step: number) => void;
};

/** The landmark's mechanism as a small boxes-and-arrows diagram, step by step. */
export function StoryPlayer({ region, concept, reduced, pinned = null, onStep }: Props) {
  const story = STORIES[region];
  const range = conceptRange(story, concept);
  const { step, t, playing, fading, from, to, goTo, toggle, replay } = useStory(story.steps, {
    reduced,
    range,
    autoplay: pinned === null,
    loop: range === null,
  });

  // A different concept on the same player: play its steps from the start.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) goTo(from);
    else replay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    if (pinned !== null) goTo(pinned);
  }, [pinned, goTo]);

  useEffect(() => {
    onStep?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <figure
      className="inset"
      aria-label={story.title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') goTo(step + 1);
        else if (e.key === 'ArrowLeft') goTo(step - 1);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <figcaption className="inset__kicker">Big picture · {story.title}</figcaption>
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
                className={`inset__dot ${i === step ? 'is-on' : ''} ${i < step ? 'is-past' : ''} ${range && i >= from && i <= to ? 'is-range' : ''}`}
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
    </figure>
  );
}
