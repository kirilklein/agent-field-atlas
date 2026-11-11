"""Prints what the model receives and proposes. Off until set_trace() is called."""

import json

_trace = False
_shown = []  # tool messages already printed


def set_trace(on=True):
    """Print what the model receives and proposes on every call."""
    global _trace
    _trace = on


def flush_trace(messages):
    """Print tool results the model has not been shown yet (e.g. after the last step)."""
    if not _trace:
        return
    for m in messages:
        if m["role"] != "tool" or any(m is s for s in _shown):
            continue
        _shown.append(m)
        content = m.get("content")
        label = "ok"
        if isinstance(content, dict) and "untrusted_tool_result" in content:
            content, label = content["untrusted_tool_result"], "ok, marked untrusted"
        if m["status"] == "ok" and isinstance(content, list):
            ids = ", ".join(p["id"] for p in content) or "no matches"
            print(f"  host  ▸ {m['tool_call_id']} {label}: {ids}")
        elif m["status"] == "ok":
            print(f"  host  ▸ {m['tool_call_id']} ok: {json.dumps(m['content'])}")
        else:
            print(f"  host  ▸ {m['tool_call_id']} rejected: {m['error']['code']} ({m['error']['message']})")


def show_reply(reply):
    if not _trace:
        return
    for c in reply["tool_calls"]:
        args = ", ".join(f"{k}={v!r}" for k, v in c["arguments"].items())
        print(f"  model ▸ {c['id']} proposes {c['name']}({args})")
    if reply["text"] and not reply["tool_calls"]:
        text = reply["text"] if len(reply["text"]) < 90 else reply["text"][:87] + "…"
        print(f"  model ▸ replies: {text!r}")
