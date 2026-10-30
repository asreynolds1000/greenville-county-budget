#!/usr/bin/env python3
"""Inventory every ingested zero and preserve what the county printed.

The observation store normalizes ``0``, ``-`` and ``--`` to integer zero. This script
reconstructs the exact ingested observation set, re-runs the fixed-width source extractors
with raw-token retention where that is mechanically reliable, and merges those results into
the curated ``data/production/printed_cell_forms.csv`` sidecar.

Raster-backed and older one-off extraction routes remain pending until a human source read
records their form. Existing reviewed rows are never silently replaced: every merge checks
the source-dataset ordinal plus echoed fiscal year, label and value before retaining them.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sqlite3
from pathlib import Path

from scripts.fund_coverage import extract_debt_service as debt_service
from scripts.fund_coverage import extract_enterprise as enterprise
from scripts.fund_coverage import extract_special_revenue as special_revenue
from scripts.production.ingest import ingest_observations
from scripts.production.schema import create_schema


ROOT = Path(__file__).resolve().parents[2]
BLIND_DIR = ROOT / "audit" / "blind-extraction"
DATA_DIR = ROOT / "data" / "production"
RECOVERY_DIR = ROOT / "data" / "recovered"
OUTPUT_PATH = DATA_DIR / "printed_cell_forms.csv"
REVIEW_RULES_PATH = DATA_DIR / "printed_cell_form_review_rules.csv"

FIELDNAMES = (
    "observation_id",
    "source_dataset",
    "source_row_ordinal",
    "echo_fiscal_year",
    "echo_original_label",
    "echo_value",
    "source_code",
    "pdf_page",
    "table_section",
    "printed_form",
    "review_status",
    "classification_method",
    "review_note",
)

ALLOWED_FORMS = {"0", "-", "--", "(0)", "missing"}
REVIEWED_STATUSES = {"machine_classified", "human_confirmed"}
REVIEW_RULE_FIELDS = (
    "source_dataset",
    "source_code",
    "pdf_page",
    "expected_count",
    "identity_sha256",
    "printed_form",
    "review_status",
    "classification_method",
    "review_note",
)


def zero_observations() -> list[dict[str, object]]:
    """Return the exact zero rows the production ingest route creates."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    try:
        create_schema(conn)
        ingest_observations(
            conn,
            BLIND_DIR,
            recovery_dir=RECOVERY_DIR,
            extended_dir=DATA_DIR / "observations",
        )
        return [
            dict(row)
            for row in conn.execute(
                "SELECT observation_id,source_dataset,source_row_ordinal,fiscal_year,"
                "original_label,value,source_code,pdf_page,table_section,"
                "raw_operating_category,status FROM observation WHERE value=0 "
                "ORDER BY source_dataset,source_row_ordinal"
            )
        ]
    finally:
        conn.close()


def _extraction_key(dataset: str, row: dict[str, object]) -> tuple[object, ...]:
    return (
        dataset,
        row["source_code"],
        int(row["fiscal_year"]),
        row["status"],
        row["original_label"],
        row.get("operating_category"),
        int(row["pdf_page"]),
    )


def _observation_key(row: dict[str, object]) -> tuple[object, ...]:
    return (
        row["source_dataset"],
        row["source_code"],
        int(row["fiscal_year"]),
        row["status"],
        row["original_label"],
        row.get("raw_operating_category"),
        int(row["pdf_page"]),
    )


