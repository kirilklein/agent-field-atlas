/**
 * The runnable Python companion (../../companion), imported as text so the atlas
 * always shows the exact code and output a learner will get.
 */
import cp1 from '../../companion/checkpoint_1.py?raw';
import cp2 from '../../companion/checkpoint_2.py?raw';
import cp3 from '../../companion/checkpoint_3.py?raw';
import cp4 from '../../companion/checkpoint_4.py?raw';
import comparePy from '../../companion/compare.py?raw';
import fakeModelPy from '../../companion/fake_model.py?raw';
import llmPy from '../../companion/llm.py?raw';
import claudeModelPy from '../../companion/claude_model.py?raw';
import tracingPy from '../../companion/tracing.py?raw';
import placesPy from '../../companion/places.py?raw';
import judgeLabels from '../../companion/judge_labels.jsonl?raw';
import replaySet from '../../companion/replay_set.jsonl?raw';
import recordedComparison from '../../companion/recorded_comparison.json?raw';
import groundingCases from '../../companion/grounding_cases.json?raw';
import out1 from '../../companion/expected/checkpoint_1.txt?raw';
import out1Sloppy from '../../companion/expected/checkpoint_1_sloppy.txt?raw';
import out2 from '../../companion/expected/checkpoint_2.txt?raw';
import out2Empty from '../../companion/expected/checkpoint_2_empty.txt?raw';
import out2Disallowed from '../../companion/expected/checkpoint_2_disallowed.txt?raw';
import out3 from '../../companion/expected/checkpoint_3.txt?raw';
import out3Budget from '../../companion/expected/checkpoint_3_budget.txt?raw';
import out4 from '../../companion/expected/checkpoint_4.txt?raw';
import outCompare from '../../companion/expected/compare.txt?raw';
import branchPermissionsPy from '../../companion/branch_permissions.py?raw';
import branchMemoryPy from '../../companion/branch_memory.py?raw';
import branchMultiAgentPy from '../../companion/branch_multi_agent.py?raw';
import outPerm from '../../companion/expected/branch_permissions.txt?raw';
import outPermAdd from '../../companion/expected/branch_permissions_add.txt?raw';
import outPermRefuse from '../../companion/expected/branch_permissions_refuse.txt?raw';
import outMemory from '../../companion/expected/branch_memory.txt?raw';
import outMemoryRemember from '../../companion/expected/branch_memory_remember.txt?raw';
import outMulti from '../../companion/expected/branch_multi_agent.txt?raw';
import checkPy from '../../companion/check.py?raw';
import exercisesJson from '../../companion/exercises.json?raw';
import sol1 from '../../companion/solutions/checkpoint_1.py?raw';
import sol2 from '../../companion/solutions/checkpoint_2.py?raw';
import sol3 from '../../companion/solutions/checkpoint_3.py?raw';
import sol4 from '../../companion/solutions/checkpoint_4.py?raw';
import check1 from '../../companion/expected/check_1.txt?raw';
import check2 from '../../companion/expected/check_2.txt?raw';
import check3 from '../../companion/expected/check_3.txt?raw';
import check4 from '../../companion/expected/check_4.txt?raw';

export type CompanionFile = { name: string; code: string; language: 'python' | 'json' | 'text'; note: string };
export type Run = { label: string; output: string };

export const SUPPORT_FILES: CompanionFile[] = [
  { name: 'llm.py', code: llmPy, language: 'python', note: 'call_model(): the only code that talks to a model. Fake by default; Claude with ATLAS_MODEL=claude.' },
  { name: 'claude_model.py', code: claudeModelPy, language: 'python', note: 'The Claude adapter that llm.py uses with ATLAS_MODEL=claude. It converts messages to and from Claude’s format.' },
  { name: 'tracing.py', code: tracingPy, language: 'python', note: 'Prints the model ▸ and host ▸ lines you see in the terminal output.' },
  { name: 'fake_model.py', code: fakeModelPy, language: 'python', note: 'A scripted model so everything runs offline, with switchable quirks and two bad habits.' },
  { name: 'places.py', code: placesPy, language: 'python', note: 'Nine real places in Florence with short notes, and a read-only keyword search.' },
];

export type CheckpointId = 1 | 2 | 3 | 4 | 'permissions' | 'memory' | 'multi-agent';

export type Exercise = { id: string; checkpoint: number; title: string; task: string; hint: string };
export const EXERCISES: Exercise[] = JSON.parse(exercisesJson);

export type Checkpoint = {
  id: CheckpointId;
  /** Files it needs beside the shared ones, e.g. the checkpoint a branch imports. */
  needs: string[];
  file: CompanionFile;
  previous?: string;
  runs: Run[];
  extra?: CompanionFile[];
  /** Exercises: the solution file and what check.py prints before you start. */
  practice?: { solution: string; before: string };
};

const strip = (s: string) => s.replace(/\s+$/, '');

const file = (name: string, code: string, note = ''): CompanionFile => ({ name, code: strip(code), language: 'python', note });

