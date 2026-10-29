import math
from typing import Any

from fastapi.responses import JSONResponse


def add_id_aliases(content: Any) -> Any:
    """Beanie documents serialise their primary key as `_id`; the frontend reads `id`.
    Add `id` wherever only `_id` is present, keeping `_id` for existing callers.
    Non-finite floats (an undefined statistic) become null instead of failing the response."""
    if isinstance(content, float) and not math.isfinite(content):
        return None
    if isinstance(content, dict):
        out = {k: add_id_aliases(v) for k, v in content.items()}
        if "_id" in out and "id" not in out:
            out["id"] = out["_id"]
        return out
    if isinstance(content, list):
        return [add_id_aliases(v) for v in content]
    return content


class CobbleJSONResponse(JSONResponse):
    def render(self, content: Any) -> bytes:
        return super().render(add_id_aliases(content))
