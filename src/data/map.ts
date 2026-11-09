import type { CubicSeg, Landmark, Point, RegionId, TerrainName } from './types';

/**
 * Hand-composed map of the trail, in world units (roughly 0–1000 on each axis).
 * Rendering code reads this file; it never decides where things go.
 */

export const TRAILHEAD: Point = { x: 500, y: 960 };

export const LANDMARKS: Landmark[] = [
  {
    id: 'one-model-call',
    title: 'One model call',
    kind: 'main',
    mark: 'I',
    x: 430,
    y: 800,
    side: 'left',
    question: 'What does the model actually get?',
    builds: 'Turn a research question into structured search queries.',
    idea: 'The model is a function: a message list goes in, a proposal comes out. Here the proposal is a query plan, and your code checks it before anything relies on it.',
    concepts: [
      { id: 'the-request', title: 'Anatomy of a request', dx: -120, dy: 38, side: 'left' },
      { id: 'structured-output', title: 'Ask for structure', dx: -80, dy: -82, side: 'left' },
      { id: 'parse-a-reply', title: 'Parse a reply', dx: 108, dy: -26, side: 'right' },
      { id: 'checkpoint', title: 'Checkpoint 1: run it', dx: 96, dy: 72, side: 'right' },
    ],
  },
  {
    id: 'tool-calling',
    title: 'Tool calling',
    kind: 'main',
    mark: 'II',
    x: 590,
    y: 600,
    side: 'left',
    question: 'Who runs the tool?',
    builds: 'Give the model a search_papers(query) tool and validate its proposed arguments before execution.',
    idea: 'A proposal can be a request to act. The model names a tool and arguments; only your code can run it, so your code decides whether it runs.',
    concepts: [
      { id: 'declare-a-tool', title: 'Declare a tool', dx: -122, dy: -52, side: 'left' },
      { id: 'inspect-a-call', title: 'Inspect a call', dx: 92, dy: -96, side: 'right' },
      { id: 'errors-are-results', title: 'Errors are results', dx: 92, dy: 82, side: 'right' },
      { id: 'checkpoint', title: 'Checkpoint 2: run it', dx: -140, dy: 40, side: 'left' },
    ],
  },
  {
    id: 'agent-loop',
    title: 'Agent loop',
    kind: 'main',
    mark: 'III',
    x: 420,
    y: 400,
    side: 'left',
    question: 'Who chooses the next step?',
    builds: 'Feed results back into the next model call and stop when the task is done or the step budget runs out.',
    idea: 'Append the proposal and its result to the message list and call the same function again. The loop, and the decision to stop, belong to your code.',
    concepts: [
      { id: 'the-loop', title: 'The loop', dx: -118, dy: -40, side: 'left' },
      { id: 'watch-a-run', title: 'Watch a run', dx: -48, dy: -118, side: 'left' },
      { id: 'stop-conditions', title: 'When to stop', dx: 98, dy: 76, side: 'right' },
      { id: 'checkpoint', title: 'Checkpoint 3: run it', dx: -60, dy: 100, side: 'left' },
    ],
  },
  {
    id: 'evaluation',
    title: 'Evaluation',
    kind: 'main',
    mark: 'IV',
    x: 560,
    y: 170,
    side: 'right',
    question: 'Did it actually do the job?',
    builds: 'Replay a small set of questions and check that answers cite papers that support their claims.',
    idea: 'The model only ever sees messages, so you can record them, replay them and measure what it proposes. The numbers come with uncertainty, and so does the judge.',
    concepts: [
      { id: 'replay-set', title: 'A replay set', dx: -122, dy: 40, side: 'left' },
      { id: 'score-a-replay', title: 'Score a replay', dx: -62, dy: -88, side: 'left' },
      { id: 'trust-the-numbers', title: 'Trust the numbers', dx: 112, dy: 52, side: 'right' },
      { id: 'checkpoint', title: 'Checkpoint 4: run it', dx: 110, dy: -60, side: 'right' },
    ],
  },
  {
    id: 'permissions',
    title: 'Permissions',
    kind: 'branch',
    mark: 'A',
    from: 'tool-calling',
    x: 815,
    y: 560,
    side: 'right',
    compactSide: 'below',
    question: 'What can text make it do?',
    builds: 'Keep the assistant read-only and treat what tools return as untrusted data.',
    idea: 'Your code is the only part with side effects, so its allowlist is the security boundary. Text in a tool result can change what the model proposes, never what the host allows.',
    concepts: [
      { id: 'read-only-tools', title: 'Read-only by default', dx: -18, dy: -98, side: 'right' },
      { id: 'untrusted-results', title: 'Untrusted results', dx: 18, dy: 96, side: 'right' },
      { id: 'run-it', title: 'Run the branch', dx: -90, dy: 66, side: 'left' },
    ],
  },
  {
    id: 'context-memory',
    title: 'Context & memory',
    kind: 'branch',
    mark: 'B',
    from: 'agent-loop',
    x: 215,
    y: 470,
    side: 'below',
    question: 'What can the model see right now?',
    builds: 'Separate the state that lives inside one run from what you deliberately save across runs.',
    idea: 'The model remembers nothing between calls. Memory is whatever your code chooses to put back into the message list, and every token of it is paid for on every call.',
    concepts: [
      { id: 'run-state', title: 'State within a run', dx: -40, dy: -100, side: 'left' },
      { id: 'saved-memory', title: 'Memory across runs', dx: -92, dy: 82, side: 'left' },
      { id: 'cost-of-history', title: 'What history costs', dx: 74, dy: 104, side: 'right' },
      { id: 'run-it', title: 'Run the branch', dx: 60, dy: -100, side: 'right' },
    ],
  },
  {
    id: 'multi-agent',
    title: 'Multi-agent',
    kind: 'branch',
    mark: 'C',
    from: 'agent-loop',
    x: 770,
    y: 330,
    side: 'right',
    compactSide: 'below',
    question: 'When does a second agent pay off?',
    builds: 'Compare one assistant with an assistant plus a reviewer on citation accuracy, latency and cost.',
    idea: 'A second agent is another call to the same function, with different messages and no tools. Whether it helps is a measurement, with error bars.',
    concepts: [
      { id: 'add-a-reviewer', title: 'Add a reviewer', dx: -46, dy: -98, side: 'left' },
      { id: 'compare-on-evals', title: 'Compare on the evals', dx: 52, dy: 96, side: 'right' },
      { id: 'run-it', title: 'Run the branch', dx: 52, dy: -104, side: 'right' },
    ],
  },
];

