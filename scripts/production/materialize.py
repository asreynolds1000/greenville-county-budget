#!/usr/bin/env python3
"""Materialize the read-only artifacts consumers use.

Everything here is generated from the build database and never hand-edited:
a portable SQLite file, per-year whole-budget JSON trees, a data dictionary,
and a corrections log.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from scripts.production.schema import TABLES

_ADOPTED = "adopted"
_MEASURE = "dollars"


def _canonical_value(conn, entity_id: str, fy: int) -> int | None:
    row = conn.execute(
        "SELECT value FROM canonical_value WHERE entity_id=? AND fiscal_year=? "
        "AND status_class=? AND measure_type=?", (entity_id, fy, _ADOPTED, _MEASURE)
    ).fetchone()
    return row[0] if row else None


def _children(conn, parent: str, fy: int) -> list[str]:
    rows = conn.execute(
        "SELECT child_entity_id FROM hierarchy_edge WHERE parent_entity_id=? "
        "AND relationship='contains' "
        "AND (effective_from_fy IS NULL OR ?>=effective_from_fy) "
        "AND (effective_to_fy IS NULL OR ?<=effective_to_fy)", (parent, fy, fy)
    ).fetchall()
    return [r[0] for r in rows]


def _related_views(conn, parent: str, fy: int) -> list[tuple[str, str, str | None]]:
    return conn.execute(
        "SELECT child_entity_id, relationship, edge_note FROM hierarchy_edge "
        "WHERE parent_entity_id=? AND relationship<>'contains' "
        "AND (effective_from_fy IS NULL OR ?>=effective_from_fy) "
        "AND (effective_to_fy IS NULL OR ?<=effective_to_fy)", (parent, fy, fy)
    ).fetchall()


def _node(conn, entity_id: str, fy: int, names: dict[str, str], seen: frozenset = frozenset()) -> dict:
    if entity_id in seen:
        return {"entity_id": entity_id, "name": names.get(entity_id, entity_id),
                "value": None, "children": [], "related_views": [], "note": "cycle detected"}
    seen = seen | {entity_id}
    return {
        "entity_id": entity_id,
        "name": names.get(entity_id, entity_id),
        "value": _canonical_value(conn, entity_id, fy),
        "children": [_node(conn, c, fy, names, seen) for c in _children(conn, entity_id, fy)],
        "related_views": [
            {
                "relationship": relationship,
                "note": note,
                "root": _node(conn, child, fy, names, seen),
            }
            for child, relationship, note in _related_views(conn, entity_id, fy)
        ],
    }


def _write_bundles(conn, dist_dir: Path) -> list[Path]:
    bundles_dir = dist_dir / "bundles"
    bundles_dir.mkdir(parents=True, exist_ok=True)
    for stale in bundles_dir.glob("whole-budget-*.json"):
        stale.unlink()  # a year that leaves canonical must not linger in dist
    names = {r[0]: r[1] for r in conn.execute("SELECT entity_id, canonical_name FROM entity")}
    years = [r[0] for r in conn.execute(
        "SELECT DISTINCT fiscal_year FROM canonical_value WHERE entity_id='budget.total' "
        "AND status_class=? ORDER BY fiscal_year", (_ADOPTED,))]
    written = []
    for fy in years:
        tree = {
            "fiscal_year": fy,
            "status_class": _ADOPTED,
            "root": _node(conn, "budget.total", fy, names),
        }
        path = bundles_dir / f"whole-budget-{fy}.json"
        path.write_text(json.dumps(tree, indent=2), encoding="utf-8")
        written.append(path)
    return written


def _write_data_dictionary(conn, dist_dir: Path) -> Path:
    lines = [
        "# Greenville County Budget Explorer data dictionary",
        "",
        "Generated from the production build database. Do not edit by hand.",
        "",
        "## Selection policy",
        "",
        "Within a status class, when official books disagree on the same entity and",
        "fiscal year, the value from the latest-published book wins; beaten distinct",
        "values are retained in `canonical_alternative`. Ties at the top publication",
        "order are marked `disputed` with a null value. Agreement from a different",
        "source book is recorded as corroboration, not conflict.",
        "",
        "## Status classes",
        "",
    ]
    for sc, grp, label in conn.execute(
        "SELECT status_class, is_comparable_group, display_label FROM status_class ORDER BY status_class"
    ):
        lines.append(f"- `{sc}` ({label}); comparability group `{grp}`")
    lines += [
        "",
        "Status classes are never summed or trended together. `BUDGET`, `ADOPTED",
        "BUDGET`, and `APPROVED BUDGET` all denote a book's enacted figures and fold",
        "to `adopted`.",
        "",
        "## Corrections",
        "",
        "Observations are append-only. A correction adds a new observation plus a",
        "`correction_log` entry; the superseded row is retained, never edited. Because",
        "value is not part of observation identity, a re-extracted correction from the",
        "same book is surfaced by the selection policy rather than silently replaced.",
        "",
        "## Tables",
        "",
    ]
    for table in TABLES:
        lines.append(f"### `{table}`")
        lines.append("")
        for cid, name, ctype, *_ in conn.execute(f"PRAGMA table_info({table})"):
            lines.append(f"- `{name}` {ctype or 'TEXT'}")
        lines.append("")
    path = dist_dir / "data-dictionary.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def _write_corrections_log(conn, dist_dir: Path) -> Path:
    rows = conn.execute(
        "SELECT correction_id, superseded_observation_id, replacement_observation_id, reason, corrected_at "
        "FROM correction_log ORDER BY correction_id"
    ).fetchall()
    lines = ["# Corrections log", ""]
    if not rows:
        lines.append("No corrections recorded.")
    else:
        for cid, sup, rep, reason, when in rows:
            lines.append(f"- #{cid} ({when}): {sup} -> {rep}. {reason}")
    path = dist_dir / "corrections-log.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def materialize(conn, dist_dir: Path) -> list[Path]:
    dist_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    db_path = dist_dir / "gc_budget.sqlite"
    if db_path.exists():
        db_path.unlink()
    dest = sqlite3.connect(db_path)
    conn.backup(dest)
    dest.close()
    written.append(db_path)

    written.extend(_write_bundles(conn, dist_dir))
    written.append(_write_data_dictionary(conn, dist_dir))
    written.append(_write_corrections_log(conn, dist_dir))
    return written
