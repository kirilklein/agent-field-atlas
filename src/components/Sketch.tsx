import { Fragment, useEffect, useRef, useState } from 'react';
import type { Sketch as SketchData } from '../data/sketches';

type Props = {
  sketch: SketchData;
  /** Lines to emphasise (a selected or hovered concept); null plays the whole story. */
  highlight: number[] | null;
  reduced: boolean;
  label: string;
  /** Pause the loop (another animation has the stage). */
  hold?: boolean;
};

const STEP_MS = 1150;
const HOLD_MS = 3200;
const FADE_MS = 380;

/** Text with a ✓/✕ that never wraps onto a line of its own: it stays with the last word. */
function Marked({ text, code, mark }: { text: string; code?: boolean; mark: 'ok' | 'bad' }) {
  const cut = text.lastIndexOf(' ');
  const head = cut < 0 ? '' : text.slice(0, cut + 1);
  const tail = text.slice(cut + 1);
  const wrap = (s: string) => (code ? <code>{s}</code> : s);
  return (
    <>
      {head && wrap(head)}
      <span className="sline__nowrap">
        {wrap(tail)}
        <span className={`sline__mark sline__mark--${mark}`} aria-label={mark === 'ok' ? 'passes' : 'fails'}>
          {mark === 'ok' ? '✓' : '✕'}
        </span>
      </span>
    </>
  );
}

/**
 * A trace revealed line by line, with a small diagram whose active part follows
 * the latest line. Loops while nothing is selected; with a concept selected it
 * shows the story up to that point and emphasises the lines it is about.
 */
export function Sketch({ sketch, highlight, reduced, label, hold = false }: Props) {
  const total = sketch.lines.length;
  const [shown, setShown] = useState(reduced ? total : 0);
  const [playing, setPlaying] = useState(!reduced);
  const [fading, setFading] = useState(false);
  const timer = useRef(0);

  // A highlight jumps straight to the end of the relevant part and pauses.
  const hlKey = highlight ? highlight.join(',') : '';
  useEffect(() => {
    setFading(false);
    if (highlight) {
      setShown(Math.max(...highlight) + 1);
      setPlaying(false);
    } else {
      setPlaying(!reduced);
      if (reduced) setShown(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlKey, reduced, total]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!playing || reduced || hold) return;
    if (fading) {
      // The whole trace has faded out; clear it and start again.
      timer.current = window.setTimeout(() => {
        setShown(0);
        setFading(false);
      }, FADE_MS);
    } else {
      const delay = shown >= total ? HOLD_MS : shown === 0 ? 450 : STEP_MS;
      timer.current = window.setTimeout(() => (shown >= total ? setFading(true) : setShown(shown + 1)), delay);
    }
    return () => window.clearTimeout(timer.current);
  }, [playing, shown, total, reduced, fading, hold]);

  const hl = highlight ? new Set(highlight) : null;
  const latest = sketch.lines[Math.max(0, Math.min(shown, total) - 1)];
  const activeNodes = hl
    ? new Set(highlight!.map((i) => sketch.lines[i].node))
    : shown > 0
      ? new Set([latest.node])
      : new Set<number>();

  const replay = () => {
    setFading(false);
    setShown(0);
    setPlaying(true);
  };

  return (
    <figure className={`sketch ${hl ? 'has-highlight' : ''} ${fading ? 'is-fading' : ''}`} aria-label={label}>
      <div className="sketch__nodes" aria-hidden="true">
        {sketch.nodes.map((n, i) => (
          <Fragment key={n}>
            {i > 0 && <span className="sketch__arrow">→</span>}
            <span className={`snode ${activeNodes.has(i) ? 'is-on' : ''}`}>{n}</span>
          </Fragment>
        ))}
      </div>
      <ol className="sketch__lines">
        {sketch.lines.map((l, i) => (
          <li
            key={i}
            className={[
              'sline',
              `tone-${l.tone}`,
              i < shown ? 'is-shown' : '',
              hl ? (hl.has(i) ? 'is-hl' : 'is-dim') : '',
            ].join(' ')}
            aria-hidden={i < shown ? undefined : true}
          >
            <span className="sline__label">{l.label}</span>
            <span className="sline__text">
              {l.mark ? <Marked text={l.text} code={l.code} mark={l.mark} /> : l.code ? <code>{l.text}</code> : l.text}
              {l.bar !== undefined && (
                <span className="sline__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(l.bar * 100)}%` }} />
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {!reduced && (
        <div className="sketch__controls">
          <button type="button" className="sketch__btn" onClick={() => {
              setFading(false);
              setPlaying((p) => !p);
            }} aria-pressed={playing}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="sketch__btn" onClick={replay}>
            Replay
          </button>
          <span className="sketch__count" aria-hidden="true">
            {Math.min(shown, total)}/{total}
          </span>
        </div>
      )}
    </figure>
  );
}
