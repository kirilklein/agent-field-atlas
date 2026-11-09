"""Reference solution: 4a and 4b on top of checkpoint 4. Lines marked # 4a/# 4b are new."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
"""Rainy-day trip planner · checkpoint 4 of 4: Evaluation

Replay a fixed set of questions through the agent and check every claim:
was the cited place actually retrieved, and does it support the claim?
Then check the judge itself against claims a person labelled.

Run:
    python checkpoint_4.py
"""
import json
import math
import re
import sys

from llm import call_model, set_trace, using_fake
from places import PLACES, search_places, terms

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


def run_agent(question, max_steps=6):
    messages = [AGENT, {"role": "user", "content": brief(question)}]
    for step in range(1, max_steps + 1):
        reply = call_model(messages, tools=[SEARCH_PLACES])
        messages.append({"role": "assistant", **reply})
        if not reply["tool_calls"]:
            return {"answer": reply["text"], "steps": step, "stop": "done", "messages": messages}
        for call in reply["tool_calls"]:
            result = handle_tool_call(call)
            messages.append({"role": "tool", **result})
    return {"answer": None, "steps": max_steps, "stop": "step_budget", "messages": messages}


# -- 4 · Evaluation -------------------------------------------------------------

CITATION = re.compile(r"\[(place:[a-z0-9-]+)\]")


def split_claims(answer):
    """One claim per sentence, with the first place citation in it (or None).
    'Claim one [place:a]. Claim two.' -> [{"text", "cites": "place:a"}, {"text", "cites": None}]"""
    claims = []
    # Split after . ! or ?, but not after abbreviations such as "e.g.".
    for sentence in re.split(r"(?<!e\.g\.)(?<!i\.e\.)(?<=[.!?])\s+", (answer or "").strip()):
        if not sentence.strip():
            continue
        cite = CITATION.search(sentence)
        text = CITATION.sub("", sentence).strip().rstrip(".").strip()
        claims.append({"text": text, "cites": cite.group(1) if cite else None})
    return claims


def retrieved_places(messages):
    return {p["id"]: p for m in messages
            if m["role"] == "tool" and m["status"] == "ok" for p in m["content"]}


def overlap_judge(claim, summary):
    """Offline stand-in judge: is most of the claim's vocabulary in the summary?
    Cheap and deterministic, and fooled by claims that reuse the right words."""
    claim_terms = set(terms(claim))
    strong = OVERCLAIM & set(re.findall(r"[a-z]+", claim.lower()))  # 4a
    if strong - set(re.findall(r"[a-z]+", summary.lower())):
        return False
    return len(claim_terms & set(terms(summary))) >= 0.5 * len(claim_terms)


OVERCLAIM = {"best", "largest", "only", "all", "every", "always", "never"}  # 4a


def cites_expected(claims, expect_any):  # 4b
    return any(c["cites"] in expect_any for c in claims)


def model_judge(claim, summary):
    reply = call_model([
        {"role": "system", "content": "You check citations. Answer SUPPORTED or "
                                      "UNSUPPORTED: does the summary support the claim?"},
        {"role": "user", "content": f"Claim: {claim}\n\nSummary: {summary}"},
    ])
    return reply["text"].strip().upper().startswith("SUPPORTED")


judge_supports = overlap_judge if using_fake() else model_judge


def score(answer, retrieved):
    verdicts = []
    for claim in answer["claims"]:
        if claim["cites"] is None:
            verdicts.append(("uncited", claim))
            continue
        place = retrieved.get(claim["cites"])
        if place is None:
            verdicts.append(("fabricated", claim))
            continue
        ok = judge_supports(claim["text"], place["name"] + ". " + place["summary"])
        verdicts.append(("supported" if ok else "unsupported", claim))
    supported = sum(v == "supported" for v, _ in verdicts)
    return supported / max(1, len(verdicts)), verdicts


def wilson(k, n, z=1.96):
    """95% interval for a proportion k/n that behaves well for small n."""
    if n == 0:
        return 0.0, 1.0
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def evaluate(replay_path="replay_set.jsonl"):
    print("replay")
    total = supported = 0
    failures = []
    for item in load_jsonl(replay_path):
        run = run_agent(item["question"])
        claims = split_claims(run["answer"])
        _, verdicts = score({"claims": claims}, retrieved_places(run["messages"]))
        ok = sum(v == "supported" for v, _ in verdicts)
        total += len(verdicts)
        supported += ok
        missing = "" if cites_expected(claims, item["expect_any"]) else "   ✗ no expected place cited"  # 4b
        print(f"  {item['id']}  {ok}/{len(verdicts)} supported   steps={run['steps']} stop={run['stop']}{missing}")
        failures += [(item["id"], v, c) for v, c in verdicts if v != "supported"]

    lo, hi = wilson(supported, total)
    print(f"\ncitation support  {supported}/{total} = {supported / total:.0%}"
          f"   95% interval {lo:.0%}-{hi:.0%}")
    for qid, verdict, claim in failures:
        print(f"  ✗ {qid} {verdict:<11} {claim['text']!r} [{claim['cites']}]")
    return supported, total


def check_judge(labels_path="judge_labels.jsonl"):
    """How often does the judge agree with a person? Run this before trusting it."""
    labels = load_jsonl(labels_path)
    agree = 0
    misses = []
    for item in labels:
        place = next(p for p in PLACES if p["id"] == item["place"])
        says = judge_supports(item["claim"], place["name"] + ". " + place["summary"])
        if says == item["supported"]:
            agree += 1
        else:
            misses.append((item, says))
    lo, hi = wilson(agree, len(labels))
    print(f"\njudge vs person   {agree}/{len(labels)} agree"
          f"   95% interval {lo:.0%}-{hi:.0%}")
    for item, says in misses:
        verdict = "supported" if says else "unsupported"
        print(f"  ✗ judge said {verdict}, person said {'supported' if item['supported'] else 'unsupported'}:"
              f" {item['claim']!r}")


if __name__ == "__main__":
    set_trace("--trace" in sys.argv)
    print("judge:", "word-overlap stand-in (offline)" if using_fake() else "model judge", "\n")
    evaluate()
    check_judge()
