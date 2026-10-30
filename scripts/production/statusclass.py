#!/usr/bin/env python3
"""Map raw source status strings to normalized, never-blended status classes.

The mapping is data-driven from ``data/production/status_class.csv``. Enacted
budget-book header variants (``BUDGET``, ``ADOPTED BUDGET``, ``APPROVED BUDGET``)
all fold to ``adopted`` so a single enacted series is not fragmented by
edition-to-edition header drift. Actual, proposed, projected, estimated, and
financing stay distinct and must never be summed or trended together silently.
"""

from __future__ import annotations

import csv
from pathlib import Path

_CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "production" / "status_class.csv"


def load_status_class_csv(path: Path | None = None) -> list[dict]:
    """Return the raw rows of the status-class vocabulary CSV."""
    p = path or _CSV_PATH
    with p.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _build_map(rows: list[dict]) -> dict[str, str]:
    return {r["raw_status"]: r["status_class"] for r in rows}


_RAW_TO_CLASS = _build_map(load_status_class_csv())


def status_class_for(raw_status: str) -> str:
    """Return the normalized status class for a raw source status.

    Raises ``KeyError`` for any status not present in the vocabulary so an
    unexpected source status halts ingest rather than being silently misclassed.
    """
    return _RAW_TO_CLASS[raw_status]


def distinct_classes(path: Path | None = None) -> list[dict]:
    """Return one row per status_class with its comparability group and label."""
    seen: dict[str, dict] = {}
    for r in load_status_class_csv(path):
        seen.setdefault(r["status_class"], {
            "status_class": r["status_class"],
            "is_comparable_group": r["is_comparable_group"],
            "display_label": r["display_label"],
        })
    return list(seen.values())
