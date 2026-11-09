"""Reference solution: 1a and 1b on top of checkpoint 1. Lines marked # 1a/# 1b are new."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Rainy-day trip planner · checkpoint 1 of 4: One model call

Turn a trip question into 2-4 search queries, and check the reply
before the rest of the program relies on it.

Run:
    python checkpoint_1.py
    python checkpoint_1.py "Where can my kids see knights in armour?"
    python checkpoint_1.py --sloppy     # the fake model answers in prose first
"""
import json
import sys

from llm import call_model, set_quirks, set_trace

# -- 1 · One model call ---------------------------------------------------------

PLANNER = {"role": "system", "content":
           "Turn the trip question into 2-4 short search queries, and note the "
           "child's age if it is given. "
           'Reply with JSON only: {"queries": [...], "age": null}.'}

QUERY_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {"type": "array", "items": {"type": "string"},
                    "minItems": 2, "maxItems": 4},
        "age": {"type": ["integer", "null"]},
    },
    "required": ["queries"],
}


def plan_queries(question, retries=1):
    messages = [PLANNER, {"role": "user", "content": question}]
    for attempt in range(retries + 1):
        text = call_model(messages, schema=QUERY_SCHEMA)["text"]
        try:
            plan = json.loads(text)
            queries = [q.strip() for q in plan["queries"] if q.strip()]
            if not 2 <= len(queries) <= 4:
                raise ValueError("expected 2-4 non-empty queries")
            if len({" ".join(q.lower().split()) for q in queries}) < len(queries):  # 1a
                raise ValueError("queries must all be different")
            if any(len(q) > 80 for q in queries):  # 1b
                raise ValueError("query over 80 characters")
            return queries
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as err:
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"Invalid reply: {err}. JSON only."},
            ]
    raise RuntimeError("model never produced a valid query plan")


if __name__ == "__main__":
    set_trace()
    if "--sloppy" in sys.argv:
        set_quirks({"prose_first"})
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    question = args[0] if args else "Rainy Saturday in Florence with a 4-year-old: what can we do?"
    print("question:", question)
    print("queries: ", plan_queries(question))