export const CHECKPOINTS: Record<CheckpointId, Checkpoint> = {
  1: {
    id: 1,
    needs: [],
    practice: { solution: strip(sol1), before: strip(check1) },
    file: { name: 'checkpoint_1.py', code: strip(cp1), language: 'python', note: '' },
    runs: [
      { label: 'Default', output: strip(out1) },
      { label: '--sloppy', output: strip(out1Sloppy) },
    ],
  },
  2: {
    id: 2,
    needs: [],
    practice: { solution: strip(sol2), before: strip(check2) },
    file: { name: 'checkpoint_2.py', code: strip(cp2), language: 'python', note: '' },
    previous: strip(cp1),
    runs: [
      { label: 'Valid search', output: strip(out2) },
      { label: 'Empty query', output: strip(out2Empty) },
      { label: 'Disallowed tool', output: strip(out2Disallowed) },
    ],
  },
  3: {
    id: 3,
    needs: [],
    practice: { solution: strip(sol3), before: strip(check3) },
    file: { name: 'checkpoint_3.py', code: strip(cp3), language: 'python', note: '' },
    previous: strip(cp2),
    runs: [
      { label: 'Finishes', output: strip(out3) },
      { label: '--max-steps 2', output: strip(out3Budget) },
    ],
  },
  4: {
    id: 4,
    needs: [],
    practice: { solution: strip(sol4), before: strip(check4) },
    file: { name: 'checkpoint_4.py', code: strip(cp4), language: 'python', note: '' },
    previous: strip(cp3),
    runs: [{ label: 'Replay + judge check', output: strip(out4) }],
    extra: [
      { name: 'replay_set.jsonl', code: strip(replaySet), language: 'json', note: 'Five questions, each with places a good answer could cite.' },
      { name: 'judge_labels.jsonl', code: strip(judgeLabels), language: 'json', note: 'Twelve claims a person labelled, used to check the judge.' },
    ],
  },
  permissions: {
    id: 'permissions',
    needs: ['checkpoint_3.py'],
    file: file('branch_permissions.py', branchPermissionsPy),
    runs: [
      { label: 'Poisoned result', output: strip(outPerm) },
      { label: '--add --yes', output: strip(outPermAdd) },
      { label: '--add --no', output: strip(outPermRefuse) },
    ],
    extra: [file('checkpoint_3.py', cp3, 'Imported for brief() and error(): the branch builds on checkpoint 3.')],
  },
  memory: {
    id: 'memory',
    needs: ['checkpoint_3.py'],
    file: file('branch_memory.py', branchMemoryPy),
    runs: [
      { label: 'No memory', output: strip(outMemory) },
      { label: '--remember child_age=4', output: strip(outMemoryRemember) },
    ],
    extra: [file('checkpoint_3.py', cp3, 'Imported for the agent prompt, the tool and handle_tool_call.')],
  },
  'multi-agent': {
    id: 'multi-agent',
    needs: ['checkpoint_3.py', 'checkpoint_4.py', 'compare.py', 'replay_set.jsonl'],
    file: file('branch_multi_agent.py', branchMultiAgentPy),
    runs: [{ label: 'Replay both setups', output: strip(outMulti) }],
    extra: [
      file('checkpoint_3.py', cp3, 'Imported for run_agent.'),
      file('checkpoint_4.py', cp4, 'Imported for the scorer and the claim splitter.'),
      file('compare.py', comparePy, 'Imported for the paired interval.'),
      { name: 'replay_set.jsonl', code: strip(replaySet), language: 'json', note: 'The same five questions as checkpoint 4.' },
    ],
  },
};

export const CHECK_PY = file('check.py', checkPy, 'Runs the exercise checks: python check.py 2');

export const COMPARE_PY: CompanionFile = { name: 'compare.py', code: strip(comparePy), language: 'python', note: '' };
export const COMPARE_OUTPUT = strip(outCompare);
export const REPLAY_SET = strip(replaySet);
export const CHECKPOINT_4_OUTPUT = strip(out4);
export const CHECKPOINT_3_OUTPUT = strip(out3);
export const PLACES_PY = strip(placesPy);
export const GROUNDING_CASES_JSON = groundingCases;

/** The running example, read from checkpoint 3 and its recorded run. */
export const EXAMPLE = {
  question: cp3.match(/args\[0\] if args else "(.+)"/)![1],
  searches: [...out3.matchAll(/proposes search_places\(query='(.+)'\)/g)].map((m) => m[1]),
  answer: strip(out3).split('\n').at(-1)!,
};

export type SetupResult = { supported: number; claims: number; latency_s: number; cost_usd: number };
export type ComparisonRow = { id: string; single: SetupResult; reviewed: SetupResult };
export const COMPARISON: ComparisonRow[] = JSON.parse(recordedComparison).questions;

/** Text between the line containing `from` and the line containing `to` (exclusive). */
export function between(code: string, from: string, to?: string): string {
  const lines = code.split('\n');
  const a = lines.findIndex((l) => l.includes(from));
  if (a < 0) throw new Error(`companion: "${from}" not found`);
  const b = to ? lines.findIndex((l, i) => i > a && l.includes(to)) : lines.length;
  return strip(lines.slice(a, b < 0 ? lines.length : b).join('\n'));
}

export const CP4 = strip(cp4);

/** 1-based line numbers in `next` that are not in `prev` (longest-common-subsequence diff). */
export function addedLines(prev: string, next: string): number[] {
  const a = prev.split('\n');
  const b = next.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (j < n) {
    if (i < m && a[i] === b[j]) {
      i++;
      j++;
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      if (b[j].trim()) added.push(j + 1);
      j++;
    }
  }
  return added;
}
