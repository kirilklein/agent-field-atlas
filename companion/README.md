# Rainy-day trip planner: runnable companion

The code behind the Agent Field Atlas, in plain Python (3.9+, standard library only).
Each checkpoint is one complete file that contains everything from the previous one,
plus the new piece.

| File | Landmark | Try |
|---|---|---|
| `checkpoint_1.py` | One model call | `python checkpoint_1.py --sloppy` |
| `checkpoint_2.py` | Tool calling | `python checkpoint_2.py --scenario disallowed` |
| `checkpoint_3.py` | Agent loop | `python checkpoint_3.py --max-steps 2` |
| `checkpoint_4.py` | Evaluation | `python checkpoint_4.py` |
| `branch_permissions.py` | Permissions branch | `python branch_permissions.py` |
| `branch_memory.py` | Context & memory branch | `python branch_memory.py --remember child_age=4` |
| `branch_multi_agent.py` | Multi-agent branch | `python branch_multi_agent.py` |
| `compare.py` | Multi-agent branch (recorded real-model numbers) | `python compare.py` |

The branch files import from `checkpoint_3.py` (and `checkpoint_4.py`) instead of copying it.

## Exercises

`exercises.json` lists two small tasks per checkpoint. Edit the checkpoint file, then:

```bash
python check.py 2              # checks 2a and 2b against your checkpoint_2.py
python check.py all
python check.py 2 --solutions  # the reference solutions in solutions/
```

Each check drives your code with a scripted model, so it tests your logic, not the fake model.

Shared pieces:

- `llm.py` — `call_model(messages, tools, schema)`, the only code that talks to a model.
- `claude_model.py` — the Claude adapter that `llm.py` calls with `ATLAS_MODEL=claude`.
- `tracing.py` — prints the `model ▸` and `host ▸` lines.
- `fake_model.py` — a scripted model, so everything runs offline and the same way every time.
  It has a few switchable quirks and two bad habits, so the checks have something to catch.
- `places.py` — nine real places in Florence, with short notes, and a read-only keyword `search_places`.
- `replay_set.jsonl`, `judge_labels.jsonl`, `recorded_comparison.json` — evaluation fixtures.
- `expected/` — what each command prints with the fake model. Re-record after changing a file.

## Use a real model

```bash
pip install anthropic
export ANTHROPIC_API_KEY=...
ATLAS_MODEL=claude python checkpoint_3.py
```

A good first test is the full evaluation, which exercises planning, tool calls, the loop and the judge:

```bash
ATLAS_MODEL=claude python checkpoint_4.py
```

`ATLAS_CLAUDE_MODEL` picks the model (default `claude-sonnet-5-5`). With a real model,
checkpoint 4 also switches from the word-overlap judge to a model judge, and the
fake-model flags (`--sloppy`, `--scenario`) have no effect.
