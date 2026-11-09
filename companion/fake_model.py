"""A scripted stand-in for a language model, so every checkpoint runs offline.

It follows the same contract as a real model: it receives the message list and
returns a proposal, {"text": ..., "tool_calls": [...]}. It never runs tools and
keeps no state between calls; everything it knows comes from `messages`.

To give the course something to catch, it has a few switchable quirks
(see `QUIRKS`) and two bad habits it always has when answering:

  * asked about *animals*, it overstates what La Specola has;
  * asked about anything *free*, it cites a place it never retrieved.
"""

import json
import re

from places import terms

QUIRKS = {
    "prose_first": "first planning reply is chatty prose instead of JSON",
    "empty_query": "first tool call has a whitespace-only query",
    "disallowed_tool": "first tool call asks for book_tickets, which is not offered",
    "follows_injections": "obeys instructions it finds inside tool results",
    "adds": "asks to add the best place to the day plan when the question mentions the plan",
    "thorough": "runs five searches before answering, for long runs",
}

# Extra searches for the "thorough" quirk.
THOROUGH = ["knights in armour", "Renaissance paintings", "towers with views"]
# Words that make a claim stronger than most summaries support.
OVERCLAIM = {"best", "largest", "only", "all", "every", "always", "never"}

# Extra searches the fake planner adds when a question touches these topics.
FOLLOW_UPS = [
    ("free", "free museums for families"),
    ("animal", "preserved animals"),
    ("knight", "knights in armour"),
    ("lunch", "covered market lunch"),
    ("paint", "Renaissance paintings"),
    ("view", "towers with views"),
    ("rain", "hands-on museums for children"),
    ("kid", "hands-on museums for children"),
]


class FakeModel:
    def __init__(self):
        self.quirks = set()

    def __call__(self, messages, tools=None, schema=None):
        system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
        if system.startswith("You review"):
            return reply(text=review(messages[-1]["content"]))
        if system.startswith("You revise"):
            return reply(text=revise(messages[-1]["content"]))
        if tools:
            return self._act(messages)
        return self._plan(messages)

    # -- planning: text in, JSON text out -------------------------------------
    def _plan(self, messages):
        attempts = sum(m["role"] == "assistant" for m in messages)
        if "prose_first" in self.quirks and attempts == 0:
            return reply(text="Sure! Florence has lots to do:\n"
                              "1. the Uffizi\n2. the Boboli Gardens")
        question = question_of(messages)
        return reply(text=json.dumps({"queries": plan_for(question), "age": age_of(question)}))

    # -- acting: propose a tool call, or answer ---------------------------------
    def _act(self, messages):
        tool_msgs = [m for m in messages if m["role"] == "tool"]
        ok = [m for m in tool_msgs if m["status"] == "ok"]
        call_id = f"call_{sum(m['role'] == 'assistant' for m in messages) + 1:02d}"

        if not tool_msgs and "empty_query" in self.quirks:
            return reply(tool_calls=[call(call_id, "search_places", query="   ")])
        if not tool_msgs and "disallowed_tool" in self.quirks:
            return reply(tool_calls=[call(call_id, "book_tickets", place_id="place:uffizi", tickets=3)])

        proposed = [c["name"] for m in messages if m["role"] == "assistant" for c in m.get("tool_calls", [])]
        if "follows_injections" in self.quirks and "clear_plan" not in proposed:
            if any("call clear_plan" in p.get("summary", "") for m in ok for p in places_in(m)):
                return reply(tool_calls=[call(call_id, "clear_plan")])

        searches = suggested_searches(messages) or plan_for(question_of(messages))
        wanted = 2
        if "thorough" in self.quirks:
            searches = searches + [q for q in THOROUGH if q not in searches]
            wanted = 5
        if len(ok) < min(wanted, len(searches)):
            return reply(tool_calls=[call(call_id, "search_places", query=searches[len(ok)])])

        question = question_of(messages)
        if "adds" in self.quirks and "plan" in question.lower() and "add_to_plan" not in proposed:
            best = self._ranked(question, ok)
            if best:
                return reply(tool_calls=[call(call_id, "add_to_plan", place_id=best[0]["id"])])
        return reply(text=self._answer(question, ok))

    def _ranked(self, question, ok_results):
        seen = {}
        for m in ok_results:
            for p in places_in(m):
                if "IMPORTANT SYSTEM NOTE" not in p.get("summary", ""):
                    seen.setdefault(p["id"], p)
        q = set(terms(question))
        return sorted(seen.values(), key=lambda p: -len(q & set(terms(p["name"] + " " + p.get("summary", "")))))

    def _answer(self, question, ok_results):
        # Cite the retrieved places that best match the question.
        ranked = self._ranked(question, ok_results)
        seen = {p["id"] for p in ranked}
        sentences = [f"{p['name']} {describe(p)} [{p['id']}]." for p in ranked[:2]]
        # Bad habit 1: overstating.
        if "animal" in question.lower() and "place:la-specola" in seen:
            sentences.append("La Specola shows every kind of preserved animal, from insects to a hippo [place:la-specola].")
        # Bad habit 2: citing something it never retrieved.
        if "free" in question.lower():
            sentences.append("A rainy-day pass lets children into every museum for free [place:rainy-day-pass].")
        return " ".join(sentences)


