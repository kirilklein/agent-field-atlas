import type { ReactNode } from 'react';
import { LANDMARKS, MAIN_ROUTE } from '../data/map';
import { ThemeToggle } from './ThemeToggle';

const BRANCHES = LANDMARKS.filter((l) => l.kind === 'branch').length;

const STEPS: { title: string; body: string; glyph: ReactNode }[] = [
  {
    title: 'Follow the trail',
    body: `${MAIN_ROUTE.length} landmarks climb from the trailhead to the summit: from one model call to an evaluated agent. Each builds on the last.`,
    glyph: (
      <>
        <path d="M8 40c9-3 4-12 13-15s5-12 14-15" className="welcome__ink-trail" />
        <circle cx="8" cy="40" r="3" className="welcome__ink-mark" />
        <circle cx="21" cy="25" r="3" className="welcome__ink-mark" />
        <circle cx="35" cy="10" r="4" className="welcome__ink-mark" />
      </>
    ),
  },
  {
    title: 'Open a landmark',
    body: 'Click one and the map flies in. Its stops are short lessons, with the real code and runs you can step through.',
    glyph: (
      <>
        <circle cx="24" cy="24" r="7" className="welcome__ink-ring" />
        <circle cx="24" cy="24" r="2.6" className="welcome__ink-mark" />
        <circle cx="9" cy="17" r="2.4" className="welcome__ink-stop" />
        <circle cx="38" cy="12" r="2.4" className="welcome__ink-stop" />
        <circle cx="39" cy="35" r="2.4" className="welcome__ink-stop" />
        <circle cx="12" cy="37" r="2.4" className="welcome__ink-stop" />
      </>
    ),
  },
  {
    title: 'Wander, then head back',
    body: `${BRANCHES} branches are optional side trips. Escape or Back takes you up a level, and the trail you have walked stays inked in.`,
    glyph: (
      <>
        <path d="M10 42C14 30 20 22 24 6" className="welcome__ink-trail" />
        <path d="M18 28c6-1 12 0 20 4" className="welcome__ink-branch" />
        <circle cx="38" cy="32" r="3" className="welcome__ink-mark" />
        <circle cx="18.5" cy="28" r="2.4" className="welcome__ink-mark" />
      </>
    ),
  },
];

export function Welcome({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="welcome">
      <svg className="welcome__contours" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {[60, 120, 180, 240, 300, 360, 420].map((r, i) => (
          <ellipse key={r} cx={560 - i * 6} cy={300 + i * 8} rx={r * 1.25} ry={r} transform={`rotate(${-18 + i * 2} 560 300)`} />
        ))}
      </svg>
      <div className="welcome__toggle">
        <ThemeToggle />
      </div>

      <main className="welcome__sheet">
        <p className="kicker">A field atlas · Plate I</p>
        <h1 className="welcome__title">Agent Field Atlas</h1>
        <p className="welcome__lede">
          A map for finding your way around LLM agents, by building one: a trip planner for a rainy day in Florence, in
          plain Python.
          Every run is recorded, so you need no API key.
        </p>

        <h2 className="welcome__how">How to read the map</h2>
        <ol className="welcome__steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="welcome__step" style={{ ['--i' as string]: i }}>
              <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
                {s.glyph}
              </svg>
              <div>
                <h3>
                  <span className="welcome__num">{i + 1}</span>
                  {s.title}
                </h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <button type="button" className="btn btn--primary btn--start welcome__enter" onClick={onEnter}>
          Open the map
          <span aria-hidden="true"> →</span>
        </button>
      </main>
    </div>
  );
}
