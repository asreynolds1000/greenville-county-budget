#!/usr/bin/env python3
"""Ingest source-first extraction rows into the observation store.

Every printed row in every extraction CSV becomes exactly one observation,
identified by ``(source_dataset, source_row_ordinal)``. Identity never depends
on the value, so two distinct printed lines that happen to share a value are
never silently merged, and re-importing a frozen file is idempotent.
"""

from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from scripts.production.statusclass import status_class_for

# The primary extraction files, in a stable ingest order.
PRIMARY_DATASETS: tuple[str, ...] = (
    "whole-budget-major-funds",
    "general-fund-operating-categories-and-transfers",
    "general-fund-department-appropriations",
    "named-special-revenue-funds",
    "general-fund-broad-revenues",
    "general-fund-other-revenue-detail",
    "general-fund-balances-and-financing",
    "general-fund-audited-results",
    "general-fund-transfer-in-detail",
)

CONFLICTS_DATASET = "official-document-conflicts"

# Datasets recovered from image-only source tables (e.g. via vision transcription),
# kept distinct from the frozen blind extraction but ingested as observations.
RECOVERY_DATASETS: tuple[str, ...] = (
    "fy2022-2023-general-fund-appropriations",
)

# Observations extracted after the blind extraction was frozen, covering years it does not
# reach. Kept in their own directory and counted separately so `primary_count` still
# describes the frozen extraction alone, and so the frozen files are never edited.
EXTENDED_DATASETS: tuple[str, ...] = (
    "general-fund-audited-series-extension",
    "general-fund-balance-composition",
    "special-revenue-summary",
    "debt-service-summary",
    "enterprise-summary",
)

# Natural-key columns identifying one printed value at one place in one document.
_NATURAL_KEY = (
    "source_code", "pdf_page", "table_section",
    "original_label", "fiscal_year", "status", "value",
)

_OBSERVATION_COLUMNS = (
    "observation_id", "fiscal_year", "value", "printed_form",
    "printed_form_review_status", "measure_type", "status",
    "status_class", "original_label", "table_section", "raw_fund_type",
    "raw_operating_category", "included_in_reported_total_budget", "source_code",
    "document_title_version", "source_url", "pdf_page", "printed_page",
    "ambiguity_flag", "notes", "treatment_note", "conflict_group",
    "conflict_note", "source_dataset", "source_row_ordinal",
)


@dataclass
class IngestReport:
    primary_count: int = 0
    conflict_added: int = 0
    recovery_added: int = 0
    extended_added: int = 0
    duplicate_ids: list[str] = field(default_factory=list)


def observation_id(source_dataset: str, ordinal: int) -> str:
    """Deterministic id for the ordinal-th row of an extraction dataset."""
    return hashlib.sha256(f"{source_dataset}|{ordinal:06d}".encode("utf-8")).hexdigest()


def _int_or_none(raw: str | None) -> int | None:
    if raw is None:
        return None
    raw = raw.strip()
    if raw == "":
        return None
    return int(raw)


def normalize_row(raw: dict, source_dataset: str, ordinal: int) -> dict:
    """Map one source CSV row to the observation column set."""
    return {
        "observation_id": observation_id(source_dataset, ordinal),
        "fiscal_year": int(raw["fiscal_year"]),
        "value": int(raw["value"]),
        "printed_form": None,
        "printed_form_review_status": None,
        "measure_type": "dollars",
        "status": raw.get("status"),
        "status_class": status_class_for(raw["status"]),
        "original_label": raw["original_label"],
        "table_section": raw.get("table_section"),
        "raw_fund_type": raw.get("fund_type"),
        "raw_operating_category": raw.get("operating_category"),
        "included_in_reported_total_budget": raw.get("included_in_reported_total_budget"),
        "source_code": raw["source_code"],
        "document_title_version": raw.get("document_title_version"),
        "source_url": raw.get("source_url"),
        "pdf_page": _int_or_none(raw.get("pdf_page")),
        "printed_page": _int_or_none(raw.get("printed_page")),
        "ambiguity_flag": raw.get("ambiguity_flag") or None,
        "notes": raw.get("notes") or None,
        "treatment_note": raw.get("treatment_note") or None,
        "conflict_group": raw.get("conflict_group") or None,
        "conflict_note": raw.get("conflict_note") or None,
        "source_dataset": source_dataset,
        "source_row_ordinal": ordinal,
    }


def _natural_key(row: dict) -> tuple:
    return tuple(str(row.get(col)) for col in _NATURAL_KEY)


def _insert(conn, row: dict) -> None:
    cols = ",".join(_OBSERVATION_COLUMNS)
    placeholders = ",".join("?" for _ in _OBSERVATION_COLUMNS)
    conn.execute(
        f"INSERT OR IGNORE INTO observation ({cols}) VALUES ({placeholders})",
        tuple(row[c] for c in _OBSERVATION_COLUMNS),
    )


