"""The Claude adapter: neutral messages in, a neutral reply out.

    pip install anthropic
    export ANTHROPIC_API_KEY=...
    ATLAS_MODEL=claude python checkpoint_3.py
"""

import json
import os
import re


def call_claude(messages, tools, schema):
    import anthropic

    system, convo = _to_claude(messages)
    if schema:
        system += "\n\nReply with JSON only, matching this JSON schema:\n" + json.dumps(schema)
    kwargs = {
        "model": os.environ.get("ATLAS_CLAUDE_MODEL", "claude-sonnet-5-5"),
        "max_tokens": 4096,
        "system": system,
        "messages": convo,
    }
    if tools:
        kwargs["tools"] = tools
    response = anthropic.Anthropic().messages.create(**kwargs)
    text = "".join(b.text for b in response.content if b.type == "text") or None
    if schema and text:
        text = _strip_fences(text)
    calls = [{"id": b.id, "name": b.name, "arguments": b.input}
             for b in response.content if b.type == "tool_use"]
    # Keep the raw blocks (including any thinking blocks) to send back unchanged.
    raw = [b.model_dump(exclude_none=True) for b in response.content]
    return {"text": text, "tool_calls": calls, "_raw": raw}


def _strip_fences(text):
    """Models often wrap JSON in ```json fences even when asked not to."""
    match = re.match(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", text, re.S)
    return match.group(1) if match else text


def _to_claude(messages):
    """Neutral messages -> (system prompt, Claude messages)."""
    system, out = [], []
    for m in messages:
        role = m["role"]
        if role == "system":
            system.append(m["content"])
        elif role == "user":
            out.append({"role": "user", "content": m["content"]})
        elif role == "assistant":
            blocks = m.get("_raw")
            if not blocks:
                text = m.get("text") or m.get("content")
                blocks = ([{"type": "text", "text": text}] if text else []) + [
                    {"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["arguments"]}
                    for c in m.get("tool_calls", [])
                ]
            out.append({"role": "assistant", "content": blocks})
        elif role == "tool":
            ok = m["status"] == "ok"
            block = {
                "type": "tool_result",
                "tool_use_id": m["tool_call_id"],
                "content": json.dumps(m["content"] if ok else m["error"]),
            }
            if not ok:
                block["is_error"] = True
            # All results for one assistant turn go in a single user message.
            prev = out[-1] if out else None
            if prev and prev["role"] == "user" and isinstance(prev["content"], list):
                prev["content"].append(block)
            else:
                out.append({"role": "user", "content": [block]})
    return "\n\n".join(system), out
