"""Reference solution: 3a and 3b on top of checkpoint 3. Lines marked # 3a/# 3b are new."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Rainy-day trip planner · checkpoint 3 of 4: Agent loop

Feed each result back into the next model call. Stop when the model answers
without asking for a tool, or when the step budget runs out.

Run:
    python checkpoint_3.py
    python checkpoint_3.py --max-steps 2     # watch the budget stop the run
"""
import json
import sys

from llm import call_model, flush_trace, set_quirks, set_trace
from places import search_places

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
            return queries
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as err:
            messages += [
                {"role": "assistant", "content": text},
                {"role": "user", "content": f"Invalid reply: {err}. JSON only."},
            ]
    raise RuntimeError("model never produced a valid query plan")


# -- 2 · Tool calling -----------------------------------------------------------

SEARCH_PLACES = {
    "name": "search_places",
    "description": "Search places in Florence. Returns up to 3 places "
                   "with id, name, indoor, min_age and summary. Read-only.",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "maxLength": 200}},
        "required": ["query"],
    },
}

ALLOWED_TOOLS = {"search_places": search_places}
MAX_QUERY = 200

def handle_tool_call(call):
    # A proposal from the model. Nothing has run yet.
    name = call["name"]
    args = call.get("arguments", {})

    if name not in ALLOWED_TOOLS:
        return error(call, "tool_not_allowed",
            f"{name!r} is not available")

    query = args.get("query")
    if not isinstance(query, str) or not query.strip():
        return error(call, "invalid_arguments",
            "query must be a non-empty string")
    if len(query) > MAX_QUERY:
        return error(call, "invalid_arguments",
            f"query is over {MAX_QUERY} characters")

    places = ALLOWED_TOOLS[name](query.strip(), limit=3)
    return {"tool_call_id": call["id"],
            "status": "ok", "content": places}

def error(call, code, msg):
    return {"tool_call_id": call["id"],
            "status": "error",
            "error": {"code": code, "message": msg}}


# -- 3 · Agent loop -------------------------------------------------------------

AGENT = {"role": "system", "content":
         "You help families plan a day out in Florence. Use search_places to find "
         "options, then answer in 2-4 sentences. End every sentence with exactly one "
         "citation like [place:uffizi], using only IDs from your search results."}


def brief(question):
    return question + "\n\nSuggested searches: " + "; ".join(plan_queries(question))


def run_agent(question, max_steps=6, max_chars=20000):
    messages = [AGENT, {"role": "user", "content": brief(question)}]
    searched = set()  # 3a
    for step in range(1, max_steps + 1):
        if len(json.dumps(messages)) > max_chars:  # 3b
            return {"answer": None, "steps": step - 1, "stop": "context_budget", "messages": messages}
        reply = call_model(messages, tools=[SEARCH_PLACES])
        messages.append({"role": "assistant", **reply})
        if not reply["tool_calls"]:
            return {"answer": reply["text"], "steps": step, "stop": "done", "messages": messages}
        for call in reply["tool_calls"]:
            query = " ".join(str(call.get("arguments", {}).get("query", "")).lower().split())
            if call["name"] == "search_places" and query in searched:  # 3a
                result = error(call, "duplicate_search", "you already ran this search")
            else:
                searched.add(query)
                result = handle_tool_call(call)
            messages.append({"role": "tool", **result})
    return {"answer": None, "steps": max_steps, "stop": "step_budget", "messages": messages}


if __name__ == "__main__":
    set_trace()
    max_steps = int(sys.argv[sys.argv.index("--max-steps") + 1]) if "--max-steps" in sys.argv else 6
    args = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()]
    question = args[0] if args else "Rainy Saturday in Florence with a 4-year-old: what can we do?"
    run = run_agent(question, max_steps=max_steps)
    flush_trace(run["messages"])
    print(f"\nstop={run['stop']} after {run['steps']} step(s), {len(run['messages'])} messages")
    print(run["answer"] or "(no answer: the step budget ran out)")