def _apply_printed_forms(conn, path: Path) -> None:
    """Attach the curated source-form sidecar with ordinal and content echoes checked."""
    allowed_forms = {"0", "-", "--", "(0)", "missing"}
    allowed_statuses = {"machine_classified", "human_confirmed"}
    seen: set[str] = set()
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            observation_id = row["observation_id"]
            if observation_id in seen:
                raise ValueError(f"{path}: duplicate observation_id {observation_id}")
            seen.add(observation_id)
            observed = conn.execute(
                "SELECT source_dataset,source_row_ordinal,fiscal_year,original_label,value "
                "FROM observation WHERE observation_id=?",
                (observation_id,),
            ).fetchone()
            if observed is None:
                raise ValueError(f"{path}: stale observation_id {observation_id}")
            expected = (
                row["source_dataset"],
                int(row["source_row_ordinal"]),
                int(row["echo_fiscal_year"]),
                row["echo_original_label"],
                int(row["echo_value"]),
            )
            if tuple(observed) != expected:
                raise ValueError(
                    f"{observation_id}: printed-form echo mismatch; "
                    f"sidecar={expected!r}, observation={tuple(observed)!r}"
                )
            form = row["printed_form"].strip()
            status = row["review_status"].strip()
            if form not in allowed_forms or status not in allowed_statuses:
                raise ValueError(
                    f"{observation_id}: incomplete printed-form review "
                    f"form={form!r}, status={status!r}"
                )
            conn.execute(
                "UPDATE observation SET printed_form=?,printed_form_review_status=? "
                "WHERE observation_id=?",
                (form, status, observation_id),
            )


def ingest_observations(
    conn,
    blind_dir: Path,
    recovery_dir: Path | None = None,
    extended_dir: Path | None = None,
    printed_forms_path: Path | None = None,
) -> IngestReport:
    """Ingest the primary files, the conflicts file, then any recovery files.

    Primary rows are inserted verbatim by ordinal. Conflict-file rows are added
    only when their natural key is not already present from a primary file (the
    matching rows are the later-book winners already ingested); the remainder are
    the earlier-book alternates the conflict layer exists to preserve. Recovery
    files (image tables transcribed later) are ingested by ordinal like primaries
    but counted separately, so ``primary_count`` still describes the frozen blind
    extraction alone.
    """
    report = IngestReport()
    seen_natural: set[tuple] = set()
    seen_ids: set[str] = set()

    for dataset in PRIMARY_DATASETS:
        path = blind_dir / f"{dataset}.csv"
        with path.open(newline="", encoding="utf-8") as fh:
            for ordinal, raw in enumerate(csv.DictReader(fh)):
                row = normalize_row(raw, dataset, ordinal)
                if row["observation_id"] in seen_ids:
                    report.duplicate_ids.append(row["observation_id"])
                seen_ids.add(row["observation_id"])
                seen_natural.add(_natural_key(row))
                _insert(conn, row)
                report.primary_count += 1

    conflicts_path = blind_dir / f"{CONFLICTS_DATASET}.csv"
    if conflicts_path.exists():
        with conflicts_path.open(newline="", encoding="utf-8") as fh:
            for ordinal, raw in enumerate(csv.DictReader(fh)):
                row = normalize_row(raw, CONFLICTS_DATASET, ordinal)
                if _natural_key(row) in seen_natural:
                    continue  # later-book winner already ingested from a primary file
                if row["observation_id"] in seen_ids:
                    report.duplicate_ids.append(row["observation_id"])
                seen_ids.add(row["observation_id"])
                _insert(conn, row)
                report.conflict_added += 1

    if recovery_dir is not None:
        for dataset in RECOVERY_DATASETS:
            path = recovery_dir / f"{dataset}.csv"
            if not path.exists():
                continue
            with path.open(newline="", encoding="utf-8") as fh:
                for ordinal, raw in enumerate(csv.DictReader(fh)):
                    row = normalize_row(raw, dataset, ordinal)
                    if row["observation_id"] in seen_ids:
                        report.duplicate_ids.append(row["observation_id"])
                    seen_ids.add(row["observation_id"])
                    _insert(conn, row)
                    report.recovery_added += 1

    if extended_dir is not None:
        for dataset in EXTENDED_DATASETS:
            path = extended_dir / f"{dataset}.csv"
            if not path.exists():
                continue
            with path.open(newline="", encoding="utf-8") as fh:
                for ordinal, raw in enumerate(csv.DictReader(fh)):
                    row = normalize_row(raw, dataset, ordinal)
                    if row["observation_id"] in seen_ids:
                        report.duplicate_ids.append(row["observation_id"])
                    seen_ids.add(row["observation_id"])
                    _insert(conn, row)
                    report.extended_added += 1

    if printed_forms_path is not None:
        _apply_printed_forms(conn, printed_forms_path)

    conn.commit()
    return report
