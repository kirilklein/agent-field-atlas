"""Rainy-day trip planner · branch C: Multi-agent

A reviewer is a second call to the same model with a different job, less
context and no tools: it reads the draft and the place notes it cites, and flags
claims they do not support. The writer then revises once.

Then both setups answer the same replay questions, and we compare them
question by question on citation support, model calls and tokens sent.

Run:
    python branch_multi_agent.py
"""
import json

from checkpoint_3 import run_agent
from checkpoint_4 import load_jsonl, retrieved_places, score, split_claims
from compare import paired
from llm import call_model

REVIEWER = {"role": "system", "content":
            "You review a draft answer against the places it cites. For each claim the "
            "cited summary does not support, write one line: '- <claim>: <reason>'. "
            "If every claim is supported, reply NO_ISSUES."}
REVISER = {"role": "system", "content":
           "You revise a draft answer. Remove or soften every flagged claim and keep "
           "one [place:...] citation per sentence."}


def tokens(messages):
    return len(json.dumps(messages)) // 4


def agent_cost(run):
    """Model calls and tokens sent by run_agent: the planner call plus one call per step,
    each resending the messages that existed at that point."""
    msgs = run["messages"]
    starts = [i for i, m in enumerate(msgs) if m["role"] == "assistant"]
    return 1 + len(starts), sum(tokens(msgs[:i]) for i in starts) + 60


def answer_with_review(question):
    run = run_agent(question)
    calls, sent = agent_cost(run)
    retrieved = retrieved_places(run["messages"])
    cited = {c["cites"]: {"name": retrieved[c["cites"]]["name"], "summary": retrieved[c["cites"]]["summary"]}
             for c in split_claims(run["answer"]) if c["cites"] in retrieved}

    review = [REVIEWER, {"role": "user", "content": json.dumps({"draft": run["answer"], "places": cited})}]
    feedback = call_model(review)["text"]
    calls, sent = calls + 1, sent + tokens(review)
    if feedback.strip() == "NO_ISSUES":
        return run["answer"], retrieved, calls, sent, feedback

    revision = [REVISER, {"role": "user", "content": json.dumps({"draft": run["answer"], "feedback": feedback})}]
    revised = call_model(revision)["text"]
    return revised, retrieved, calls + 1, sent + tokens(revision), feedback


def supported_share(answer, retrieved):
    claims = split_claims(answer)
    _, verdicts = score({"claims": claims}, retrieved)
    ok = sum(v == "supported" for v, _ in verdicts)
    return ok, len(verdicts)


if __name__ == "__main__":
    rows = []
    for item in load_jsonl("replay_set.jsonl"):
        single = run_agent(item["question"])
        s_calls, s_sent = agent_cost(single)
        s_ok, s_n = supported_share(single["answer"], retrieved_places(single["messages"]))

        answer, retrieved, r_calls, r_sent, feedback = answer_with_review(item["question"])
        r_ok, r_n = supported_share(answer, retrieved)
        rows.append((item["id"], s_ok / s_n, r_ok / r_n, s_calls, r_calls, s_sent, r_sent))
        print(f"{item['id']}  one: {s_ok}/{s_n} supported, {s_calls} calls, ~{s_sent:,} tokens"
              f"   + reviewer: {r_ok}/{r_n}, {r_calls} calls, ~{r_sent:,} tokens")
        if feedback.strip() != "NO_ISSUES":
            for line in feedback.splitlines():
                print("      reviewer", line)

    print()
    for name, i, j, fmt in [("citation support", 1, 2, "{:+.0%}"), ("model calls", 3, 4, "{:+.1f}"),
                            ("tokens sent", 5, 6, "{:+,.0f}")]:
        mean, (lo, hi), needed = paired([r[j] - r[i] for r in rows])
        verdict = "can't tell yet" if lo <= 0 <= hi else "real difference"
        print(f"{name:<17} mean {fmt.format(mean)}   95% interval {fmt.format(lo)} to {fmt.format(hi)}   → {verdict}")
    print("\nThe judge here is checkpoint 4's word-overlap stand-in. When the reviewer removes a claim")
    print("the judge wrongly passed, this measurement cannot see the gain. Improve the judge")
    print("(exercise 4a) and run this again.")
