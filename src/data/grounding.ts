import { CHECKPOINT_3_OUTPUT, GROUNDING_CASES_JSON, PLACES_PY } from './companion';

/**
 * The Two Florences cases (companion/grounding_cases.json): an itinerary whose
 * phrases each trace back to a tool-result passage, or don't.
 */

export type Evidence = { call: string; place: string; field: 'summary' | 'hours'; passage: string };
export type Revision = { text: string; correct: boolean; why: string };

type RawClaim = {
  phrase: string;
  evidence: Evidence | null;
  closest?: Evidence;
  differs?: { phrase: string; passage: string };
  revisions?: Revision[];
};
type RawCall = { id: string; query: string; places: string[] };
type RawListing = { id: string; name: string; summary: string; hours: string };
type RawCase = {
  id: string;
  synthetic: boolean;
  note: string;
  question: string;
  calls: RawCall[];
  listings?: RawListing[];
  itinerary: string[];
  claims: RawClaim[];
};

export type Claim = RawClaim & { id: string; row: number };
export type Unverified = Claim & { closest: Evidence; differs: { phrase: string; passage: string }; revisions: Revision[] };
export type Segment = { kind: 'text'; text: string } | { kind: 'claim'; id: string };

export type GroundingCase = {
  id: string;
  synthetic: boolean;
  note: string;
  question: string;
  rows: Segment[][];
  claims: Record<string, Claim>;
  unverified: Unverified;
};

function fail(message: string): never {
  throw new Error(`grounding fixture: ${message}`);
}

/** Place summaries as written in places.py, string literals joined. */
function summariesFromPlacesPy(code: string): Record<string, string> {
  const out: Record<string, string> = {};
  const entry = /"id": "([^"]+)"[\s\S]*?"summary": ((?:"[^"]*"\s*)+)/g;
  for (const m of code.matchAll(entry)) {
    const literals = [...m[2].matchAll(/"([^"]*)"/g)].map((s) => s[1]);
    out[m[1]] = literals.join('');
  }
  return out;
}

/** Places each recorded call returned, from `host ▸ call_01 ok: place:a, place:b`. */
function recordedCalls(output: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of output.matchAll(/(call_\d+) ok: (.+)/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.trim());
  }
  return out;
}

const RECORDED_SUMMARIES = summariesFromPlacesPy(PLACES_PY);
const RECORDED_CALLS = recordedCalls(CHECKPOINT_3_OUTPUT);

function fieldText(c: RawCase, e: Evidence): string {
  if (c.synthetic) {
    const listing = c.listings?.find((l) => l.id === e.place) ?? fail(`${c.id}: no listing ${e.place}`);
    return listing[e.field];
  }
  if (e.field !== 'summary') fail(`${c.id}: recorded places only have a summary`);
  return RECORDED_SUMMARIES[e.place] ?? fail(`${c.id}: ${e.place} not in places.py`);
}

function checkEvidence(c: RawCase, e: Evidence) {
  const call = c.calls.find((k) => k.id === e.call) ?? fail(`${c.id}: no call ${e.call}`);
  if (!call.places.includes(e.place)) fail(`${c.id}: ${e.call} did not return ${e.place}`);
  if (!fieldText(c, e).includes(e.passage)) fail(`${c.id}: "${e.passage}" not found in ${e.place} ${e.field}`);
}

function checkRecordedCalls(c: RawCase) {
  for (const call of c.calls) {
    const recorded = RECORDED_CALLS[call.id] ?? fail(`${c.id}: ${call.id} not in checkpoint_3.txt`);
    if (recorded.join(',') !== call.places.join(',')) fail(`${c.id}: ${call.id} places differ from checkpoint_3.txt`);
  }
}

function parseRow(c: RawCase, line: string, row: number, claims: Record<string, Claim>): Segment[] {
  const segments: Segment[] = [];
  for (const [n, part] of line.split(/\[([^\]]+)\]/).entries()) {
    const isPhrase = n % 2 === 1;
    if (!isPhrase) {
      if (part) segments.push({ kind: 'text', text: part });
      continue;
    }
    const index = c.claims.findIndex((k) => k.phrase === part);
    if (index < 0) fail(`${c.id}: no claim for [${part}]`);
    const id = `${c.id}-${index}`;
    claims[id] = { ...c.claims[index], id, row };
    segments.push({ kind: 'claim', id });
  }
  return segments;
}

function buildCase(c: RawCase): GroundingCase {
  if (!c.synthetic) checkRecordedCalls(c);
  const claims: Record<string, Claim> = {};
  const rows = c.itinerary.map((line, row) => parseRow(c, line, row, claims));
  if (Object.keys(claims).length !== c.claims.length) fail(`${c.id}: every claim needs one [phrase] in the itinerary`);

  for (const claim of Object.values(claims)) {
    if (claim.evidence) checkEvidence(c, claim.evidence);
  }
  const unverifiedClaims = Object.values(claims).filter((k) => !k.evidence);
  if (unverifiedClaims.length !== 1) fail(`${c.id}: expected exactly one unverified claim`);
  const u = unverifiedClaims[0];
  if (!u.closest || !u.differs || !u.revisions) fail(`${c.id}: the unverified claim needs closest, differs and revisions`);
  checkEvidence(c, u.closest);
  if (!u.phrase.includes(u.differs.phrase)) fail(`${c.id}: "${u.differs.phrase}" not in the phrase`);
  if (!u.closest.passage.includes(u.differs.passage)) fail(`${c.id}: "${u.differs.passage}" not in the closest passage`);
  if (u.revisions.filter((r) => r.correct).length !== 1) fail(`${c.id}: expected exactly one correct revision`);

  return {
    id: c.id,
    synthetic: c.synthetic,
    note: c.note,
    question: c.question,
    rows,
    claims,
    unverified: u as Unverified,
  };
}

export const GROUNDING_CASES: GroundingCase[] = (JSON.parse(GROUNDING_CASES_JSON).cases as RawCase[]).map(buildCase);

export function sourceLabel(e: Evidence): string {
  return `${e.call} · ${e.place} · ${e.field}`;
}
