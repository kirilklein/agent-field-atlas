"""The one place that talks to a model.

    call_model(messages, tools=None, schema=None) -> {"text": str | None, "tool_calls": [...]}

Messages use a small provider-neutral format:
    {"role": "system" | "user", "content": str}
    {"role": "assistant", "text": str | None, "tool_calls": [{"id", "name", "arguments"}]}
    {"role": "tool", "tool_call_id": str, "status": "ok" | "error", "content" | "error": ...}

By default the scripted FakeModel answers, so nothing needs a key.
ATLAS_MODEL=claude switches to Claude (see claude_model.py).
"""

import os

from claude_model import call_claude
from fake_model import FakeModel
from tracing import flush_trace, set_trace, show_reply

_fake = FakeModel()


def using_fake():
    return os.environ.get("ATLAS_MODEL", "fake") != "claude"


def set_quirks(quirks):
    """Switch on FakeModel quirks (ignored when a real model is in use)."""
    _fake.quirks = set(quirks)


def call_model(messages, tools=None, schema=None):
    flush_trace(messages)
    reply = _fake(messages, tools, schema) if using_fake() else call_claude(messages, tools, schema)
    show_reply(reply)
    return reply
