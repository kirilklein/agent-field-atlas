export type CheckState = 'pass' | 'fail' | 'skip';

export type Place = { id: string; name: string; indoor: boolean; min_age: number; summary: string };

export type TraceBlock =
  | { kind: 'json'; label: string; value: unknown; tone?: 'ok' | 'error' }
  | { kind: 'text'; label: string; text: string; tone?: 'warn' }
  | { kind: 'checks'; label: string; items: { label: string; detail: string; state: CheckState }[] }
  | { kind: 'allowlist'; allowed: string[]; proposed: string }
  | { kind: 'places'; call: string; places: Place[] }
  | { kind: 'notRun'; tool: string; reason: string }
  | { kind: 'note'; text: string };

export type Actor = 'Model' | 'Host' | 'Tool' | 'Loop' | 'Judge';

export type TraceStep = {
  actor: Actor;
  /** Short label for the step rail. */
  phase: string;
  title: string;
  summary: string;
  blocks: TraceBlock[];
  /** 1-based line numbers of the code listing to highlight. */
  lines: number[];
  tone?: 'ok' | 'fail';
};

export type TraceScenario = {
  id: string;
  label: string;
  /** One line describing the input under test. */
  input: string;
  /** This scenario's own listing, when scenarios are different designs. */
  code?: string;
  steps: TraceStep[];
};

export type Trace = {
  id: string;
  file: string;
  code: string;
  /** What a tool-execution counter should track, if anything. */
  counter?: { label: string; actor: Actor };
  scenarios: TraceScenario[];
};
