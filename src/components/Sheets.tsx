import { useState } from 'react';
import { EXAMPLE } from '../data/companion';
import { LANDMARKS, MAIN_ROUTE, landmarkById } from '../data/map';
import { TEASERS } from '../data/sketches';
import type { RegionId } from '../data/types';
import { TOTAL_STOPS, type Progress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { Hub } from './Hub';
import { StoryPlayer } from './insets/StoryPlayer';
import { Sources } from './Sources';

export function Cartouche({ onStart, reduced }: { onStart: () => void; reduced: boolean }) {
  return (
    <section className="cartouche" aria-labelledby="atlas-title">
      <p className="kicker">A field atlas · Plate I</p>
      <h1 id="atlas-title" className="cartouche__title">
        Agent Field Atlas
      </h1>
      <p className="cartouche__lede">
        Build an LLM agent from scratch in plain Python, from a single model call to an evaluated agent.
      </p>
      <p className="cartouche__example">
        <span>The example</span>A trip planner that answers “{EXAMPLE.question}”
      </p>
      <Hub reduced={reduced} />
      <button type="button" className="btn btn--primary btn--start" onClick={onStart}>
        Start the concept tour
        <span aria-hidden="true"> →</span>
      </button>
      <p className="cartouche__meta">
        {MAIN_ROUTE.length} landmarks · {LANDMARKS.filter((l) => l.kind === 'branch').length} branches · no API key
      </p>
    </section>
  );
}

type RegionCardProps = {
  region: RegionId;
  progress: Progress;
  reduced: boolean;
  /** Concept picked on the map or in the list (a preview, not yet opened). */
  selected: string | null;
  /** Concept under the pointer on the map, previewed in the diagram. */
  hovered: string | null;
  onSelect: (concept: string | null) => void;
  onOpen: (concept: string) => void;
  /** Where the big-picture diagram is: floating beside the landmark (open or closed), or inline here. */
  diagram: 'open' | 'closed' | 'inline';
  onShowDiagram: () => void;
  onDeeper: () => void;
};

export function RegionCard({ region, progress, reduced, selected, hovered, onSelect, onOpen, diagram, onShowDiagram, onDeeper }: RegionCardProps) {
  const l = landmarkById[region];
  const i = MAIN_ROUTE.indexOf(region);
  const onward = l.kind === 'main' ? MAIN_ROUTE[i + 1] : l.from;
  const branches = LANDMARKS.filter((b) => b.from === region);
  const focus = hovered ?? selected;
  const firstUnvisited = l.concepts.find((c) => !progress.has(region, c.id)) ?? l.concepts[0];
  // Go deeper stays open per landmark, and opens itself when a stop is picked on the map.
  const [deeperFor, setDeeperFor] = useState<RegionId | null>(null);
  const deeper = deeperFor === region || selected !== null;

  return (
    <section className="region-card" aria-labelledby="region-title">
      <p className="kicker">
        {l.kind === 'main' ? `Landmark ${l.mark}` : `Branch ${l.mark} · from ${landmarkById[l.from!].title}`} ·{' '}
        <span className="region-card__place">{l.title}</span>
      </p>
      <h2 id="region-title" className="region-card__title" tabIndex={-1}>
        {l.question}
      </h2>

      {diagram === 'inline' && <StoryPlayer key={region} region={region} concept={focus} reduced={reduced} />}
      {diagram === 'closed' && (
        <button type="button" className="btn btn--ghost show-diagram" data-show-diagram onClick={onShowDiagram}>
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M3 1.8 L10 6 L3 10.2 Z" fill="currentColor" />
          </svg>
          Show the diagram
        </button>
      )}
      <p className="region-card__idea">{l.idea}</p>

      <div className="region-card__next">
        {onward ? (
          <a className="btn btn--primary" href={hrefFor({ region: onward, concept: null })}>
            {l.kind === 'branch' ? 'Back to ' : 'Next concept: '}
            {landmarkById[onward].title} <span aria-hidden="true">→</span>
          </a>
        ) : (
          <a className="btn btn--primary" href="#atlas">
            Summit reached · back to the atlas
          </a>
        )}
      </div>
      {branches.length > 0 && (
        <p className="region-card__branches">
          Side trips:{' '}
          {branches.map((b, n) => (
            <span key={b.id}>
              {n > 0 && ' · '}
              <a href={hrefFor({ region: b.id, concept: null })}>{b.title}</a>
            </span>
          ))}
        </p>
      )}

      <details
        className="region-card__deeper"
        open={deeper}
        onToggle={(e) => {
          const open = e.currentTarget.open;
          if (open === deeper) return;
          setDeeperFor(open ? region : null);
          if (open) onDeeper();
          else onSelect(null);
        }}
      >
        <summary>
          Go deeper: {l.concepts.length} stops, code{l.concepts.some((c) => c.id === 'checkpoint' || c.id === 'run-it') ? ', runnable' : ''}
        </summary>
        <p className="region-card__builds">
          <span>You build:</span> {l.builds}
        </p>
      <ol className="concept-list" aria-label={`Concepts at ${l.title}`}>
        {l.concepts.map((c, n) => {
          const isSel = selected === c.id;
          const visited = progress.has(region, c.id);
          return (
            <li key={c.id} className={isSel ? 'is-selected' : undefined}>
              <button
                type="button"
                className={`concept-link ${visited ? 'is-visited' : ''}`}
                aria-expanded={isSel}
                onClick={() => onSelect(isSel ? null : c.id)}
              >
                <span className="concept-link__n" aria-hidden="true">
                  {visited ? '✓' : n + 1}
                </span>
                <span>
                  {c.title}
                  {visited && <span className="sr-only"> (visited)</span>}
                </span>
                {region === 'tool-calling' && c.id === 'inspect-a-call' && <span className="badge">Workbench</span>}
                {(c.id === 'checkpoint' || c.id === 'run-it') && <span className="badge badge--run">Runnable</span>}
              </button>
              {isSel && (
                <div className="concept-preview">
                  <p>{TEASERS[`${region}/${c.id}`]}</p>
                  <button type="button" className="btn btn--primary concept-preview__open" onClick={() => onOpen(c.id)}>
                    Open the lesson <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!selected && (
        <button type="button" className="btn btn--ghost region-card__start" onClick={() => onOpen(firstUnvisited.id)}>
          Open the lessons <span aria-hidden="true">→</span>
        </button>
      )}
        <Sources sources={l.sources} />
      </details>
    </section>
  );
}

export function Legend({ gestureHint, progress }: { gestureHint: string | null; progress: Progress }) {
  if (!gestureHint && progress.visited.size === 0) return null;
  return (
    <div className="legend">
      {gestureHint && <span>{gestureHint}</span>}
      {progress.visited.size > 0 && (
        <span className="legend__progress">
          {progress.visited.size}/{TOTAL_STOPS} visited
          <button type="button" className="linkish" onClick={progress.reset}>
            Reset
          </button>
        </span>
      )}
    </div>
  );
}
