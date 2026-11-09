import { LANDMARKS, MAIN_ROUTE, landmarkById } from '../data/map';
import { SKETCHES, TEASERS } from '../data/sketches';
import { elevationLabel } from '../data/terrain';
import type { RegionId } from '../data/types';
import { TOTAL_STOPS, type Progress } from '../lib/progress';
import { hrefFor } from '../lib/route';
import { Hub } from './Hub';
import { Sketch } from './Sketch';

export function Cartouche({ onStart, reduced }: { onStart: () => void; reduced: boolean }) {
  return (
    <section className="cartouche" aria-labelledby="atlas-title">
      <p className="kicker">A field atlas · Plate I</p>
      <h1 id="atlas-title" className="cartouche__title">
        Agent Field Atlas
      </h1>
      <p className="cartouche__lede">
        Build an LLM agent from scratch: a paper-search assistant in plain Python, from a single model call to an
        evaluated agent.
      </p>
      <Hub reduced={reduced} />
      <button type="button" className="btn btn--primary btn--start" onClick={onStart}>
        Start the trail
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
  /** Concept under the pointer on the map, previewed in the sketch. */
  hovered: string | null;
  onSelect: (concept: string | null) => void;
  onOpen: (concept: string) => void;
  /** Whether this landmark's animated inset is open on the map. */
  inset: boolean;
  onWatch: (open: boolean) => void;
};

export function RegionCard({ region, progress, reduced, selected, hovered, onSelect, onOpen, inset, onWatch }: RegionCardProps) {
  const l = landmarkById[region];
  const i = MAIN_ROUTE.indexOf(region);
  const onward = l.kind === 'main' ? MAIN_ROUTE[i + 1] : l.from;
  const branches = LANDMARKS.filter((b) => b.from === region);
  const sketch = SKETCHES[region];
  const focus = hovered ?? selected;
  const firstUnvisited = l.concepts.find((c) => !progress.has(region, c.id)) ?? l.concepts[0];

  return (
    <section className="region-card" aria-labelledby="region-title">
      <p className="kicker">
        {l.kind === 'main' ? `Landmark ${l.mark} · Main trail` : `Optional branch · from ${landmarkById[l.from!].title}`} ·{' '}
        {elevationLabel(l.x, l.y)}
      </p>
      <h2 id="region-title" className="region-card__title" tabIndex={-1}>
        {l.title}
      </h2>
      <p className="region-card__builds">{l.builds}</p>
      <button type="button" className="watch-link" onClick={() => onWatch(!inset)} aria-pressed={inset}>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          {inset ? <path d="M3 2 H5 V10 H3 Z M7 2 H9 V10 H7 Z" fill="currentColor" /> : <path d="M3 1.8 L10 6 L3 10.2 Z" fill="currentColor" />}
        </svg>
        {inset ? 'Close the animation on the map' : 'Watch it work on the map'}
      </button>

      <Sketch
        key={region}
        hold={inset}
        sketch={sketch}
        highlight={focus ? sketch.concepts[focus] ?? null : null}
        reduced={reduced}
        label={`Field sketch: ${l.title}`}
      />
      <p className="region-card__idea">{l.idea}</p>

      <h3 className="section-title region-card__list-title">Explore {l.concepts.length} stops</h3>
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
      {branches.length > 0 && (
        <p className="region-card__branches">
          Optional:{' '}
          {branches.map((b, n) => (
            <span key={b.id}>
              {n > 0 && ' · '}
              <a href={hrefFor({ region: b.id, concept: null })}>{b.title}</a>
            </span>
          ))}
        </p>
      )}
      <div className="region-card__foot">
        {onward ? (
          <a className="onward" href={hrefFor({ region: onward, concept: null })}>
            {l.kind === 'branch' ? 'Return to ' : 'Next: '}
            {landmarkById[onward].title} →
          </a>
        ) : (
          <a className="onward" href="#atlas">
            Summit reached · back to the atlas
          </a>
        )}
      </div>
    </section>
  );
}

export function Legend({ depth, gestureHint, progress }: { depth: 0 | 1 | 2; gestureHint: string | null; progress: Progress }) {
  const scales = ['Overview', 'Region', 'Detail'];
  return (
    <div className="legend" aria-label="Map legend">
      <ul className="legend__keys">
        <li>
          <svg width="28" height="8" aria-hidden="true">
            <path d="M1 4h26" className="legend-trail" />
          </svg>
          Main trail
        </li>
        <li>
          <svg width="28" height="8" aria-hidden="true">
            <path d="M1 4h26" className="legend-branch" />
          </svg>
          Optional branch
        </li>
        <li>
          <span className="legend-dot" aria-hidden="true" />
          Concept stop
        </li>
      </ul>
      {gestureHint && <p className="legend__gesture">{gestureHint}</p>}
      <p className="legend__progress">
        <span>
          <strong>{progress.visited.size}</strong> of {TOTAL_STOPS} lessons visited
        </span>
        {progress.visited.size > 0 && (
          <button type="button" className="linkish" onClick={progress.reset}>
            Reset
          </button>
        )}
      </p>
      <div className="scale" aria-label={`Scale: ${scales[depth]}`}>
        {scales.map((s, i) => (
          <span key={s} className={`scale__tick ${i === depth ? 'is-on' : ''}`}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