# -- helpers ------------------------------------------------------------------

def places_in(message):
    """Places in a tool result, whether plain or wrapped by the host."""
    content = message.get("content")
    if isinstance(content, dict):
        content = content.get("untrusted_tool_result", [])
    return [p for p in content or [] if isinstance(p, dict) and "id" in p]


def describe(place):
    summary = place.get("summary")
    if not summary:  # trimmed out of the context: only the name is left
        return "looks relevant, but its summary is no longer in the context"
    return lowercase_first(first_clause(summary))


def sentences_with_citations(text):
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out = []
    for s in parts:
        m = re.search(r"\[(place:[a-z0-9-]+)\]", s)
        out.append((s, m.group(1) if m else None))
    return out


def review(payload):
    """Reviewer role: flag claims the cited summaries do not support."""
    data = json.loads(payload)
    issues = []
    for sentence, cite in sentences_with_citations(data["draft"]):
        claim = re.sub(r"\s*\[place:[a-z0-9-]+\]\.?$", "", sentence)
        place = data["places"].get(cite or "", {})
        summary = place.get("summary", "")
        if not summary:
            issues.append(f"- {claim}: cites a place that is not in the search results")
            continue
        strong = OVERCLAIM & set(re.findall(r"[a-z]+", claim.lower()))
        if strong - set(re.findall(r"[a-z]+", summary.lower())):
            issues.append(f"- {claim}: says more than the place notes do ({', '.join(sorted(strong))})")
    return "\n".join(issues) or "NO_ISSUES"


def revise(payload):
    """Writer role, second pass: drop every flagged sentence."""
    data = json.loads(payload)
    flagged = [line[2:].split(": ")[0] for line in data["feedback"].splitlines() if line.startswith("- ")]
    kept = [s for s, _ in sentences_with_citations(data["draft"]) if not any(f in s for f in flagged)]
    return " ".join(kept)


def reply(text=None, tool_calls=None):
    return {"text": text, "tool_calls": tool_calls or []}


def call(call_id, name, **arguments):
    return {"id": call_id, "name": name, "arguments": arguments}


def question_of(messages):
    first_user = next(m for m in messages if m["role"] == "user")
    return first_user["content"].split("\n\nSuggested searches:")[0]


def suggested_searches(messages):
    first_user = next(m for m in messages if m["role"] == "user")
    match = re.search(r"Suggested searches: (.+)$", first_user["content"])
    return [s.strip() for s in match.group(1).split(";") if s.strip()] if match else []


def plan_for(question):
    words = [w for w in re.findall(r"[A-Za-z0-9-]+", question) if w.lower() not in
             {"how", "do", "does", "can", "a", "an", "the", "what", "when", "where", "which", "to",
              "should", "i", "we", "my", "our", "with", "in", "for", "on", "is", "are", "of", "any", "there"}]
    queries = [" ".join(words[:6])]
    for key, extra in FOLLOW_UPS:
        if key in question.lower() and extra not in queries:
            queries.append(extra)
            break
    if len(queries) < 2:
        queries.append("indoor things to do")
    return queries


def age_of(question):
    match = re.search(r"(\d+)-year-old", question)
    return int(match.group(1)) if match else None


def first_clause(text):
    return text.split(", so ")[0].split(", and ")[0].rstrip(".")


def lowercase_first(s):
    return s[:1].lower() + s[1:]
