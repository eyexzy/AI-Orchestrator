"""Token-budget helpers for LLM context assembly.

The project uses provider-side tokenizers we do not have locally for every
model, so these helpers intentionally use the same conservative character
estimate everywhere. The important invariant is centralized budgeting: context
is trimmed by tokens, newest chat messages are preferred, and stored source
content is not destroyed when runtime context is reduced.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol


class MessageLike(Protocol):
    role: str
    content: str


def estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def clamp_text_to_token_budget(
    text: str,
    max_tokens: int,
    *,
    marker: str = "\n\n[Truncated to fit the context budget.]",
) -> str:
    clean = (text or "").strip()
    if not clean or max_tokens <= 0:
        return ""
    if estimate_tokens(clean) <= max_tokens:
        return clean

    marker_tokens = estimate_tokens(marker)
    content_tokens = max(1, max_tokens - marker_tokens)
    char_budget = max(1, content_tokens * 4)
    return clean[:char_budget].rstrip() + marker


def _message_role(message: MessageLike | dict) -> str:
    if isinstance(message, dict):
        return str(message.get("role", ""))
    return str(getattr(message, "role", ""))


def _message_content(message: MessageLike | dict) -> str:
    if isinstance(message, dict):
        return str(message.get("content", ""))
    return str(getattr(message, "content", ""))


@dataclass(frozen=True)
class BudgetedMessage:
    role: str
    content: str
    tokens: int


def select_recent_messages_by_token_budget(
    messages: Iterable[MessageLike | dict],
    *,
    max_tokens: int,
    max_messages: int,
) -> list[BudgetedMessage]:
    """Return newest messages that fit the token budget, in chronological order."""
    if max_tokens <= 0 or max_messages <= 0:
        return []

    candidates: list[tuple[str, str]] = []
    for message in messages:
        role = _message_role(message)
        content = _message_content(message).strip()
        if role not in {"user", "assistant"} or not content:
            continue
        candidates.append((role, content))

    selected: list[BudgetedMessage] = []
    used = 0

    for role, content in reversed(candidates[-max_messages:]):
        message_tokens = estimate_tokens(content) + 4
        remaining = max_tokens - used
        if remaining <= 0:
            break

        if message_tokens > remaining:
            content = clamp_text_to_token_budget(
                content,
                max(1, remaining - 4),
                marker="\n\n[Older message trimmed to fit context budget.]",
            )
            if not content:
                continue
            message_tokens = estimate_tokens(content) + 4

        selected.append(BudgetedMessage(role=role, content=content, tokens=message_tokens))
        used += message_tokens

    return list(reversed(selected))


def fit_blocks_by_token_budget(
    blocks: Iterable[tuple[str, str]],
    *,
    max_tokens: int,
    omitted_label: str = "additional context",
) -> tuple[list[str], int, int]:
    """Fit labeled text blocks into a shared budget.

    Returns (formatted_blocks, used_tokens, omitted_count).
    """
    if max_tokens <= 0:
        return [], 0, sum(1 for _ in blocks)

    output: list[str] = []
    used = 0
    omitted = 0

    for label, text in blocks:
        header = f"--- {label} ---"
        header_tokens = estimate_tokens(header) + 2
        remaining = max_tokens - used - header_tokens
        if remaining <= 0:
            omitted += 1
            continue

        body = clamp_text_to_token_budget(
            text,
            remaining,
            marker=f"\n\n[The rest of this {omitted_label} is stored but omitted from this request to fit the context budget.]",
        )
        if not body:
            omitted += 1
            continue

        block = f"{header}\n{body}"
        output.append(block)
        used += estimate_tokens(block) + 2

    return output, used, omitted
