import re
from typing import Tuple

_THOUGHT_RE = re.compile(r"<thought>(.*?)(?:</thought>|$)", re.DOTALL)


def split_thinking(text: str) -> Tuple[str, str]:
    """Separate LLMAdapter `<thought>...</thought>` blocks from the visible answer.

    Returns (answer, thinking). An unterminated block (stream cut short) is
    treated as thinking up to the end of the text.
    """
    if not text:
        return "", ""
    thoughts = [m.strip() for m in _THOUGHT_RE.findall(text)]
    answer = _THOUGHT_RE.sub("", text).strip()
    return answer, "\n\n".join(t for t in thoughts if t)
