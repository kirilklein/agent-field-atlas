import { Fragment, memo, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { GROUNDING_CASES, sourceLabel, type Claim, type Evidence, type GroundingCase } from '../data/grounding';

/* ------------------------------------------------------------------ */
/* State machine: predict → reveal → revise → fixed, for each case     */
/* ------------------------------------------------------------------ */

type Phase = 'predict' | 'reveal' | 'revise' | 'fixed';
const NOTHING = 'nothing';

type State = {
  caseIndex: number;
  phase: Phase;
  /** A claim id, NOTHING, or null. */
  marked: string | null;
  /** Per itinerary row, the claim whose trace is open. */
  opened: Record<number, string>;
  /** The trace opened by the reveal itself; it waits for the seam. */
  firstTrace: string | null;
  pick: number | null;
  wrongWhy: string | null;
};

type Action =
  | { type: 'mark'; id: string }
  | { type: 'reveal' }
  | { type: 'open'; id: string }
  | { type: 'startRevise' }
  | { type: 'pick'; index: number }
  | { type: 'applyRevision' }
  | { type: 'freshCase' }
  | { type: 'startOver' };

function startCase(caseIndex: number): State {
  return { caseIndex, phase: 'predict', marked: null, opened: {}, firstTrace: null, pick: null, wrongWhy: null };
}

function reducer(state: State, action: Action): State {
  const c = GROUNDING_CASES[state.caseIndex];
  const u = c.unverified;
  switch (action.type) {
    case 'mark': {
      if (state.phase !== 'predict') return state;
      return { ...state, marked: state.marked === action.id ? null : action.id };
    }
    case 'reveal': {
      if (state.phase !== 'predict' || !state.marked) return state;
      const first = state.marked === NOTHING ? u.id : state.marked;
      return { ...state, phase: 'reveal', opened: { [c.claims[first].row]: first }, firstTrace: first };
    }
    case 'open': {
      if (state.phase === 'predict') return state;
      return { ...state, opened: { ...state.opened, [c.claims[action.id].row]: action.id }, firstTrace: null };
    }
    case 'startRevise': {
      if (state.phase !== 'reveal') return state;
      return { ...state, phase: 'revise', opened: { ...state.opened, [u.row]: u.id }, firstTrace: null, pick: null, wrongWhy: null };
    }
    case 'pick': {
      if (state.phase !== 'revise') return state;
      return { ...state, pick: action.index, wrongWhy: null };
    }
    case 'applyRevision': {
      if (state.phase !== 'revise' || state.pick === null) return state;
      const chosen = u.revisions[state.pick];
      if (!chosen.correct) return { ...state, wrongWhy: chosen.why };
      return { ...state, phase: 'fixed', opened: { ...state.opened, [u.row]: u.id }, wrongWhy: null };
    }
    case 'freshCase': {
      if (state.phase !== 'fixed' || state.caseIndex !== 0) return state;
      return startCase(1);
    }
    case 'startOver':
      return startCase(0);
  }
}

const STEPS = ['Judge', 'Reveal', 'Revise', 'Fresh case'];

function stepIndex(s: State): number {
  if (s.caseIndex > 0) return 3;
  if (s.phase === 'predict') return 0;
  if (s.phase === 'reveal') return 1;
  return 2;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** `text` with the first occurrence of `part` emphasised. */
function emphasise(text: string, part: string | null): ReactNode {
  if (!part) return text;
  const at = text.indexOf(part);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <em className="tf-differs">{part}</em>
      {text.slice(at + part.length)}
    </>
  );
}

function correctRevision(c: GroundingCase): string {
  return c.unverified.revisions.find((r) => r.correct)!.text;
}

function verdict(c: GroundingCase, marked: string | null): string {
  const u = c.unverified;
  if (marked === NOTHING) return `You said nothing here is unverified. One phrase is: “${u.phrase}”.`;
  if (marked === u.id) return `You marked “${u.phrase}”. Right: no tool result establishes it.`;
  const phrase = marked ? c.claims[marked].phrase : '';
  return `You marked “${phrase}”. A tool result establishes that one. The unverified phrase is “${u.phrase}”.`;
}

/* ------------------------------------------------------------------ */
/* Trace lines, measured from the laid-out text                        */
/* ------------------------------------------------------------------ */

type TraceKind = 'established' | 'unverified' | 'revised';
type TraceGeom = {
  id: string;
  kind: TraceKind;
  first: boolean;
  underlines: string[];
  leader: string;
  curve: string;
  end: { x: number; y: number };
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function measureTrace(grid: HTMLElement, id: string, kind: TraceKind, first: boolean): TraceGeom | null {
  const phrase = grid.querySelector<HTMLElement>(`[data-claim="${id}"]`);
  const target = grid.querySelector<HTMLElement>(`[data-passage-for="${id}"]`);
  const row = phrase?.closest<HTMLElement>('.tf-row');
  if (!phrase || !target || !row) return null;
  const box = grid.getBoundingClientRect();
  const x = (v: number) => r1(v - box.left);
  const y = (v: number) => r1(v - box.top);

  const rects = [...phrase.getClientRects()];
  const underlines = rects.map((r) => `M ${x(r.left + 3)} ${y(r.bottom - 3)} H ${x(r.right - 3)}`);
  const last = rects[rects.length - 1];
  const lineY = y(last.bottom - 3);
  const rowRight = x(row.getBoundingClientRect().right);
  const leader = `M ${x(last.right + 2)} ${lineY} H ${rowRight}`;

  const t = target.getBoundingClientRect();
  const endX = x(t.left - 6);
  const endY = y(t.top + Math.min(14, t.height / 2));
  const bend = (endX - rowRight) / 2;
  const curve = `M ${rowRight} ${lineY} C ${r1(rowRight + bend)} ${lineY} ${r1(endX - bend)} ${endY} ${endX} ${endY}`;
  return { id, kind, first, underlines, leader, curve, end: { x: endX, y: endY } };
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

export function TwoFlorences() {
  const [state, dispatch] = useReducer(reducer, 0, startCase);
  const c = GROUNDING_CASES[state.caseIndex];
  const u = c.unverified;
  const fixed = state.phase === 'fixed';
  const sealed = state.phase === 'predict';
  const pristine = state.caseIndex === 0 && sealed && !state.marked;

  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [traces, setTraces] = useState<TraceGeom[]>([]);
  const [layoutTick, setLayoutTick] = useState(0);

  /* Remeasure when the grid changes size or the fonts arrive. */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const bump = () => setLayoutTick((n) => n + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(grid);
    document.fonts?.ready.then(bump);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || sealed) {
      setTraces([]);
      return;
    }
    const next: TraceGeom[] = [];
    for (const id of Object.values(state.opened)) {
      const isUnverified = id === u.id;
      const kind: TraceKind = isUnverified ? (fixed ? 'revised' : 'unverified') : 'established';
      const geom = measureTrace(grid, id, kind, id === state.firstTrace);
      if (geom) next.push(geom);
    }
    setTraces(next);
  }, [state, sealed, fixed, u.id, layoutTick]);

  /* Move focus to the new controls when the phase or case changes. */
  const focusedFor = useRef(`${state.caseIndex}/${state.phase}`);
  useEffect(() => {
    const step = `${state.caseIndex}/${state.phase}`;
    if (focusedFor.current === step) return;
    focusedFor.current = step;
    if (state.phase === 'predict') {
      topRef.current?.focus();
      return;
    }
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }, [state.phase, state.caseIndex]);

  const startOver = () => {
    dispatch({ type: 'startOver' });
    topRef.current?.focus();
  };

  /* Which claim windows stay lit on the "established" side. */
  const claimIds = Object.keys(c.claims).sort((a, b) => Number(a.split('-').pop()) - Number(b.split('-').pop()));
  const establishedLit = claimIds.map((id) => (id === u.id ? fixed : true));

  const phraseText = (claim: Claim) => (fixed && claim.id === u.id ? correctRevision(c) : claim.phrase);

  const renderPhrase = (claim: Claim) => {
    const text = phraseText(claim);
    const isOpen = !sealed && state.opened[claim.row] === claim.id;
    const showDiffers = isOpen && claim.id === u.id && !fixed;
    const classes = [
      'tf-phrase',
      sealed && state.marked === claim.id ? 'is-marked' : '',
      isOpen ? 'is-open' : '',
      !sealed && claim.id === u.id ? (fixed ? 'is-revised' : 'is-unverified') : '',
    ].join(' ');
    const action: Action = sealed ? { type: 'mark', id: claim.id } : { type: 'open', id: claim.id };
    // A span, not a <button>: buttons are always inline-block, so a phrase could not wrap with its sentence.
    return (
      <span
        key={claim.id}
        role="button"
        tabIndex={0}
        className={classes}
        data-claim={claim.id}
        data-phrase={claim.phrase}
        aria-pressed={sealed ? state.marked === claim.id : undefined}
        aria-expanded={sealed ? undefined : isOpen}
        aria-controls={sealed ? undefined : `tf-slot-${c.id}-${claim.row}`}
        onClick={() => dispatch(action)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          dispatch(action);
        }}
      >
        {showDiffers ? emphasise(text, u.differs.phrase) : text}
      </span>
    );
  };

  const renderSlot = (row: number) => {
    if (sealed) return null;
    const id = state.opened[row];
    if (!id) return null;
    const claim = c.claims[id];
    const first = id === state.firstTrace;
    if (claim.id === u.id && fixed) {
      return <Passage key={`${id}-revised`} forId={id} evidence={u.closest} label="Established by" first={false} />;
    }
    if (claim.evidence) {
      return <Passage key={id} forId={id} evidence={claim.evidence} label="Established by" first={first} />;
    }
    return (
      <div key={`${id}-unverified`} className={`tf-unverified ${first ? 'is-first' : ''}`}>
        <p className="tf-stamp" data-passage-for={id}>
          Unverified
        </p>
        <p className="tf-unverified__why">
          No passage says “<em className="tf-differs">{u.differs.phrase}</em>”.
        </p>
        <Passage forId={null} evidence={u.closest} label="Closest passage" first={first} differs={u.differs.passage} />
      </div>
    );
  };

  return (
    <section
      className={`tf tf--${state.phase} ${c.synthetic ? 'tf--fresh' : 'tf--first-case'}`}
      data-phase={state.phase}
      data-case={c.id}
      aria-label="Two Florences"
    >
      <div className="tf__painting" aria-hidden="true">
        <div className="tf__frame">
          <Street mood="warm" claimLit={establishedLit.map(() => true)} />
          <div className="tf__cool">
            <Street mood="cool" claimLit={establishedLit} />
          </div>
          <div className="tf__seam" />
          <div className="tf__rain" />
          <div className="tf__vignette" />
        </div>
      </div>

      <div className="tf__content">
        <div className="tf__top tf-scrim" ref={topRef} tabIndex={-1}>
          <div className="tf__toprow">
            <ol className="tf__steps" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s} className={i === stepIndex(state) ? 'is-current' : i < stepIndex(state) ? 'is-done' : ''} aria-current={i === stepIndex(state) ? 'step' : undefined}>
                  {s}
                </li>
              ))}
            </ol>
            {c.synthetic ? <span className="tf__badge">Synthetic fixture</span> : <span className="tf__badge tf__badge--recorded">Recorded run</span>}
            {!pristine && (
              <button type="button" className="btn btn--ghost tf-btn tf-btn--small" data-tf-action="start-over" onClick={startOver}>
                Start over
              </button>
            )}
          </div>
          <p className="tf__question">
            <span className="tf__label">Question</span> “{c.question}”
          </p>
          <p className="tf__note">{c.note}</p>
        </div>

        <div className="tf__grid" ref={gridRef}>
          <p className="tf__side tf__side--promised">What the agent promised</p>
          <p className="tf__side tf__side--established">{sealed ? 'Tool results: not shown yet' : 'What its tool results establish'}</p>
          {c.rows.map((segments, row) => (
            <Fragment key={`${c.id}-${row}`}>
              <p className="tf-row tf-scrim">
                {segments.map((seg, n) => (seg.kind === 'text' ? <Fragment key={n}>{seg.text}</Fragment> : renderPhrase(c.claims[seg.id])))}
              </p>
              <div
                className={`tf-slot ${!sealed && state.opened[row] ? 'tf-scrim' : 'is-empty'}`}
                id={`tf-slot-${c.id}-${row}`}
                data-tf-slot={row}
                aria-live="polite"
              >
                {renderSlot(row)}
              </div>
            </Fragment>
          ))}
          <svg className="tf__traces" aria-hidden="true" focusable="false">
            {traces.map((t) => (
              <g key={`${t.id}-${t.kind}`} className={`tf-trace tf-trace--${t.kind} ${t.first ? 'is-first' : ''}`}>
                {t.underlines.map((d, i) => (
                  <path key={i} className="tf-trace__under" d={d} pathLength={1} />
                ))}
                <path className="tf-trace__leader" d={t.leader} />
                <path className="tf-trace__casing" d={t.curve} />
                <path className="tf-trace__line" d={t.curve} pathLength={1} />
                <circle className="tf-trace__end" cx={t.end.x} cy={t.end.y} r={4.5} />
              </g>
            ))}
          </svg>
        </div>

        <div className="tf__panel tf-scrim" ref={panelRef}>
          {state.phase === 'predict' && (
            <>
              <p className="tf__hint">
                {c.synthetic
                  ? 'A new answer, no hints. Mark a phrase no tool result backs, or say there is none.'
                  : 'One detail goes beyond the sources. Mark it.'}
              </p>
              <p className="tf__status" aria-live="polite">
                {state.marked === NOTHING
                  ? 'Your call: nothing here is unverified.'
                  : state.marked
                    ? `Marked: “${c.claims[state.marked].phrase}”.`
                    : 'Nothing marked yet.'}
              </p>
              <div className="tf__actions">
                {c.synthetic && (
                  <button
                    type="button"
                    className="btn btn--ghost tf-btn"
                    data-tf-action="nothing"
                    aria-pressed={state.marked === NOTHING}
                    onClick={() => dispatch({ type: 'mark', id: NOTHING })}
                  >
                    Nothing here is unverified
                  </button>
                )}
                <button type="button" className="btn btn--primary tf-btn" data-tf-action="reveal" disabled={!state.marked} onClick={() => dispatch({ type: 'reveal' })}>
                  Reveal the evidence
                </button>
              </div>
            </>
          )}

          {state.phase === 'reveal' && (
            <>
              <p className="tf__verdict" role="status">
                {verdict(c, state.marked)}
              </p>
              <p className="tf__hint">Open any phrase to trace it to its source.</p>
              <div className="tf__actions">
                <button type="button" className="btn btn--primary tf-btn" data-tf-action="revise" data-autofocus onClick={() => dispatch({ type: 'startRevise' })}>
                  Fix the unverified phrase
                </button>
              </div>
            </>
          )}

          {state.phase === 'revise' && (
            <form
              className="tf-revise"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({ type: 'applyRevision' });
              }}
            >
              <fieldset>
                <legend>Replace “{u.phrase}” with words the source establishes.</legend>
                {u.revisions.map((r, i) => (
                  <label key={r.text} className={`tf-option ${state.pick === i ? 'is-picked' : ''}`}>
                    <input
                      type="radio"
                      name={`tf-revision-${c.id}`}
                      value={i}
                      data-tf-option={i}
                      data-autofocus={i === 0 ? true : undefined}
                      checked={state.pick === i}
                      onChange={() => dispatch({ type: 'pick', index: i })}
                    />
                    <span>{r.text}</span>
                  </label>
                ))}
              </fieldset>
              <p className="tf__feedback" role="status">
                {state.wrongWhy ? `Not quite. ${state.wrongWhy} Try another.` : ''}
              </p>
              <div className="tf__actions">
                <button type="submit" className="btn btn--primary tf-btn" data-tf-action="apply" disabled={state.pick === null}>
                  Use this wording
                </button>
              </div>
            </form>
          )}

          {state.phase === 'fixed' && (
            <>
              <p className="tf__verdict" role="status">
                {c.synthetic
                  ? 'Done. You checked a new answer with no hints, and every phrase now traces back to a passage.'
                  : 'Fixed. Every phrase now traces back to a passage, and the dark window is lit again.'}
              </p>
              <div className="tf__actions">
                {c.synthetic ? (
                  <button type="button" className="btn btn--ghost tf-btn" data-tf-action="start-over" data-autofocus onClick={startOver}>
                    Start over
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary tf-btn" data-tf-action="fresh" data-autofocus onClick={() => dispatch({ type: 'freshCase' })}>
                    Try a fresh case
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Passage({
  forId,
  evidence,
  label,
  first,
  differs,
}: {
  forId: string | null;
  evidence: Evidence;
  label: string;
  first: boolean;
  differs?: string;
}) {
  return (
    <figure className={`tf-passage ${first ? 'is-first' : ''}`} data-passage-for={forId ?? undefined}>
      <p className="tf-passage__label">{label}</p>
      <blockquote>“{emphasise(evidence.passage, differs ?? null)}”</blockquote>
      <figcaption>
        <code>{sourceLabel(evidence)}</code>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* The painting: one street in one-point perspective                   */
/* ------------------------------------------------------------------ */

type Mood = 'warm' | 'cool';

const VP = { x: 600, y: 330 };
/** Where the street meets the façades at the frame edge (x = 1200). */
const BASE_EDGE = 640;

/** `claims`: this façade carries one window per claim, centred at these u positions. */
type Building = { x0: number; x1: number; roof: number; tint: number; claims?: number[]; lantern?: true; door?: true };

/** Right side of the street. The left side is drawn mirrored. */
const RIGHT: Building[] = [
  { x0: 606, x1: 640, roof: -20, tint: 0 },
  { x0: 640, x1: 690, roof: 40, tint: 1 },
  { x0: 690, x1: 830, roof: -90, tint: 2, claims: [1 / 6, 0.5, 5 / 6] },
  { x0: 830, x1: 960, roof: 10, tint: 3, lantern: true },
  { x0: 960, x1: 1210, roof: -140, tint: 4, claims: [0.42, 0.6, 0.78] },
];
const LEFT: Building[] = [
  { x0: 606, x1: 650, roof: 10, tint: 3 },
  { x0: 650, x1: 735, roof: -50, tint: 0 },
  { x0: 735, x1: 870, roof: 30, tint: 1, door: true },
  { x0: 870, x1: 1040, roof: -110, tint: 2, lantern: true },
  { x0: 1040, x1: 1210, roof: 60, tint: 4 },
];

const PALETTE = {
  warm: {
    sky: ['#1c1838', '#4a2f5e', '#c4646a', '#f2a25c'],
    tints: ['#6b4636', '#5e3b3f', '#6e4a3a', '#563844', '#6a4232'],
    shade: '#140b12',
    eave: '#150d14',
    shutter: '#2e3a2a',
    lit: '#ffd27e',
    core: '#fff3cf',
    dark: '#1e1520',
    glow: '#ff9b45',
    ground: ['#4a3040', '#24161f', '#0e090f'],
    sheen: '#f2a25c',
    dome: '#3c2229',
    rim: '#f6b073',
    cloud: '#d97a6e',
  },
  cool: {
    sky: ['#0a1322', '#18293e', '#34506a', '#6f8ba1'],
    tints: ['#33404f', '#2c3846', '#364352', '#2a3442', '#313d4b'],
    shade: '#05080d',
    eave: '#090e15',
    shutter: '#1a2530',
    lit: '#ffe0a0',
    core: '#fff7e0',
    dark: '#0d131b',
    glow: '#ffc670',
    ground: ['#22324a', '#111a27', '#05080d'],
    sheen: '#6f8ba1',
    dome: '#17212e',
    rim: '#7f9bb2',
    cloud: '#4a6580',
  },
} as const;

const tAt = (x: number) => (x - VP.x) / (1200 - VP.x);
const baseAt = (x: number) => VP.y + (BASE_EDGE - VP.y) * tAt(x);
const roofAt = (b: Building, x: number) => VP.y + (b.roof - VP.y) * tAt(x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** A point on a façade: u runs along the building, v from street (0) to roof (1). */
const onFacade = (b: Building, u: number, v: number) => {
  const x = lerp(b.x0, b.x1, u);
  return { x, y: lerp(baseAt(x), roofAt(b, x), v) };
};
const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
const quad = (b: Building, u0: number, u1: number, v0: number, v1: number) =>
  pts([onFacade(b, u0, v1), onFacade(b, u1, v1), onFacade(b, u1, v0), onFacade(b, u0, v0)]);

type Win = { points: string; lit: boolean; level: number; cx: number; w: number; top: number; bottom: number; slot?: number; mullion: string };

const FLOORS: [number, number][] = [
  [0.3, 0.42],
  [0.52, 0.64],
  [0.74, 0.86],
];
const CLAIM_FLOORS: [number, number][] = [
  [0.66, 0.82],
  [0.38, 0.56],
];

function windowsOf(b: Building, mood: Mood, claimLit: boolean[], seed: number): Win[] {
  const out: Win[] = [];
  const cols = b.claims ? 3 : Math.max(1, Math.round((b.x1 - b.x0) / 30));
  const floors = b.claims ? CLAIM_FLOORS : FLOORS;
  floors.forEach(([v0, v1], fi) => {
    for (let i = 0; i < cols; i++) {
      const half = b.claims ? 14 / (b.x1 - b.x0) : 0.26 / cols;
      const uc = b.claims ? b.claims[i] : (i + 0.5) / cols;
      const u0 = uc - half;
      const u1 = uc + half;
      const slot = b.claims ? fi * cols + i : undefined;
      if (slot !== undefined && slot >= claimLit.length) continue;
      const lit = slot !== undefined ? (claimLit[slot] ?? false) : mood === 'warm';
      const top = onFacade(b, uc, v1);
      const bottom = onFacade(b, uc, v0);
      out.push({
        points: quad(b, u0, u1, v0, v1),
        lit,
        level: slot !== undefined ? 1 : 0.55 + (((i * 7 + fi * 5 + seed * 3) % 9) / 9) * 0.45,
        cx: top.x,
        w: onFacade(b, u1, v0).x - onFacade(b, u0, v0).x,
        top: top.y,
        bottom: bottom.y,
        slot,
        mullion: `M ${r1(top.x)} ${r1(top.y)} L ${r1(bottom.x)} ${r1(bottom.y)}`,
      });
    }
  });
  return out;
}

function Side({ buildings, mood, claimLit, p }: { buildings: Building[]; mood: Mood; claimLit: boolean[]; p: string }) {
  const pal = PALETTE[mood];
  const wins = buildings.map((b, bi) => windowsOf(b, mood, claimLit, bi));
  const allWins = wins.flat();
  return (
    <>
      {/* Reflections on the wet street, under everything else on this side. */}
      <g className="tf-refl" filter={`url(#${p}-smear)`}>
        {allWins
          .filter((w) => w.lit)
          .map((w, i) => {
            const base = baseAt(w.cx);
            const drop = base - w.bottom;
            return (
              <rect
                key={i}
                x={r1(w.cx - w.w * 0.4)}
                y={r1(base + drop * 0.25)}
                width={r1(Math.max(2, w.w * 0.8))}
                height={r1((w.bottom - w.top) * 1.4 + drop * 0.9 + 12)}
                fill={`url(#${p}-refl)`}
                opacity={w.level}
              />
            );
          })}
        {buildings.map((b, bi) => {
          if (!b.lantern || mood !== 'warm') return null;
          const l = onFacade(b, 0.5, 0.36);
          return <rect key={`l${bi}`} x={r1(l.x - 7)} y={r1(baseAt(l.x) + 6)} width={14} height={110} fill={`url(#${p}-refl)`} />;
        })}
      </g>

      <g filter={`url(#${p}-brush)`}>
        {buildings.map((b, bi) => {
          const eave = (x: number) => 4 + 34 * tAt(x);
          const front = pts([
            { x: b.x0, y: roofAt(b, b.x0) },
            { x: b.x1, y: roofAt(b, b.x1) },
            { x: b.x1, y: baseAt(b.x1) },
            { x: b.x0, y: baseAt(b.x0) },
          ]);
          const eaves = pts([
            { x: b.x0 - 2, y: roofAt(b, b.x0) + 1 },
            { x: b.x1 + 4, y: roofAt(b, b.x1 + 4) + 1 },
            { x: b.x1 + 4, y: roofAt(b, b.x1 + 4) - eave(b.x1) },
            { x: b.x0 - 2, y: roofAt(b, b.x0) - eave(b.x0) },
          ]);
          return (
            <g key={bi}>
              <polygon points={front} fill={pal.tints[b.tint]} />
              <polygon points={front} fill={`url(#${p}-depth)`} />
              <polygon points={quad(b, 0, 1, 0, 0.2)} fill={pal.shade} opacity={0.35} />
              <polygon points={eaves} fill={pal.eave} />
              <line x1={b.x1} y1={roofAt(b, b.x1)} x2={b.x1} y2={baseAt(b.x1)} stroke={pal.shade} strokeWidth={1.5} opacity={0.6} />
              <polygon points={quad(b, 0.42, 0.58, 0, 0.17)} fill={b.door && mood === 'warm' ? pal.lit : pal.dark} opacity={b.door && mood === 'warm' ? 0.85 : 1} />
              {!b.claims &&
                wins[bi].map((_, i) => {
                  const cols = Math.max(1, Math.round((b.x1 - b.x0) / 30));
                  const uc = ((i % cols) + 0.5) / cols;
                  const half = 0.26 / cols;
                  const [v0, v1] = FLOORS[Math.floor(i / cols)];
                  return (
                    <Fragment key={i}>
                      <polygon points={quad(b, uc - half - half * 0.75, uc - half - 0.01, v0, v1)} fill={pal.shutter} />
                      <polygon points={quad(b, uc + half + 0.01, uc + half + half * 0.75, v0, v1)} fill={pal.shutter} />
                    </Fragment>
                  );
                })}
            </g>
          );
        })}
      </g>

      <g className="tf-windows">
        {allWins.map((w, i) => (
          <g key={i} className={w.slot !== undefined ? 'tf-win tf-win--claim' : 'tf-win'}>
            {w.lit && <polygon points={w.points} fill={pal.glow} opacity={0.55 * w.level} filter={`url(#${p}-glow)`} />}
            <polygon points={w.points} fill={w.lit ? pal.lit : pal.dark} opacity={w.lit ? w.level : 1} />
            {w.lit && <polygon points={w.points} fill={`url(#${p}-core)`} opacity={w.level} />}
            <path d={w.mullion} stroke={pal.shade} strokeWidth={w.slot !== undefined ? 1.6 : 1} opacity={0.7} />
            {w.slot !== undefined && <polygon points={w.points} fill="none" stroke={pal.rim} strokeWidth={2} opacity={0.55} />}
          </g>
        ))}
        {buildings.map((b, bi) => {
          if (!b.lantern) return null;
          const l = onFacade(b, 0.5, 0.36);
          const on = mood === 'warm';
          return (
            <g key={`lantern${bi}`}>
              {on && <circle cx={l.x} cy={l.y} r={80} fill={`url(#${p}-halo)`} />}
              {on && <circle cx={l.x} cy={r1(l.y - 3)} r={11} fill={pal.glow} opacity={0.8} filter={`url(#${p}-glow)`} />}
              <path d={`M ${r1(l.x - 14)} ${r1(l.y - 26)} h 14 v 8`} fill="none" stroke={pal.eave} strokeWidth={2.5} />
              <path d={`M ${r1(l.x - 7)} ${r1(l.y - 12)} h 14 l -3 -6 h -8 Z`} fill={pal.eave} />
              <path d={`M ${r1(l.x - 6)} ${r1(l.y - 12)} h 12 l -2 14 h -8 Z`} fill={on ? pal.lit : pal.dark} />
              {on && <circle cx={l.x} cy={r1(l.y - 5)} r={2.5} fill={pal.core} />}
            </g>
          );
        })}
      </g>
    </>
  );
}

const Street = memo(function Street({ mood, claimLit }: { mood: Mood; claimLit: boolean[] }) {
  const p = mood === 'warm' ? 'tfw' : 'tfc';
  const pal = PALETTE[mood];

  const ground = pts([
    { x: -10, y: BASE_EDGE + 10 },
    VP,
    { x: 1210, y: BASE_EDGE + 10 },
    { x: 1210, y: 710 },
    { x: -10, y: 710 },
  ]);
  const radials: string[] = [];
  for (let x = -1500; x <= 2700; x += 90) radials.push(`M ${VP.x} ${VP.y} L ${x} 710`);
  const courses: string[] = [];
  for (let k = 1; k <= 16; k++) {
    const y = VP.y + (710 - VP.y) * Math.pow(k / 16, 1.7);
    courses.push(`M 0 ${r1(y)} H 1200`);
  }

  return (
    <svg className={`tf-street tf-street--${mood}`} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <linearGradient id={`${p}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[0]} />
          <stop offset="0.3" stopColor={pal.sky[1]} />
          <stop offset="0.43" stopColor={pal.sky[2]} />
          <stop offset="0.5" stopColor={pal.sky[3]} />
        </linearGradient>
        <radialGradient id={`${p}-horizon`} cx="0.5" cy="0.47" r="0.35">
          <stop offset="0" stopColor={pal.sky[3]} stopOpacity="0.9" />
          <stop offset="1" stopColor={pal.sky[3]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${p}-ground`} x1="0" y1={VP.y} x2="0" y2="700" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pal.ground[0]} />
          <stop offset="0.35" stopColor={pal.ground[1]} />
          <stop offset="1" stopColor={pal.ground[2]} />
        </linearGradient>
        <linearGradient id={`${p}-sheen`} x1="0" y1={VP.y} x2="0" y2="700" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pal.sheen} stopOpacity="0.75" />
          <stop offset="0.6" stopColor={pal.sheen} stopOpacity="0.12" />
          <stop offset="1" stopColor={pal.sheen} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${p}-depth`} x1={VP.x} y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pal.sky[3]} stopOpacity="0.28" />
          <stop offset="0.35" stopColor={pal.shade} stopOpacity="0.15" />
          <stop offset="1" stopColor={pal.shade} stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={`${p}-refl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.glow} stopOpacity="0.85" />
          <stop offset="0.35" stopColor={pal.lit} stopOpacity="0.4" />
          <stop offset="1" stopColor={pal.glow} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${p}-core`} cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor={pal.core} stopOpacity="0.9" />
          <stop offset="1" stopColor={pal.core} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${p}-halo`}>
          <stop offset="0" stopColor={pal.glow} stopOpacity="0.55" />
          <stop offset="0.4" stopColor={pal.glow} stopOpacity="0.16" />
          <stop offset="1" stopColor={pal.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`${p}-brush`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={4} />
          <feDisplacementMap in="SourceGraphic" scale={6} />
        </filter>
        <filter id={`${p}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={7} />
        </filter>
        <filter id={`${p}-smear`} x="-20%" y="-10%" width="140%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.08 0.012" numOctaves={2} seed={9} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={10} result="d" />
          <feGaussianBlur in="d" stdDeviation="2 6" />
        </filter>
        <filter id={`${p}-cloud`} x="-20%" y="-50%" width="140%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves={3} seed={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={40} result="d" />
          <feGaussianBlur in="d" stdDeviation={6} />
        </filter>
        <filter id={`${p}-canvas`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.04" numOctaves={2} seed={7} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <clipPath id={`${p}-groundclip`}>
          <polygon points={ground} />
        </clipPath>
      </defs>

      <rect width="1200" height="700" fill={`url(#${p}-sky)`} />
      <rect width="1200" height="700" fill={`url(#${p}-horizon)`} />
      <g filter={`url(#${p}-cloud)`} opacity={0.55}>
        <ellipse cx="300" cy="120" rx="230" ry="22" fill={pal.cloud} />
        <ellipse cx="880" cy="80" rx="260" ry="18" fill={pal.cloud} />
        <ellipse cx="640" cy="190" rx="170" ry="14" fill={pal.cloud} opacity={0.8} />
      </g>

      {/* The dome at the end of the street. */}
      <g filter={`url(#${p}-brush)`}>
        <path d="M 548 300 C 550 250 575 214 600 208 C 625 214 650 250 652 300 Z" fill={pal.dome} />
        <path d="M 600 208 C 625 214 650 250 652 300" fill="none" stroke={pal.rim} strokeWidth={2} opacity={0.5} />
        <rect x="592" y="188" width="16" height="22" fill={pal.dome} />
        <path d="M 600 172 L 604 188 L 596 188 Z" fill={pal.dome} />
        <rect x="532" y="298" width="136" height="34" fill={pal.dome} />
        <rect x="500" y="214" width="13" height="116" fill={pal.dome} />
        <path d="M 498 214 L 506.5 198 L 515 214 Z" fill={pal.dome} />
      </g>

      <polygon points={ground} fill={`url(#${p}-ground)`} />
      <g clipPath={`url(#${p}-groundclip)`}>
        <polygon points={pts([VP, { x: 470, y: 710 }, { x: 730, y: 710 }])} fill={`url(#${p}-sheen)`} filter={`url(#${p}-smear)`} />
        <path d={radials.join(' ')} stroke={pal.shade} strokeWidth={1.2} opacity={0.4} fill="none" filter={`url(#${p}-brush)`} />
        <path d={courses.join(' ')} stroke={pal.shade} strokeWidth={1.4} opacity={0.45} fill="none" filter={`url(#${p}-brush)`} />
        <path d={courses.join(' ')} stroke={pal.sheen} strokeWidth={0.8} opacity={0.18} fill="none" transform="translate(0 2)" />
      </g>

      <Side buildings={RIGHT} mood={mood} claimLit={claimLit} p={p} />
      {mood === 'warm' && (
        <g transform="translate(1200 0) scale(-1 1)">
          <Side buildings={LEFT} mood={mood} claimLit={[true, true, true, true, true, true]} p={p} />
        </g>
      )}

      <rect className="tf-canvas" width="1200" height="700" filter={`url(#${p}-canvas)`} opacity={0.16} />
    </svg>
  );
});