export const MAIN_ROUTE: RegionId[] = ['one-model-call', 'tool-calling', 'agent-loop', 'evaluation'];

export const landmarkById = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])) as Record<RegionId, Landmark>;

/**
 * Branch paths leave their parent landmark with explicit control points so each
 * one can bend away from the main trail and the parent's label.
 */
export const BRANCH_CURVES: Record<'permissions' | 'context-memory' | 'multi-agent', CubicSeg> = {
  permissions: { c1: { x: 680, y: 610 }, c2: { x: 720, y: 548 }, to: { x: 815, y: 560 } },
  'context-memory': { c1: { x: 360, y: 448 }, c2: { x: 300, y: 488 }, to: { x: 215, y: 470 } },
  'multi-agent': { c1: { x: 520, y: 398 }, c2: { x: 640, y: 318 }, to: { x: 770, y: 330 } },
};

/** Place names, set where the terrain actually has those features (see terrain.ts). */
export const TERRAIN_NAMES: TerrainName[] = [
  { text: 'Prompt Flats', x: 250, y: 905 },
  { text: 'Allowlist Ridge', x: 712, y: 512, rotate: -14 },
  { text: 'Recurrence Col', x: 378, y: 546, rotate: -8 },
  { text: 'Evidence Summit', x: 440, y: 204 },
];
