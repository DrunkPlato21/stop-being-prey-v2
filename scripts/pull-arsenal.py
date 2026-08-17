"""Pull the canonical move taxonomy from one-shot-db into the site.

The Rhetorical Moves Library (via one-shot-db's `moves` table) is canon;
this site only ever displays a snapshot. Run after coining a new move:

    python scripts/pull-arsenal.py

Writes src/lib/arsenal-moves.json (checked in). Never invents or edits
a move; naming moves is Clay's call and happens upstream.
"""

import json
import os
import sqlite3
import sys

DB = os.path.join(os.path.dirname(__file__), "..", "..", "one-shot-db", "oneshot.db")
OUT = os.path.join(
    os.path.dirname(__file__), "..", "src", "lib", "arsenal-moves.json"
)

if not os.path.exists(DB):
    print(f"one-shot-db not found at {DB}", file=sys.stderr)
    sys.exit(1)

db = sqlite3.connect(DB)
db.row_factory = sqlite3.Row
rows = db.execute(
    "SELECT slug, name, default_role, definition, mechanism, counter_move,"
    "       status, source"
    "  FROM moves ORDER BY default_role, name"
).fetchall()

moves = [
    {
        "slug": r["slug"],
        "name": r["name"],
        "role": r["default_role"],  # "opponent" | "clay"
        "definition": r["definition"] or "",
        "mechanism": r["mechanism"] or "",
        "counterMove": r["counter_move"] or "",
        "status": r["status"] or "",
        "source": r["source"] or "",
    }
    for r in rows
]

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    json.dump(moves, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"wrote {len(moves)} moves -> {os.path.relpath(OUT)}")
