#!/usr/bin/env python3
"""Inventory source labels carrying footnote markers.

The production ingest retains source labels but not the footnote text those labels point
to. This script walks the exact observation-bearing CSV set, detects asterisk, dagger,
double-dagger, and superscript-number markers, and emits a deterministic source-read list.

Rows are grouped by source book, table, label, and marker. The separately reported
``(label, book)`` count deliberately collapses the one label/book pair that occurs in two
different tables; both tables remain in the read list because their footnote text may differ.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

from scripts.production.ingest import (
    CONFLICTS_DATASET,
    EXTENDED_DATASETS,
    PRIMARY_DATASETS,
    RECOVERY_DATASETS,
)


ROOT = Path(__file__).resolve().parents[2]
EXPECTED_LABEL_COUNT = 13
EXPECTED_LABEL_BOOK_PAIR_COUNT = 43
EXPECTED_READ_ROW_COUNT = 44

FIELDNAMES = (
    "source_code",
    "table_section",
    "original_label",
    "marker",
    "source_datasets",
    "source_rows",
    "fiscal_years",
    "pdf_pages",
    "printed_pages",
)

# A run of stars is one marker (so ``**`` is not silently collapsed to ``*``).
# Unicode daggers and superscript digits are checked even though the current corpus has none.
MARKER_RE = re.compile(r"\*+|[†‡]+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+")


def markers_in_label(label: str) -> tuple[str, ...]:
    """Return distinct marker tokens in source order."""
    return tuple(dict.fromkeys(MARKER_RE.findall(label)))


def dataset_paths(root: Path = ROOT) -> tuple[tuple[str, Path], ...]:
    blind = root / "audit" / "blind-extraction"
    recovered = root / "data" / "recovered"
    extended = root / "data" / "production" / "observations"
    paths = [
        (dataset, blind / f"{dataset}.csv")
        for dataset in (*PRIMARY_DATASETS, CONFLICTS_DATASET)
    ]
    paths.extend((dataset, recovered / f"{dataset}.csv") for dataset in RECOVERY_DATASETS)
    paths.extend((dataset, extended / f"{dataset}.csv") for dataset in EXTENDED_DATASETS)
    missing = [str(path) for _, path in paths if not path.exists()]
    if missing:
        raise ValueError(f"observation dataset inventory is incomplete: {missing}")
    return tuple(paths)


def inventory(root: Path = ROOT) -> tuple[list[dict[str, str]], int]:
    """Return the grouped source-read list and raw marked observation count."""
    grouped: dict[tuple[str, str, str, str], dict[str, set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    occurrence_count = 0

    for dataset, path in dataset_paths(root):
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for ordinal, row in enumerate(csv.DictReader(handle), start=1):
                label = (row.get("original_label") or "").strip()
                markers = markers_in_label(label)
                if not markers:
                    continue
                source_code = (row.get("source_code") or "").strip()
                table_section = (row.get("table_section") or "").strip()
                if not source_code or not table_section:
                    raise ValueError(
                        f"{dataset}:{ordinal}: marked label lacks source/table identity: {label!r}"
                    )
                occurrence_count += 1
                for marker in markers:
                    bucket = grouped[(source_code, table_section, label, marker)]
                    bucket["source_datasets"].add(dataset)
                    bucket["source_rows"].add(f"{dataset}:{ordinal}")
                    bucket["fiscal_years"].add((row.get("fiscal_year") or "").strip())
                    bucket["pdf_pages"].add((row.get("pdf_page") or "").strip())
                    bucket["printed_pages"].add((row.get("printed_page") or "").strip())

    rows: list[dict[str, str]] = []
    for (source_code, table_section, label, marker), values in sorted(grouped.items()):
        rows.append(
            {
                "source_code": source_code,
                "table_section": table_section,
                "original_label": label,
                "marker": marker,
                "source_datasets": ";".join(sorted(values["source_datasets"])),
                "source_rows": ";".join(sorted(values["source_rows"])),
                "fiscal_years": ";".join(sorted(values["fiscal_years"], key=int)),
                "pdf_pages": ";".join(sorted(values["pdf_pages"], key=int)),
                "printed_pages": ";".join(sorted(values["printed_pages"], key=int)),
            }
        )
    return rows, occurrence_count


def assert_settled_counts(rows: list[dict[str, str]]) -> None:
    labels = {row["original_label"] for row in rows}
    label_book_pairs = {(row["original_label"], row["source_code"]) for row in rows}
    actual = (len(labels), len(label_book_pairs), len(rows))
    expected = (
        EXPECTED_LABEL_COUNT,
        EXPECTED_LABEL_BOOK_PAIR_COUNT,
        EXPECTED_READ_ROW_COUNT,
    )
    if actual != expected:
        raise ValueError(
            "source-footnote inventory drift: "
            f"labels/pairs/read_rows={actual}, expected={expected}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-count-check",
        action="store_true",
        help="emit a changed inventory for diagnosis instead of failing on settled-count drift",
    )
    args = parser.parse_args()

    rows, occurrence_count = inventory()
    if not args.no_count_check:
        assert_settled_counts(rows)
    writer = csv.DictWriter(sys.stdout, fieldnames=FIELDNAMES, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    label_count = len({row["original_label"] for row in rows})
    pair_count = len({(row["original_label"], row["source_code"]) for row in rows})
    print(
        f"inventory: {occurrence_count} marked observations; {label_count} labels; "
        f"{pair_count} label/book pairs; {len(rows)} source-read rows",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
