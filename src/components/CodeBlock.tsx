import { useEffect, useMemo, useRef, useState } from 'react';
import { highlightLines } from '../lib/highlight';

type Props = {
  code: string;
  language: 'python' | 'json' | 'text';
  label?: string;
  highlight?: number[];
  /** Scroll the listing (not the page) so highlighted lines are visible. */
  follow?: boolean;
  smooth?: boolean;
  /** Fold each top-level Python block to its first line; blocks with highlighted lines start open. */
  fold?: boolean;
  className?: string;
};

const IMPORT = /^(import|from) /;

/** Top-level Python blocks longer than one line, as 1-based [first, last] line numbers. */
function foldBlocks(code: string): [number, number][] {
  const lines = code.split('\n');
  const blocks: [number, number][] = [];
  let start = -1;
  let last = -1;
  let inDoc = false;
  const close = () => {
    if (start >= 0 && last > start) blocks.push([start + 1, last + 1]);
    start = -1;
  };
  lines.forEach((l, i) => {
    const wasDoc = inDoc;
    if ((l.match(/"""/g) ?? []).length % 2) inDoc = !inDoc;
    if (wasDoc || (start >= 0 && /^\s+\S|^[)\]}]/.test(l))) {
      last = i;
    } else if (l.startsWith('#')) {
      close();
    } else if (l.trim()) {
      const head = start >= 0 ? lines[start] : '';
      if (head.startsWith('@') || (IMPORT.test(l) && IMPORT.test(head))) {
        last = i;
      } else {
        close();
        start = last = i;
      }
    }
  });
  close();
  return blocks;
}

export function CodeBlock({ code, language, label, highlight, follow, smooth, fold, className }: Props) {
  const lines = useMemo(() => highlightLines(code, language), [code, language]);
  const hot = useMemo(() => new Set(highlight ?? []), [highlight]);
  const blocks = useMemo(() => (fold && language === 'python' ? foldBlocks(code) : []), [fold, language, code]);
  const [open, setOpen] = useState(
    () => new Set(blocks.filter(([a, b]) => (highlight ?? []).some((n) => n >= a && n <= b)).map(([a]) => a)),
  );
  const scroller = useRef<HTMLDivElement>(null);
  const hasHighlight = hot.size > 0;
  const allOpen = blocks.every(([a]) => open.has(a));

  const { ends, hidden } = useMemo(() => {
    const ends = new Map(blocks);
    const hidden = new Set<number>();
    const raw = code.split('\n');
    for (const [a, b] of blocks) {
      if (open.has(a)) continue;
      for (let n = a + 1; n <= b; n++) hidden.add(n);
      for (let n = b + 1; raw[n - 1] === '' && raw[n] === ''; n++) hidden.add(n);
    }
    return { ends, hidden };
  }, [blocks, open, code]);

  const toggle = (a: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(a)) next.add(a);
      return next;
    });

  useEffect(() => {
    if (!follow || !hasHighlight || !scroller.current) return;
    const box = scroller.current;
    const first = box.querySelector<HTMLElement>('.code__line.is-hot');
    const last = [...box.querySelectorAll<HTMLElement>('.code__line.is-hot')].pop();
    if (!first || !last) return;
    const top = first.offsetTop;
    const bottom = last.offsetTop + last.offsetHeight;
    const view = box.clientHeight;
    let target = box.scrollTop;
    if (top < box.scrollTop + 8 || bottom > box.scrollTop + view - 8) {
      target = bottom - top < view ? top - (view - (bottom - top)) / 2 : top - 8;
    }
    box.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }, [follow, hasHighlight, hot, smooth]);

  return (
    <figure className={`code ${hasHighlight ? 'has-highlight' : ''} ${className ?? ''}`}>
      {label && (
        <figcaption className="code__label">
          <span>{label}</span>
          {blocks.length > 0 && (
            <button
              type="button"
              className="code__fold-all"
              aria-expanded={allOpen}
              onClick={() => setOpen(new Set(allOpen ? [] : blocks.map(([a]) => a)))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </figcaption>
      )}
      <div className="code__scroll" ref={scroller} tabIndex={0} aria-label={label ? `Code: ${label}` : 'Code listing'}>
        <pre>
          <code>
            {lines.map((tokens, i) => {
              const n = i + 1;
              if (hidden.has(n)) return null;
              const end = ends.get(n);
              const closed = end !== undefined && !open.has(n);
              return (
                <span key={i} className={`code__line ${hot.has(n) ? 'is-hot' : ''}`}>
                  <span className="code__ln" aria-hidden="true">
                    {n}
                  </span>
                  {end !== undefined ? (
                    <button
                      type="button"
                      className="code__fold"
                      aria-expanded={!closed}
                      aria-label={`Lines ${n} to ${end}`}
                      onClick={() => toggle(n)}
                    />
                  ) : (
                    blocks.length > 0 && <span className="code__fold" />
                  )}
                  <span className="code__text">{tokens.length ? tokens : ' '}</span>
                  {closed && (
                    <span className="code__more" aria-hidden="true" onClick={() => toggle(n)}>
                      {end - n} more {end - n === 1 ? 'line' : 'lines'}
                    </span>
                  )}
                  {'\n'}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
    </figure>
  );
}