def fixed_width_forms() -> dict[tuple[object, ...], str]:
    """Raw-token classifications from the three source-aligned text routes."""
    routes = (
        ("special-revenue-summary", special_revenue),
        ("debt-service-summary", debt_service),
        ("enterprise-summary", enterprise),
    )
    forms: dict[tuple[object, ...], str] = {}
    for dataset, module in routes:
        for source in module.SOURCES:
            is_recovery = getattr(source, "recovery", False) or source.code == "FY2022-23"
            if is_recovery:
                continue
            for row in module.extract_text_source(source, include_printed_form=True):
                if int(row["value"]) != 0:
                    continue
                key = _extraction_key(dataset, row)
                if key in forms:
                    raise ValueError(f"duplicate fixed-width zero identity: {key}")
                form = str(row["printed_form"])
                if form not in ALLOWED_FORMS:
                    raise ValueError(f"unsupported printed form {form!r}: {key}")
                forms[key] = form
    return forms


def _read_existing(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != FIELDNAMES:
            raise ValueError(f"{path}: unexpected columns {reader.fieldnames}")
        rows = list(reader)
    by_id: dict[str, dict[str, str]] = {}
    for row in rows:
        observation_id = row["observation_id"]
        if observation_id in by_id:
            raise ValueError(f"{path}: duplicate observation_id {observation_id}")
        by_id[observation_id] = row
    return by_id


def _assert_echo(existing: dict[str, str], observation: dict[str, object]) -> None:
    expected = {
        "source_dataset": str(observation["source_dataset"]),
        "source_row_ordinal": str(observation["source_row_ordinal"]),
        "echo_fiscal_year": str(observation["fiscal_year"]),
        "echo_original_label": str(observation["original_label"]),
        "echo_value": str(observation["value"]),
    }
    mismatches = {
        key: (existing.get(key), value)
        for key, value in expected.items()
        if existing.get(key) != value
    }
    if mismatches:
        raise ValueError(
            f"{observation['observation_id']}: sidecar echo mismatch {mismatches}"
        )


def reviewed_forms(
    observations: list[dict[str, object]],
    path: Path = REVIEW_RULES_PATH,
) -> dict[str, tuple[str, str, str, str]]:
    """Expand exact-set human review records to observation ids.

    A rule names a page group for readability but is authorized by the hash of the exact
    observation-id set. A new, removed or ordinal-shifted source row therefore fails the
    review instead of inheriting the page's prior classification.
    """
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != REVIEW_RULE_FIELDS:
            raise ValueError(f"{path}: unexpected columns {reader.fieldnames}")
        rules = list(reader)

    expanded: dict[str, tuple[str, str, str, str]] = {}
    for rule in rules:
        matches = [
            row
            for row in observations
            if row["source_dataset"] == rule["source_dataset"]
            and row["source_code"] == rule["source_code"]
            and str(row["pdf_page"]) == rule["pdf_page"]
        ]
        observation_ids = sorted(str(row["observation_id"]) for row in matches)
        digest = hashlib.sha256("\n".join(observation_ids).encode()).hexdigest()
        if len(matches) != int(rule["expected_count"]) or digest != rule["identity_sha256"]:
            raise ValueError(
                f"review rule drift for {rule['source_dataset']} / {rule['source_code']} "
                f"p.{rule['pdf_page']}: expected {rule['expected_count']} "
                f"/{rule['identity_sha256']}, observed {len(matches)}/{digest}"
            )
        form = rule["printed_form"]
        status = rule["review_status"]
        if form not in ALLOWED_FORMS or status != "human_confirmed":
            raise ValueError(f"invalid human review rule: {rule}")
        for observation_id in observation_ids:
            if observation_id in expanded:
                raise ValueError(f"human review rules overlap on {observation_id}")
            expanded[observation_id] = (
                form,
                status,
                rule["classification_method"],
                rule["review_note"],
            )
    return expanded


def merge_rows(
    observations: list[dict[str, object]],
    auto_forms: dict[tuple[object, ...], str],
    existing: dict[str, dict[str, str]],
    human_forms: dict[str, tuple[str, str, str, str]] | None = None,
) -> list[dict[str, object]]:
    """Merge mechanical classifications without overwriting curated review."""
    human_forms = human_forms or {}
    rows: list[dict[str, object]] = []
    seen_auto_keys: set[tuple[object, ...]] = set()
    live_ids = {str(row["observation_id"]) for row in observations}
    stale_ids = set(existing) - live_ids
    if stale_ids:
        raise ValueError(f"sidecar contains {len(stale_ids)} stale observation ids")

    for observation in observations:
        observation_id = str(observation["observation_id"])
        previous = existing.get(observation_id)
        if previous:
            _assert_echo(previous, observation)

        key = _observation_key(observation)
        auto_form = auto_forms.get(key)
        if auto_form is not None:
            seen_auto_keys.add(key)

        previous_status = previous["review_status"] if previous else ""
        previous_form = previous["printed_form"] if previous else ""
        human = human_forms.get(observation_id)
        if previous_status == "human_confirmed":
            if auto_form is not None and previous_form != auto_form:
                raise ValueError(
                    f"{observation_id}: human form {previous_form!r} disagrees with "
                    f"fixed-width token {auto_form!r}"
                )
            if human is not None and previous_form != human[0]:
                raise ValueError(
                    f"{observation_id}: sidecar human form {previous_form!r} disagrees "
                    f"with review rule {human[0]!r}"
                )
            printed_form = previous_form
            review_status = previous_status
            method = previous["classification_method"]
            note = previous["review_note"]
        elif human is not None:
            if auto_form is not None and auto_form != human[0]:
                raise ValueError(
                    f"{observation_id}: fixed-width form {auto_form!r} disagrees with "
                    f"human review {human[0]!r}"
                )
            printed_form, review_status, method, note = human
        elif auto_form is not None:
            printed_form = auto_form
            review_status = "machine_classified"
            method = "fixed_width_token"
            note = "Raw monetary token re-read from the hash-verified source page."
        else:
            printed_form = previous_form
            review_status = previous_status
            method = previous["classification_method"] if previous else "pending_source_read"
            note = previous["review_note"] if previous else ""

        if printed_form and printed_form not in ALLOWED_FORMS:
            raise ValueError(f"{observation_id}: unsupported printed form {printed_form!r}")
        if review_status and review_status not in REVIEWED_STATUSES:
            raise ValueError(f"{observation_id}: unsupported review status {review_status!r}")

        rows.append({
            "observation_id": observation_id,
            "source_dataset": observation["source_dataset"],
            "source_row_ordinal": observation["source_row_ordinal"],
            "echo_fiscal_year": observation["fiscal_year"],
            "echo_original_label": observation["original_label"],
            "echo_value": observation["value"],
            "source_code": observation["source_code"],
            "pdf_page": observation["pdf_page"],
            "table_section": observation["table_section"],
            "printed_form": printed_form,
            "review_status": review_status,
            "classification_method": method,
            "review_note": note,
        })

    unused_auto = set(auto_forms) - seen_auto_keys
    if unused_auto:
        raise ValueError(f"{len(unused_auto)} fixed-width classifications did not match ingest")
    unused_human = set(human_forms) - live_ids
    if unused_human:
        raise ValueError(f"{len(unused_human)} human classifications did not match ingest")
    return rows


def write_rows(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help=f"update {OUTPUT_PATH}")
    parser.add_argument(
        "--no-auto-text",
        action="store_true",
        help="inventory only; do not re-open fixed-width source pages",
    )
    args = parser.parse_args()

    observations = zero_observations()
    auto_forms = {} if args.no_auto_text else fixed_width_forms()
    human_forms = reviewed_forms(observations)
    rows = merge_rows(
        observations,
        auto_forms,
        _read_existing(OUTPUT_PATH),
        human_forms,
    )
    classified = sum(bool(row["review_status"]) for row in rows)
    pending = len(rows) - classified
    print(
        f"inventoried {len(rows)} zero observations: "
        f"{classified} classified, {pending} pending source read"
    )
    if args.write:
        write_rows(OUTPUT_PATH, rows)
        print(f"wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
