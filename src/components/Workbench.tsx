import { forwardRef } from 'react';
import { lessonFor } from '../data/lessons';
import { MAIN_ROUTE, landmarkById } from '../data/map';
import { TRACES } from '../data/traces';
import type { RegionId } from '../data/types';
import { inlineCode } from '../lib/highlight';
import { hrefFor } from '../lib/route';
import { CodeBlock } from './CodeBlock';
import { StoryPlayer } from './insets/StoryPlayer';
import { Sources } from './Sources';
import { CheckpointView } from './CheckpointView';
import { CompareView } from './CompareView';
import { IntervalView } from './IntervalView';
import { TokenCostView } from './TokenCostView';
import { TraceView } from './TraceView';

type Props = { region: RegionId; concept: string; reduced: boolean; onClose: () => void };

function nextLandmark(region: RegionId): RegionId | null {
  const l = landmarkById[region];
  if (l.kind === 'branch') return l.from ?? null;
  const i = MAIN_ROUTE.indexOf(region);
  return MAIN_ROUTE[i + 1] ?? null;
}

export const Workbench = forwardRef<HTMLHeadingElement, Props>(function Workbench({ region, concept, reduced, onClose }, headingRef) {
  const l = landmarkById[region];
  const idx = l.concepts.findIndex((c) => c.id === concept);
  const c = l.concepts[idx];
  const lesson = lessonFor(region, concept);
  const prev = l.concepts[idx - 1];
  const next = l.concepts[idx + 1];
  const onward = nextLandmark(region);

  return (
    <article className="workbench" aria-labelledby="wb-title">
      <header className="wb__head">
        <p className="kicker">
          {l.title} · Concept {idx + 1} of {l.concepts.length}
        </p>
        <h2 id="wb-title" ref={headingRef} tabIndex={-1} className="wb__title">
          {c.title}
        </h2>
        <p className="wb__builds">
          <span>This stretch builds:</span> {l.builds}
        </p>
        <button type="button" className="icon-btn wb__close" onClick={onClose} aria-label={`Close lesson, back to ${l.title}`}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {lesson ? (
        <>
          <StoryPlayer key={`${region}/${concept}`} region={region} concept={concept} reduced={reduced} />
          <p className="wb__why">
            <strong>Why it matters.</strong> {inlineCode(lesson.why)}
          </p>
          <ol className="wb__steps">
            {lesson.steps.map((st, n) => (
              <li key={n}>{inlineCode(st)}</li>
            ))}
          </ol>
          {lesson.terms && (
            <details className="wb__terms">
              <summary>Key terms ({lesson.terms.length})</summary>
              <dl>
                {lesson.terms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{inlineCode(t.def)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {lesson.example && (
            <section className="wb__example" aria-label="Example">
              <h3 className="section-title">Example</h3>
              <CodeBlock code={lesson.example.code} language={lesson.example.language} label={lesson.example.label} />
            </section>
          )}

          {lesson.interaction?.kind === 'trace' && TRACES[lesson.interaction.traceId] && (
            <TraceView key={lesson.interaction.traceId} trace={TRACES[lesson.interaction.traceId]} prompt={lesson.interaction.prompt} reduced={reduced} />
          )}
          {lesson.interaction?.kind === 'compare' && <CompareView />}
          {lesson.interaction?.kind === 'checkpoint' && <CheckpointView key={String(lesson.interaction.id)} id={lesson.interaction.id} />}
          {lesson.interaction?.kind === 'tokens' && <TokenCostView />}
          {lesson.interaction?.kind === 'interval' && <IntervalView />}
        </>
      ) : (
        <p className="wb__explain">This lesson is still being surveyed.</p>
      )}

      <Sources sources={lesson?.sources} />

      <nav className="wb__nav" aria-label="Lesson navigation">
        {prev ? (
          <a className="wb__navlink" href={hrefFor({ region, concept: prev.id })}>
            <span className="wb__navdir">← Previous</span>
            <span>{prev.title}</span>
          </a>
        ) : (
          <span />
        )}
        {next ? (
          <a className="wb__navlink wb__navlink--next" href={hrefFor({ region, concept: next.id })}>
            <span className="wb__navdir">Next →</span>
            <span>{next.title}</span>
          </a>
        ) : onward ? (
          <a className="wb__navlink wb__navlink--next" href={hrefFor({ region: onward, concept: null })}>
            <span className="wb__navdir">{l.kind === 'branch' ? 'Back to the trail →' : 'Next landmark →'}</span>
            <span>{landmarkById[onward].title}</span>
          </a>
        ) : (
          <a className="wb__navlink wb__navlink--next" href="#atlas">
            <span className="wb__navdir">Trail complete →</span>
            <span>Back to the atlas</span>
          </a>
        )}
      </nav>
    </article>
  );
});
