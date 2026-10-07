"""`python -m app.openapi_export [path]` writes the app's OpenAPI document (used by the agent's G7)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.main import create_app


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    schema = create_app().openapi()
    target.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
