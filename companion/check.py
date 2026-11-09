"""Check your exercise solutions.

    python check.py 2              # checks exercises 2a and 2b against checkpoint_2.py
    python check.py all
    python check.py 2 --solutions  # run the same checks against solutions/checkpoint_2.py

Each check drives your code with a scripted model, so results do not depend on
the fake model's behaviour.
"""
import contextlib
import importlib.util
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def load(n, solutions=False):
    path = os.path.join(HERE, "solutions" if solutions else "", f"checkpoint_{n}.py")
    spec = importlib.util.spec_from_file_location(f"checkpoint_{n}_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Script:
    """Stands in for call_model: planner calls get a fixed plan, tool-capable
    calls get the scripted replies in order."""

    def __init__(self, plan_replies=None, act_replies=None):
        self.plan_replies = list(plan_replies or ['{"queries": ["hands-on museums", "knights in armour"]}'])
        self.act_replies = list(act_replies or [])
        self.calls = []

    def __call__(self, messages, tools=None, schema=None):
        self.calls.append([dict(m) for m in messages])
        if tools:
            reply = self.act_replies.pop(0) if self.act_replies else {"text": "Done [place:uffizi].", "tool_calls": []}
            return {"text": reply.get("text"), "tool_calls": reply.get("tool_calls", [])}
        text = self.plan_replies.pop(0) if len(self.plan_replies) > 1 else self.plan_replies[0]
        return {"text": text, "tool_calls": []}


def search(i, query, **extra):
    return {"text": None, "tool_calls": [{"id": f"t{i}", "name": "search_places", "arguments": {"query": query, **extra}}]}


def count_tool_runs(module):
    real = module.ALLOWED_TOOLS["search_places"]
    counter = {"n": 0}

    def wrapped(*args, **kwargs):
        counter["n"] += 1
        return real(*args, **kwargs)

    module.ALLOWED_TOOLS["search_places"] = wrapped
    return counter


# -- checks: each returns None on success or a message saying what is wrong ------

def check_1a(m):
    m.call_model = s = Script(['{"queries": ["kids museums", "Kids  museums "]}', '{"queries": ["museums", "lunch"]}'])
    out = m.plan_queries("q")
    if out != ["museums", "lunch"]:
        return f"duplicates were accepted: plan_queries returned {out}"
    if len(s.calls) != 2 or "Invalid reply" not in s.calls[1][-1]["content"]:
        return "the model should get one retry that explains the problem"


def check_1b(m):
    long_query = "what can we do on a rainy saturday in florence with a four year old who loves animals"
    m.call_model = s = Script([json.dumps({"queries": [long_query, "lunch"]}), '{"queries": ["museums", "lunch"]}'])
    out = m.plan_queries("q")
    if out != ["museums", "lunch"]:
        return "a query over 80 characters was accepted"
    if len(s.calls) != 2:
        return "the model should get one retry"


def check_2a(m):
    props = m.SEARCH_PLACES["input_schema"]["properties"]
    if "age" not in props:
        return "age is not declared in SEARCH_PLACES"
    runs = count_tool_runs(m)
    ok = m.handle_tool_call({"id": "a", "name": "search_places", "arguments": {"query": "Renaissance paintings museum", "age": 4}})
    if ok["status"] != "ok" or not ok["content"]:
        return "a valid age should return places"
    if any(p["min_age"] > 4 for p in ok["content"]):
        return "places for older children were returned"
    before = runs["n"]
    for bad in ("four", True, 40):
        r = m.handle_tool_call({"id": "b", "name": "search_places", "arguments": {"query": "museum", "age": bad}})
        if r["status"] != "error" or r["error"]["code"] != "invalid_arguments":
            return f"age={bad!r} should be rejected with invalid_arguments"
    if runs["n"] != before:
        return "the tool ran even though age was invalid"
    plain = m.handle_tool_call({"id": "c", "name": "search_places", "arguments": {"query": "museum"}})
    if plain["status"] != "ok":
        return "searches without age should still work"


def check_2b(m):
    runs = count_tool_runs(m)
    r = m.handle_tool_call({"id": "a", "name": "search_places", "arguments": {"query": "the of and"}})
    if r["status"] != "error" or r["error"]["code"] != "invalid_arguments":
        return "a stopword-only query should be rejected with invalid_arguments"
    if runs["n"]:
        return "the tool ran for a stopword-only query"
    if m.handle_tool_call({"id": "b", "name": "search_places", "arguments": {"query": "museum"}})["status"] != "ok":
        return "ordinary queries should still work"


def check_3a(m):
    runs = count_tool_runs(m)
    m.call_model = Script(act_replies=[search(1, "knights armour"), search(2, "Knights  armour"), {"text": "Done [place:uffizi]."}])
    run = m.run_agent("q")
    errors = [x for x in run["messages"] if x["role"] == "tool" and x["status"] == "error"]
    if runs["n"] != 1:
        return f"the repeated search ran the tool {runs['n']} times; it should run once"
    if not errors or errors[0]["error"]["code"] != "duplicate_search":
        return "the repeated search should come back as an error with code duplicate_search"


def check_3b(m):
    queries = ["knights armour", "telescopes", "animals", "paintings", "gardens", "towers"]
    m.call_model = Script(act_replies=[search(i, q) for i, q in enumerate(queries, 1)])
    try:
        run = m.run_agent("q", max_chars=1500)
    except TypeError:
        return "run_agent does not accept max_chars"
    if run["stop"] != "context_budget":
        return f"expected stop='context_budget', got {run['stop']!r}"
    m.call_model = Script(act_replies=[search(1, "museum"), {"text": "Done [place:uffizi]."}])
    if m.run_agent("q")["stop"] != "done":
        return "with the default budget, a short run should finish normally"


def check_4a(m):
    with open(os.path.join(HERE, "judge_labels.jsonl")) as f:
        labels = [json.loads(line) for line in f if line.strip()]
    places = {p["id"]: p for p in m.PLACES}
    wrong = [x["claim"] for x in labels
             if m.overlap_judge(x["claim"], places[x["place"]]["name"] + ". " + places[x["place"]]["summary"]) != x["supported"]]
    if wrong:
        return f"{len(labels) - len(wrong)}/{len(labels)} agree; still wrong on: {wrong[0]!r}"


def check_4b(m):
    if not hasattr(m, "cites_expected"):
        return "cites_expected is not defined"
    claims = [{"text": "a", "cites": "place:a"}, {"text": "b", "cites": None}]
    if m.cites_expected(claims, ["place:a", "place:z"]) is not True:
        return "should be True when one claim cites an expected place"
    if m.cites_expected(claims, ["place:z"]) is not False:
        return "should be False when no claim cites an expected place"
    if m.cites_expected([], ["place:a"]) is not False:
        return "should be False for an answer with no claims"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    which = args[0] if args else "all"
    use_solutions = "--solutions" in sys.argv
    exercises = json.load(open(os.path.join(HERE, "exercises.json")))
    passed = 0
    for ex in exercises:
        if which != "all" and str(ex["checkpoint"]) != which:
            continue
        with contextlib.redirect_stdout(io.StringIO()):
            module = load(ex["checkpoint"], use_solutions)
            try:
                problem = globals()[f"check_{ex['id']}"](module)
            except Exception as err:  # a crash is a failed check, with the reason
                problem = f"{type(err).__name__}: {err}"
        if problem:
            print(f"✗ {ex['id']}  {ex['title']}: {problem}")
        else:
            passed += 1
            print(f"✓ {ex['id']}  {ex['title']}")
    total = sum(1 for ex in exercises if which == "all" or str(ex["checkpoint"]) == which)
    print(f"\n{passed}/{total} passing")
    sys.exit(0 if passed == total else 1)
