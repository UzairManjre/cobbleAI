"""Export anonymised research logs for consenting users (see app/services/research_export.py).

Usage (from backend/):
    set RESEARCH_EXPORT_SALT=<a long secret, kept outside the export>
    python -m scripts.export_research_logs --out exports/pilot_2026_10
    python -m scripts.export_research_logs --out exports/s4 --course <course_id> --since 2026-09-01

Keep the same salt across exports of one study so participant codes line up; never share it.
"""

import argparse
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.db import connect_to_mongo
from app.services.research_export import export_research_logs


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--course", type=uuid.UUID)
    parser.add_argument("--since", help="ISO date, e.g. 2026-09-01")
    args = parser.parse_args()

    salt = os.environ.get("RESEARCH_EXPORT_SALT", "")
    since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc) if args.since else None
    await connect_to_mongo()
    manifest = await export_research_logs(args.out, salt, course_id=args.course, since=since)
    print(f"Exported to {args.out}: " + ", ".join(f"{k}={v}" for k, v in manifest["counts"].items()))


if __name__ == "__main__":
    asyncio.run(main())
