"""Reference solution: 2a and 2b on top of checkpoint 2. Lines marked # 2a/# 2b are new."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Rainy-day trip planner · checkpoint 2 of 4: Tool calling

Give the model a search_places tool. The model proposes a call; the host
validates it and only then runs the tool.

Run:
    python checkpoint_2.py                        # a valid search
    python checkpoint_2.py --scenario empty       # whitespace-only query
    python checkpoint_2.py --scenario disallowed  # a tool that does not exist
"""
import json
import sys

from llm import call_model, set_quirks, set_trace
from places import search_places, terms

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
        "properties": {"query": {"type": "string", "maxLength": 200},
                       "age": {"type": "integer", "minimum": 0, "maximum": 17}},  # 2a
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
    if not terms(query):  # 2b
        return error(call, "invalid_arguments",
            "query has no searchable words")
    age = args.get("age")  # 2a
    if age is not None and (not isinstance(age, int) or isinstance(age, bool)
                            or not 0 <= age <= 17):
        return error(call, "invalid_arguments",
            "age must be a whole number from 0 to 17")

    places = ALLOWED_TOOLS[name](query.strip(), limit=3)
    if age is not None:  # 2a
        places = [p for p in places if p["min_age"] <= age]
    return {"tool_call_id": call["id"],
            "status": "ok", "content": places}

def error(call, code, msg):
    return {"tool_call_id": call["id"],
            "status": "error",
            "error": {"code": code, "message": msg}}


if __name__ == "__main__":
    set_trace()
    scenario = sys.argv[sys.argv.index("--scenario") + 1] if "--scenario" in sys.argv else "valid"
    set_quirks({"valid": set(), "empty": {"empty_query"},
                "disallowed": {"disallowed_tool"}}[scenario])
    question = "Rainy Saturday in Florence with a 4-year-old: what can we do?"
    messages = [
        {"role": "system", "content": "You help families plan a day out in Florence. Use search_places."},
        {"role": "user", "content": question + "\n\nSuggested searches: "
                                    + "; ".join(plan_queries(question))},
    ]
    reply = call_model(messages, tools=[SEARCH_PLACES])
    for call in reply["tool_calls"]:
        result = handle_tool_call(call)
        if result["status"] == "ok":
            print(f"  tool  ▸ ran, {len(result['content'])} places:")
            for place in result["content"]:
                print(f"            {place['id']}  {place['name']}")
        else:
            print(f"  tool  ▸ never ran. The model receives:")
            print("           ", json.dumps(result))
