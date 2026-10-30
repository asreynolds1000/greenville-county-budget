#!/usr/bin/env python3
"""Label normalization and candidate clustering for the crosswalk.

Full-depth curation across 25 years of OCR-drifted budget books is the dominant
manual cost. These helpers do the tedious grouping so a human only has to
confirm, edit, split, or merge candidate clusters. ``normalize_label`` produces
a grouping key only; it never mutates the stored ``original_label``.
"""

from __future__ import annotations

import re

_NON_ALNUM = re.compile(r"[^a-z0-9]")

# Rough entity-type hint per source dataset; a human reassigns as needed.
_DATASET_ENTITY_TYPE = {
    "whole-budget-major-funds": "fund_type",
    "general-fund-operating-categories-and-transfers": "operating_category",
    "general-fund-department-appropriations": "department",
    "named-special-revenue-funds": "fund",
    "general-fund-broad-revenues": "revenue_category",
    "general-fund-other-revenue-detail": "revenue_source",
    "general-fund-balances-and-financing": "balance_line",
    "general-fund-audited-results": "balance_line",
    "general-fund-transfer-in-detail": "financing_source",
    "official-document-conflicts": "conflict",
}

_TYPE_PREFIX = {
    "fund_type": "fundtype",
    "operating_category": "opcat",
    "department": "dept",
    "fund": "fund",
    "revenue_category": "rev",
    "balance_line": "bal",
    "financing_source": "fin",
    "conflict": "conflict",
}


def normalize_label(label: str) -> str:
    """Return a comparison key: casefolded, alphanumerics only.

    Collapses spurious OCR letter-splits (``"COUNTY A DMINISTRA TOR"`` and
    ``"County Administrator"`` share a key) and strips source asterisks and
    punctuation, while keeping genuinely different words distinct.
    """
    return _NON_ALNUM.sub("", label.strip().casefold())


def cluster_labels(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Group observation rows into candidate entities and candidate label maps.

    Every returned row is a ``machine_candidate`` for human review; nothing here
    becomes a confirmed mapping.
    """
    clusters: dict[tuple[str, str], dict[str, int]] = {}
    for r in rows:
        etype = _DATASET_ENTITY_TYPE.get(r.get("source_dataset"), "unknown")
        label = r["original_label"]
        key = normalize_label(label)
        counts = clusters.setdefault((etype, key), {})
        counts[label] = counts.get(label, 0) + 1

    entities: list[dict] = []
    label_maps: list[dict] = []
    for (etype, key), counts in clusters.items():
        if not key:
            continue
        prefix = _TYPE_PREFIX.get(etype, etype)
        entity_id = f"{prefix}.{key}"
        representative = max(counts.items(), key=lambda kv: kv[1])[0]
        entities.append({
            "entity_id": entity_id,
            "entity_type": etype,
            "canonical_name": representative,
            "review_status": "machine_candidate",
        })
        for label in counts:
            label_maps.append({
                "original_label": label,
                "match_scope": "label",
                "entity_id": entity_id,
                "review_status": "machine_candidate",
            })
    return entities, label_maps
