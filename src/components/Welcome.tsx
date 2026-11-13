import type { ReactNode } from 'react';
import { EXAMPLE } from '../data/companion';
import { LANDMARKS, MAIN_ROUTE, landmarkById } from '../data/map';
import type { RegionId } from '../data/types';
import { hrefFor } from '../lib/route';
import { ThemeToggle } from './ThemeToggle';

const BRANCHES = LANDMARKS.filter((l) => l.kind === 'branch');
const ROUTE = [...MAIN_ROUTE.map((id) => landmarkById[id]), ...BRANCHES];

const WORDS: { term: string; means: string; at: RegionId }[] = [
  { term: 'Workflow', means: 'Steps you fixed in code, with model calls inside. An agent chooses its own steps.', at: 'agent-loop' },
  { term: 'Planning', means: 'The model writes down its steps before it acts. Here: a query plan.', at: 'one-model-call' },
  { term: 'Function calling', means: 'Another name for tool calling.', at: 'tool-calling' },
  { term: 'MCP', means: 'A standard way to plug in tools from other programs. The model still sees tool declarations.', at: 'tool-calling' },
  { term: 'RAG', means: 'Look text up and put it in the message list before the model answers. Here the lookup is a tool.', at: 'tool-calling' },
  { term: 'Guardrails', means: 'Checks your code runs on every proposal before anything happens.', at: 'tool-calling' },
  { term: 'Tracing', means: 'A record of every model call and tool run.', at: 'agent-loop' },
  { term: 'Evals', means: 'Fixed questions you rerun to measure a change.', at: 'evaluation' },
  { term: 'Prompt injection', means: 'Instructions hidden in data the agent reads.', at: 'permissions' },
  { term: 'Human in the loop', means: 'A person approves an action before it runs.', at: 'permissions' },
  { term: 'Sandbox', means: 'A locked-down place to run code an agent writes. Not built here; the same boundary idea.', at: 'permissions' },
  { term: 'Context window', means: 'The most text a model can read in one call.', at: 'context-memory' },
  { term: 'Skills', means: 'Instructions kept in files and loaded only when a task needs them. Not built here; a way to save context.', at: 'context-memory' },
  { term: 'Subagents', means: 'Extra model calls, each with its own job and messages.', at: 'multi-agent' },
];

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
    body: `${BRANCHES.length} branches leave the trail. Permissions and Context & memory matter for any real agent; Multi-agent is optional. Escape or Back takes you up a level.`,
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

        <h2 className="welcome__how">What an agent is</h2>
        <div className="welcome__what">
          <p>
            An agent is a language model in a loop. The model proposes the next step, your code checks it and runs it,
            and the result goes back to the model. This repeats until the job is done.
          </p>
          <p>
            A single model call answers once. A workflow runs steps you fixed in advance. An agent chooses its own
            steps, so use one only when you cannot write the steps down beforehand.
          </p>
        </div>

        <h2 className="welcome__how">What you will build</h2>
        <div className="welcome__example">
          <p className="welcome__question">“{EXAMPLE.question}”</p>
          <ol className="welcome__run">
            {EXAMPLE.searches.map((q) => (
              <li key={q}>
                <span>searches</span>
                <code>search_places("{q}")</code>
              </li>
            ))}
            <li>
              <span>answers</span>
              <p>
                {EXAMPLE.answer.split(/(\[place:[a-z-]+\])/).map((part, i) =>
                  i % 2 ? <code key={i}>{part}</code> : part,
                )}
              </p>
            </li>
          </ol>
          <p className="welcome__note">
            Each landmark adds one piece of this planner, and every lesson uses it as the example.
          </p>
        </div>

        <h2 className="welcome__how">The route</h2>
        <ol className="welcome__route">
          {ROUTE.map((l) => (
            <li key={l.id}>
              <span>{l.mark}</span>
              <a href={hrefFor({ region: l.id, concept: null })}>{l.question}</a>
              <em>{l.title}</em>
            </li>
          ))}
        </ol>
        <p className="welcome__note welcome__route-note">
          You need to read Python, nothing more. The seven diagrams take about ten minutes; the lessons and runnable
          code sit under each one.
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

        <details className="welcome__words">
          <summary>Words you may have heard, and where they sit on the map</summary>
          <dl>
            {WORDS.map((w) => (
              <div key={w.term}>
                <dt>{w.term}</dt>
                <dd>
                  {w.means} <a href={hrefFor({ region: w.at, concept: null })}>{landmarkById[w.at].title}</a>
                </dd>
              </div>
            ))}
          </dl>
        </details>

        <button type="button" className="btn btn--primary btn--start welcome__enter" onClick={onEnter}>
          Open the map
          <span aria-hidden="true"> →</span>
        </button>
      </main>
    </div>
  );
}
