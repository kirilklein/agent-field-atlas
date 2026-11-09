/**
 * Dev-only review page (`npm run dev`, then /frames.html): every step of every
 * story at a few moments of its move, plus the still frame a paused or
 * reduced-motion viewer sees. Anything drawn within 2 units of the edge is
 * outlined in red and listed at the top.
 */
/* oxlint-disable react/only-export-components -- an entry point, not a module */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts';
import './index.css';
import { stillOf } from './components/insets/engine';
import { STORIES, VIEW } from './components/insets/stories';
import type { RegionId } from './data/types';

const MOMENTS = [0.35, 0.7, 1];
/** Keep this far inside the viewBox, so nothing touches the caption below it. */
const MARGIN = 2;
const PARTS = '.ins-chip, .ins-card, .ins-note, .ins-station, .ins-mark, .ins-flag, .ins-envelope, .ins-bubble';

/** Parts whose box leaves the viewBox, as "story · step · text". */
function outOfBounds(root: HTMLElement): string[] {
  const out: string[] = [];
  root.querySelectorAll<SVGSVGElement>('svg[data-frame]').forEach((svg) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const inv = m.inverse();
    svg.querySelectorAll<SVGGraphicsElement>(PARTS).forEach((el) => {
      if (Number(el.getAttribute('opacity') ?? 1) < 0.05) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const a = new DOMPoint(r.left, r.top).matrixTransform(inv);
      const b = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
      if (a.x < MARGIN || a.y < MARGIN || b.x > VIEW.w - MARGIN || b.y > VIEW.h - MARGIN) {
        svg.closest('.frames__cell')?.classList.add('is-out');
        out.push(`${svg.dataset.frame} · ${el.textContent?.trim() || el.getAttribute('class')}`);
      }
    });
  });
  return [...new Set(out)];
}

function Frames() {
  const [report, setReport] = useState<string[] | null>(null);
  useEffect(() => {
    document.fonts.ready.then(() => setReport(outOfBounds(document.body)));
  }, []);
  return (
    <main className="frames">
      <h1>Story frames</h1>
      <p className="frames__report" data-ready={report !== null}>
        {report === null ? 'Checking…' : report.length === 0 ? 'Nothing touches the edge of the frame.' : `At the edge: ${report.join(' | ')}`}
      </p>
      {(Object.keys(STORIES) as RegionId[]).map((region) => {
        const story = STORIES[region];
        return (
          <section key={region} className="frames__story" id={region}>
            <h2>
              {region} · {story.title}
            </h2>
            <div className="frames__grid" style={{ gridTemplateColumns: `14rem repeat(${MOMENTS.length + 1}, 1fr)` }}>
              <span />
              {MOMENTS.map((m) => (
                <span key={m} className="frames__head">
                  t = {m}
                </span>
              ))}
              <span className="frames__head">paused</span>
              {story.steps.map((st, k) => (
                <Row key={k} region={region} k={k} caption={st.caption} still={stillOf(story.steps, k)} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function Row({ region, k, caption, still }: { region: RegionId; k: number; caption: string; still: number }) {
  const story = STORIES[region];
  const concepts = Object.entries(story.concepts)
    .filter(([, v]) => (typeof v === 'number' ? v === k : k >= v[0] && k <= v[1]))
    .map(([c]) => c);
  return (
    <>
      <p className="frames__caption">
        <b>{k + 1}.</b> {caption}
        {concepts.length > 0 && <em> · {concepts.join(', ')}</em>}
      </p>
      {[...MOMENTS, still].map((t, i) => (
        <div key={i} className={`frames__cell ${i === MOMENTS.length ? 'is-still' : ''}`}>
          <svg className="inset__svg" data-frame={`${region} · ${k + 1} · t=${t}`} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}>
            {story.draw(k, t)}
          </svg>
        </div>
      ))}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Frames />
  </StrictMode>,
);
