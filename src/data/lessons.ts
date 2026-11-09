import { CHECKPOINT_4_OUTPUT, CP4, REPLAY_SET, between, type CheckpointId } from './companion';
import type { RegionId } from './types';

export type Example = {
  label: string;
  language: 'python' | 'json' | 'text';
  code: string;
};

export type Interaction =
  | { kind: 'trace'; traceId: string; prompt: string }
  | { kind: 'compare' }
  | { kind: 'checkpoint'; id: CheckpointId }
  | { kind: 'tokens' }
  | { kind: 'interval' };

export type Lesson = {
  /** One sentence: why this concept matters. Backticks mark inline code here and below. */
  why: string;
  /** The explanation as short steps, one idea each. */
  steps: string[];
  terms?: { term: string; def: string }[];
  example?: Example;
  interaction?: Interaction;
};

type LessonKey = `${RegionId}/${string}`;

/**
 * Lesson content, keyed by region/concept. Every lesson follows the same
 * paper-search assistant, and repeats one idea: the model proposes, the host decides.
 */
export const LESSONS: Record<LessonKey, Lesson> = {
  /* I · One model call ------------------------------------------------ */
  'one-model-call/the-request': {
    why: 'Everything else on the trail builds on this one call.',
    steps: [
      'A model call takes a list of messages and returns one proposal.',
      'The model knows only what is in that list. Nothing carries over between calls unless you put it back.',
      'The model only proposes. Your code runs tools, keeps state, checks replies and decides when to stop.',
      'Wrap your provider’s SDK in one function, `call_model`. The rest of the assistant is plain Python.',
    ],
    terms: [
      { term: 'Message list', def: 'The messages you send in one call: system instructions, the question, earlier replies.' },
      { term: 'Proposal', def: 'What the model returns: text, or a request to call a tool. Your code decides what to do with it.' },
      { term: 'Host', def: 'Your code around the model. It checks, runs and stops things.' },
    ],
    example: {
      label: 'assistant.py',
      language: 'python',
      code: `def call_model(messages, tools=None, schema=None):
    """Thin wrapper over your provider's SDK (see llm.py).
    Returns {"text": str | None, "tool_calls": list[dict]}."""
    ...

# The whole agent, in three lines:
#   proposal = call_model(messages)     the model proposes
#   result = host(proposal)             your code decides and acts
#   messages += [proposal, result]      and the next call sees both

messages = [
    {"role": "system", "content": "You help researchers find papers."},
    {"role": "user", "content": "How do LLM agents decide when to call a tool?"},
]
reply = call_model(messages)
print(reply["text"])`,
    },
  },
  'one-model-call/structured-output': {
    why: 'Your program needs fields it can use, not prose it has to guess at.',
    steps: [
      'Free text is for people. Your program needs fields.',
      'Describe the shape you want: two to four search queries and an optional start year.',
      'Ask for JSON in exactly that shape. Many providers can enforce the schema for you.',
      'The model reads the schema too, so it doubles as documentation.',
    ],
    terms: [
      { term: 'JSON schema', def: 'A description of the fields a JSON object must have and their types.' },
    ],
    example: {
      label: 'plan.py',
      language: 'python',
      code: `QUERY_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {"type": "array", "items": {"type": "string"},
                    "minItems": 2, "maxItems": 4},
        "year_from": {"type": ["integer", "null"]},
    },
    "required": ["queries"],
}

reply = call_model(
    [{"role": "system", "content": "Turn the question into search queries. "
                                   "Reply with JSON only."},
     {"role": "user", "content": question}],
    schema=QUERY_SCHEMA,
)
# reply["text"] == '{"queries": ["LLM agents tool use", ...], "year_from": 2022}'`,
    },
  },
  'one-model-call/parse-a-reply': {
    why: 'A reply can be wrong. Your code has to notice before anything relies on it.',
    steps: [
      'The reply is a proposal, not a value.',
      'Parse it, and check every field you rely on.',
      'Decide what happens when it is wrong. Here: retry once with the error message, then fail loudly.',
      'This is the pattern for the whole trail: the model proposes, the host checks.',
    ],
    terms: [
      { term: 'Parse', def: 'Turn the reply text into data, for example with `json.loads`.' },
      { term: 'Retry', def: 'Call the model again, with the error added to the message list.' },
    ],
    interaction: {
      kind: 'trace',
      traceId: 'parse-a-reply',
      prompt: 'Pick a reply and step through what the host does with it.',
    },
  },

  /* II · Tool calling ------------------------------------------------- */
  'tool-calling/declare-a-tool': {
    why: 'The model can only ask for tools it has been told about. The declaration is that telling.',
    steps: [
      'A tool is a name, a description and a JSON schema for its arguments.',
      'You send these declarations with the request.',
      'The model may then answer with a tool call: a request that your code run `search_papers` with some arguments.',
      'The model never runs anything itself.',
      'The declaration is all the model knows about the tool, so the description is part of your prompt.',
    ],
    terms: [
      { term: 'Tool call', def: 'A proposal to run a named tool with given arguments. Only your code can run it.' },
      { term: 'Argument schema', def: 'The JSON schema that says which arguments the tool accepts.' },
    ],
    example: {
      label: 'tools.py',
      language: 'python',
      code: `SEARCH_PAPERS = {
    "name": "search_papers",
    "description": "Search the paper index. Returns up to 3 papers "
                   "with id, title, year and summary. Read-only.",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "maxLength": 200}},
        "required": ["query"],
    },
}

reply = call_model(messages, tools=[SEARCH_PAPERS])
reply["tool_calls"]
# [{"id": "call_01", "name": "search_papers",
#   "arguments": {"query": "LLM agents decide call tool"}}]`,
    },
  },
  'tool-calling/inspect-a-call': {
    why: 'This one function is where your code says yes or no to everything the model asks for.',
    steps: [
      'Between the model’s proposal and the tool sits one function you own: `handle_tool_call`.',
      'It checks the tool name against an allowlist.',
      'It checks the arguments against what the tool really accepts. A schema guides the model but doesn’t bind it.',
      'Only a call that passes every check runs.',
      'Every outcome, success or rejection, goes back to the model as a structured message.',
    ],
    terms: [
      { term: 'Allowlist', def: 'The set of tool names your code is willing to run. Anything else is refused.' },
    ],
    interaction: {
      kind: 'trace',
      traceId: 'inspect-a-call',
      prompt: 'Choose what the model proposes, then step through the host code.',
    },
  },
  'tool-calling/errors-are-results': {
    why: 'A clear error lets the model fix its mistake on the next turn instead of crashing the run.',
    steps: [
      'When a check fails or the tool raises, don’t crash the loop. Don’t drop the call silently either.',
      'Return a structured error: a stable code and a message written for the model.',
      'Models recover well from specific errors. An empty query becomes a real one on the next turn.',
      'Your logs also get one uniform record of what went wrong.',
    ],
    terms: [
      { term: 'Structured error', def: 'An error returned as data, with a fixed code and a short message.' },
    ],
    example: {
      label: 'host.py',
      language: 'python',
      code: `try:
    papers = search_papers(query=query, limit=3)
except TimeoutError:
    return error(call, "tool_timeout",
                 "search took too long; try a narrower query")

# What the model reads on its next turn:
# {"role": "tool", "tool_call_id": "call_02", "status": "error",
#  "error": {"code": "invalid_arguments",
#            "message": "query must be a non-empty string"}}`,
    },
  },

  /* III · Agent loop -------------------------------------------------- */
  'agent-loop/the-loop': {
    why: 'This is what turns one model call into an agent.',
    steps: [
      'An agent is a loop around the model call.',
      'The first message carries the question and the searches `plan_queries` suggested.',
      'Each turn sends the whole history.',
      'If the reply has tool calls, run each through `handle_tool_call`, add the results and go again.',
      'If the reply has only text, that text is the answer. The model decides what to try next; the loop decides what is allowed and when to stop.',
    ],
    terms: [
      { term: 'Turn', def: 'One pass of the loop: one model call, plus any tool calls it proposed.' },
      { term: 'History', def: 'The growing message list: question, proposals and results so far.' },
    ],
    example: {
      label: 'checkpoint_3.py',
      language: 'python',
      code: between(CP4, 'AGENT = ', '# -- 4 ·'),
    },
  },
  'agent-loop/watch-a-run': {
    why: 'Seeing the loop turn by turn makes it concrete.',
    steps: [
      'Here are two runs of `run_agent` from checkpoint 3, played by the fake model.',
      'Run one: two searches are enough, and the model answers on step 3.',
      'Run two: the budget is two steps, and the model still wants to search.',
      'So the loop stops it, and says why.',
    ],
    terms: [
      { term: 'Fake model', def: 'A scripted stand-in for a real model, so every run is the same and needs no key.' },
      { term: 'Budget', def: 'A limit your code sets, here on the number of steps.' },
    ],
    interaction: {
      kind: 'trace',
      traceId: 'watch-a-run',
      prompt: 'Pick a run and step through each turn of the loop.',
    },
  },
  'agent-loop/stop-conditions': {
    why: 'A loop without a clear stop can run forever, or return half an answer as if it were done.',
    steps: [
      'There are two honest ways to stop.',
      'One: the model returns text with no tool calls.',
      'Two: the host runs out of budget. Budgets can count steps, tokens, seconds or money. Steps are simplest and roughly bound the rest.',
      'When the budget ends a run, say so in the result. Don’t pass off a half-finished draft as an answer: callers and your evaluation need to tell the two apart.',
    ],
    terms: [
      { term: 'Stop condition', def: 'The rule that ends the loop: an answer, or the budget running out.' },
    ],
    example: {
      label: 'cli.py',
      language: 'python',
      code: `result = run_agent("Which benchmarks test tool-using agents?", max_steps=2)

if result["stop"] == "step_budget":
    print(f"Stopped after {result['steps']} steps without an answer.")
    # show what was gathered, offer to continue, or raise the budget
else:
    print(result["answer"])`,
    },
  },

  /* IV · Evaluation --------------------------------------------------- */
  'evaluation/replay-set': {
    why: 'You can’t tell by eye whether a change helped. You need fixed questions to rerun.',
    steps: [
      'Write down a handful of real questions, with papers a good answer could cite.',
      'With a fixed paper index, replays give the same questions and the same search results.',
      'So only the model’s behaviour can change between runs.',
      'Five questions is enough to find bugs. It is far too few to measure small improvements (see Trust the numbers).',
    ],
    terms: [
      { term: 'Replay set', def: 'A fixed list of questions you run again after every change.' },
    ],
    example: { label: 'replay_set.jsonl', language: 'json', code: REPLAY_SET },
  },
  'evaluation/score-a-replay': {
    why: 'A score is only useful if you know how each claim was checked.',
    steps: [
      'Check every claim in two steps.',
      'First: is the cited paper one the assistant actually retrieved? That is a set lookup. It catches invented IDs.',
      'Second: does the paper support the claim? That needs judgement, usually a separate model call that sees one claim and one paper summary.',
      'Offline, checkpoint 4 uses a cheap word-overlap judge instead, and measures how often it is wrong.',
    ],
    terms: [
      { term: 'Claim', def: 'One statement in the answer, with the paper it cites.' },
      { term: 'Judge', def: 'Whatever decides if a paper supports a claim: a model call, or here a word-overlap rule.' },
    ],
    interaction: {
      kind: 'trace',
      traceId: 'score-a-replay',
      prompt: 'Pick an answer and step through how it is scored.',
    },
  },
  'evaluation/trust-the-numbers': {
    why: 'A score from a few claims, checked by an imperfect judge, says less than it seems.',
    steps: [
      'Checkpoint 4 reports 11 of 12 claims supported. Two things limit what that means.',
      'Size: with 12 claims, the 95% interval runs from 65% to 99%. One more failure moves the score by 8 points.',
      'The judge: on twelve claims a person labelled, it agreed on 10 and passed two overstatements. One of those is in this replay, so the real figure is 10 of 12.',
      'So: check the judge before trusting it, report intervals, and keep the failing claims. They tell you what to fix.',
    ],
    terms: [
      { term: '95% interval', def: 'The range the true rate likely falls in, given how few claims you checked.' },
      { term: 'Overstatement', def: 'A claim that says more than the paper does.' },
    ],
    example: { label: 'python checkpoint_4.py', language: 'text', code: CHECKPOINT_4_OUTPUT },
    interaction: { kind: 'interval' },
  },

  /* Checkpoints ------------------------------------------------------ */
  'one-model-call/checkpoint': {
    why: 'Running the code yourself is how the idea sticks.',
    steps: [
      'You now have `plan_queries`: one model call whose reply is parsed and checked before anything uses it.',
      'Copy the checkpoint and the three shared files into one folder. Run it with plain Python.',
      'It needs no key: a scripted fake model answers.',
      'Try `--sloppy` to watch the retry, then do the two exercises below.',
    ],
    interaction: { kind: 'checkpoint', id: 1 },
  },
  'tool-calling/checkpoint': {
    why: 'Running the code yourself is how the idea sticks.',
    steps: [
      'New here: a tool declaration, an allowlist and `handle_tool_call`.',
      'The model proposes a call. `search_papers` runs only after every check passes.',
      'Run the three scenarios and compare what the model receives in each. They are the same three cases as Inspect a call.',
      'Then extend the tool in the exercises below.',
    ],
    interaction: { kind: 'checkpoint', id: 2 },
  },
  'agent-loop/checkpoint': {
    why: 'Running the code yourself is how the idea sticks.',
    steps: [
      'New here: the agent prompt, `brief` (which reuses `plan_queries` to suggest searches), and `run_agent`.',
      'The loop itself is a dozen lines. Everything else is code you already have.',
      'Run it with `--max-steps 2` to see the budget end a run.',
      'The exercises add two more ways for the host to say no.',
    ],
    interaction: { kind: 'checkpoint', id: 3 },
  },
  'evaluation/checkpoint': {
    why: 'Running the code yourself is how the idea sticks.',
    steps: [
      'New here: claim splitting, two judges, `score`, a Wilson interval and `check_judge`.',
      'Read the output closely. The replay says 11 of 12 claims are supported.',
      'But the judge check shows the offline judge passing two overstatements, one of them in this replay.',
      'Exercise 4a fixes that.',
    ],
    terms: [
      { term: 'Wilson interval', def: 'A way to compute the 95% interval for a rate that works with small counts.' },
    ],
    interaction: { kind: 'checkpoint', id: 4 },
  },

  /* Branch runs ------------------------------------------------------- */
  'permissions/run-it': {
    why: 'This shows the difference between a tool that doesn’t exist and one that needs a person’s yes.',
    steps: [
      'A search result has instructions hidden in its summary. The fake model obeys them and asks for `delete_library`.',
      'The host never offered that tool, so nothing happens.',
      'Saving is different: `save_to_library` exists, but runs only after a person confirms.',
      'Run it with `--save --yes` and `--save --no` to see both answers.',
    ],
    interaction: { kind: 'checkpoint', id: 'permissions' },
  },
  'context-memory/run-it': {
    why: 'This shows what trimming saves, what it costs, and how saved memory rides along.',
    steps: [
      'One question, run twice with five searches: once keeping every result, once keeping only the last two in full.',
      'The table shows tokens sent per call.',
      'Trimming saves tokens, at a price: the answer can no longer describe papers whose summaries were trimmed.',
      'Then save a preference with `--remember year_from=2023`, and see the host apply it to every search.',
    ],
    interaction: { kind: 'checkpoint', id: 'memory' },
  },
  'multi-agent/run-it': {
    why: 'This shows a reviewer working, and how hard it is to prove it helps.',
    steps: [
      'The reviewer and the revision run for real against the fake model, on the five replay questions.',
      'The reviewer catches both planted problems.',
      'The paired comparison shows the extra calls and tokens as real differences.',
      'Citation support comes out as “can’t tell yet”, partly because the word-overlap judge cannot see one of the fixes.',
    ],
    interaction: { kind: 'checkpoint', id: 'multi-agent' },
  },

  /* A · Permissions --------------------------------------------------- */
  'permissions/read-only-tools': {
    why: 'The safest power is one you never hand over.',
    steps: [
      'A paper-search assistant needs to read, so expose read-only tools.',
      'Anything that writes, sends, deletes or spends is either absent, or behind a confirmation a person completes.',
      'The system prompt can ask the model to behave.',
      'Only the host’s allowlist can say no.',
    ],
    terms: [
      { term: 'Read-only tool', def: 'A tool that only looks things up and changes nothing.' },
      { term: 'Confirmation', def: 'A step where a person, not the model, approves an action.' },
    ],
    example: {
      label: 'permissions.py',
      language: 'python',
      code: `READ_ONLY = {"search_papers": search_papers, "get_abstract": get_abstract}
NEEDS_CONFIRMATION = {"save_to_library": save_to_library}

def allowed(name, confirmed_by_user=False):
    if name in READ_ONLY:
        return True
    if name in NEEDS_CONFIRMATION:
        return confirmed_by_user   # a person clicked "Save", not the model
    return False`,
    },
  },
  'permissions/untrusted-results': {
    why: 'Text from the outside world ends up in front of the model. Some of it will try to steer it.',
    steps: [
      'Tool results are written by strangers.',
      'An abstract or a web page can contain text that reads like instructions. It lands in the same message list as your real ones.',
      'Assume it will sometimes work on the model.',
      'Defend where the model can’t be talked out of it: fence results as data, keep tools read-only, and check every proposal the same way, whatever came before.',
    ],
    terms: [
      { term: 'Prompt injection', def: 'Instructions hidden in data (like a search result) that try to steer the model.' },
    ],
    interaction: {
      kind: 'trace',
      traceId: 'untrusted-results',
      prompt: 'Compare an injected result with an ordinary one.',
    },
  },

  /* B · Context & memory --------------------------------------------- */
  'context-memory/run-state': {
    why: 'The host needs facts it can check quickly, without rereading the whole conversation.',
    steps: [
      'Inside one run, the message list is the state: the question, every proposal, every result.',
      'Keep a little structured state beside it: the step count, paper IDs already seen.',
      'Then the host can decide things without re-reading prose.',
      'All of it is thrown away when the run ends. Nothing from this run should reach the next by accident.',
    ],
    terms: [
      { term: 'Run state', def: 'What the host tracks during one run, next to the messages.' },
    ],
    example: {
      label: 'state.py',
      language: 'python',
      code: `@dataclass
class RunState:
    messages: list[dict]
    step: int = 0
    seen_ids: set[str] = field(default_factory=set)

    def record(self, result):
        for paper in result.get("content", []):
            self.seen_ids.add(paper["id"])   # skip repeats next search`,
    },
  },
  'context-memory/saved-memory': {
    why: 'Some facts should outlive a run, but only the ones you chose to keep.',
    steps: [
      'Memory across runs is a small, separate store you write to on purpose. It is not a replay of old transcripts.',
      'Save durable facts the user stated, like a year cutoff or a reading list.',
      'Load them into the system message when a run starts.',
      'Because it is explicit, the user can see it, edit it and delete it.',
    ],
    terms: [
      { term: 'Memory', def: 'A small saved file of facts, loaded at the start of each run.' },
    ],
    example: {
      label: 'memory.py',
      language: 'python',
      code: `# memory.json — written only when the user asks
# {"prefers_after": 2020, "reading_list": ["arXiv:2210.03629"]}

def system_message(memory):
    return {"role": "system", "content":
            "You help researchers find papers.\\n"
            f"Saved user preferences: {json.dumps(memory)}"}

messages = [system_message(load_memory()), {"role": "user", "content": q}]`,
    },
  },
  'context-memory/cost-of-history': {
    why: 'Long runs get expensive fast, because every call resends everything before it.',
    steps: [
      'Every call resends the whole message list.',
      'Say the system prompt and question are P tokens, and each step adds r tokens. Call i then sends P + (i−1)·r tokens.',
      'n calls send nP + r·n(n−1)/2 in total. The second term grows with the square of the steps, so long runs are mostly old results being resent.',
      'Keeping only the last k results caps each call at P + k·r, and the total grows linearly again.',
      'Prompt caching lowers the price of a repeated prefix, but those tokens still fill the context window.',
    ],
    terms: [
      { term: 'Token', def: 'A small chunk of text. Models count and charge by tokens.' },
      { term: 'Context window', def: 'The most tokens a model can read in one call.' },
      { term: 'Prompt caching', def: 'A provider discount for a prefix you send again unchanged.' },
    ],
    example: {
      label: 'trim.py',
      language: 'python',
      code: `def trim(messages, keep_last=2):
    """Shrink all but the last few tool results to id + title."""
    tool_idx = [i for i, m in enumerate(messages) if m["role"] == "tool"]
    for i in tool_idx[:-keep_last]:
        papers = messages[i].get("content") or []
        messages[i] = {**messages[i], "content": [
            {"id": p["id"], "title": p["title"]} for p in papers]}
    return messages`,
    },
    interaction: { kind: 'tokens' },
  },

  /* C · Multi-agent --------------------------------------------------- */
  'multi-agent/add-a-reviewer': {
    why: 'A second look with a different job catches mistakes the writer can’t see in its own draft.',
    steps: [
      'A reviewer is a second model call with a different job and less context.',
      'It sees the draft answer plus the abstracts it cites, and flags claims those abstracts don’t support.',
      'The writer revises once with that feedback.',
      'It is still one host program. The “agents” are roles with their own prompts and tools, and the reviewer gets no tools at all.',
    ],
    terms: [
      { term: 'Role', def: 'One model call with its own prompt and tools. Several roles make a multi-agent setup.' },
    ],
    example: {
      label: 'review.py',
      language: 'python',
      code: `def answer_with_review(question):
    draft = run_agent(question)
    cited = {pid: INDEX[pid] for pid in citations(draft["answer"])}
    review = call_model([REVIEWER_SYSTEM, {"role": "user", "content":
                         json.dumps({"draft": draft["answer"], "papers": cited})}])
    if review["text"].strip() == "NO_ISSUES":
        return draft
    return revise(question, draft, feedback=review["text"])`,
    },
  },
  'multi-agent/compare-on-evals': {
    why: 'Adding a reviewer costs more. You need evidence that it also helps.',
    steps: [
      'Both setups answered the same five replay questions, so compare them question by question. Pairing removes the differences between questions from the noise.',
      'Latency and cost rise on every question by similar amounts, so those differences are real.',
      'Citation accuracy rises on two questions, falls on one and is flat on two. Its 95% interval runs from −41 to +54 points.',
      'The honest result is “can’t tell yet”. If the pattern held, telling the setups apart would take roughly 130 questions.',
    ],
    terms: [
      { term: 'Paired comparison', def: 'Comparing two setups on the same questions, one question at a time.' },
    ],
    interaction: { kind: 'compare' },
  },
};

export function lessonFor(region: RegionId, concept: string): Lesson | undefined {
  return LESSONS[`${region}/${concept}`];
}
