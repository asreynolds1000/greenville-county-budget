#!/usr/bin/env python3
"""Run deterministic checks against the provisional Greenville County budget data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence


CSV_SPECS = {
    "budget_totals": {
        "filename": "budget_totals.csv",
        "columns": (
            "fiscal_year",
            "general_fund_operating",
            "general_fund_transfers",
            "general_fund_total",
            "special_revenue",
            "debt_service",
            "enterprise",
            "total_budget",
            "internal_service",
        ),
        "key": ("fiscal_year",),
        "years": (2002, 2026),
    },
    "general_fund_departments": {
        "filename": "general_fund_departments.csv",
        "columns": (
            "fiscal_year",
            "department",
            "amount",
            "normalized_category",
            "source_document",
        ),
        "key": ("fiscal_year", "department"),
        "years": (2002, 2026),
    },
    "special_revenue_funds": {
        "filename": "special_revenue_funds.csv",
        "columns": ("fiscal_year", "fund_name", "amount"),
        "key": ("fiscal_year", "fund_name"),
        "years": (2002, 2026),
    },
    "general_fund_revenue": {
        "filename": "general_fund_revenue.csv",
        "columns": ("fiscal_year", "source", "amount", "data_type"),
        "key": ("fiscal_year", "source", "data_type"),
        "years": (2020, 2026),
    },
    "general_fund_balance": {
        "filename": "general_fund_balance.csv",
        "columns": (
            "fiscal_year",
            "beginning_balance",
            "ending_balance",
            "data_type",
        ),
        "key": ("fiscal_year",),
        "years": (2020, 2029),
    },
    "general_fund_projection": {
        "filename": "general_fund_projection.csv",
        "columns": (
            "fiscal_year",
            "total_revenue",
            "total_expenditures",
            "excess_deficiency",
            "transfers_in",
            "transfers_out",
            "net_change",
            "ending_balance",
            "data_type",
        ),
        "key": ("fiscal_year",),
        "years": (2023, 2029),
    },
}


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    dataset: str
    message: str
    fiscal_year: int | None = None
    expected: int | str | None = None
    actual: int | str | None = None
    delta: int | None = None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def parse_int(
    value: str,
    *,
    dataset: str,
    field: str,
    fiscal_year: int | None,
    findings: list[Finding],
    allow_blank: bool = False,
) -> int | None:
    if value == "" and allow_blank:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        findings.append(
            Finding(
                "error",
                "invalid_integer",
                dataset,
                f"{field} must be an integer",
                fiscal_year,
                actual=value,
            )
        )
        return None


def duplicate_key_findings(
    dataset: str, rows: Sequence[dict[str, str]], key_fields: Sequence[str]
) -> list[Finding]:
    keys = [tuple(row[field] for field in key_fields) for row in rows]
    return [
        Finding(
            "error",
            "duplicate_natural_key",
            dataset,
            f"Duplicate natural key {dict(zip(key_fields, key, strict=True))}",
            int(key[0]) if key and key[0].isdigit() else None,
        )
        for key, count in Counter(keys).items()
        if count > 1
    ]


def expected_year_findings(
    dataset: str, rows: Sequence[dict[str, str]], start: int, end: int
) -> list[Finding]:
    actual = {int(row["fiscal_year"]) for row in rows if row["fiscal_year"].isdigit()}
    expected = set(range(start, end + 1))
    findings: list[Finding] = []
    for year in sorted(expected - actual):
        findings.append(
            Finding("error", "missing_fiscal_year", dataset, "Missing fiscal year", year)
        )
    for year in sorted(actual - expected):
        findings.append(
            Finding(
                "warning", "unexpected_fiscal_year", dataset, "Unexpected fiscal year", year
            )
        )
    return findings


def budget_total_findings(rows: Sequence[dict[str, str]]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        year = int(row["fiscal_year"])
        values = {field: int(row[field]) for field in CSV_SPECS["budget_totals"]["columns"][1:]}
        expected_general = values["general_fund_operating"] + values["general_fund_transfers"]
        actual_general = values["general_fund_total"]
        if expected_general != actual_general:
            findings.append(
                Finding(
                    "error",
                    "general_fund_total_mismatch",
                    "budget_totals",
                    "General Fund total does not equal operating plus transfers",
                    year,
                    expected_general,
                    actual_general,
                    actual_general - expected_general,
                )
            )
        expected_total = (
            actual_general
            + values["special_revenue"]
            + values["debt_service"]
            + values["enterprise"]
        )
        actual_total = values["total_budget"]
        if expected_total != actual_total:
            findings.append(
                Finding(
                    "error",
                    "whole_budget_total_mismatch",
                    "budget_totals",
                    "Whole-budget total does not equal included fund totals",
                    year,
                    expected_total,
                    actual_total,
                    actual_total - expected_total,
                )
            )
    return findings


def component_sum_findings(
    totals: Sequence[dict[str, str]],
    components: Sequence[dict[str, str]],
    *,
    total_field: str,
    dataset: str,
    code: str,
) -> list[Finding]:
    total_by_year = {int(row["fiscal_year"]): int(row[total_field]) for row in totals}
    component_by_year: dict[int, int] = defaultdict(int)
    for row in components:
        component_by_year[int(row["fiscal_year"])] += int(row["amount"])

    findings: list[Finding] = []
    for year, expected in total_by_year.items():
        actual = component_by_year.get(year, 0)
        if actual != expected:
            findings.append(
                Finding(
                    "error",
                    code,
                    dataset,
                    "Component sum does not equal stored parent total",
                    year,
                    expected,
                    actual,
                    actual - expected,
                )
            )
    return findings


def balance_continuity_findings(rows: Sequence[dict[str, str]]) -> list[Finding]:
    ordered = sorted(rows, key=lambda row: int(row["fiscal_year"]))
    findings: list[Finding] = []
    for previous, current in zip(ordered, ordered[1:]):
        if current["beginning_balance"] == "":
            continue
        expected = int(previous["ending_balance"])
        actual = int(current["beginning_balance"])
        if actual != expected:
            year = int(current["fiscal_year"])
            findings.append(
                Finding(
                    "warning",
                    "fund_balance_discontinuity",
                    "general_fund_balance",
                    "Beginning balance differs from prior ending balance; source basis may have changed",
                    year,
                    expected,
                    actual,
                    actual - expected,
                )
            )
    return findings


def projection_semantic_findings(rows: Sequence[dict[str, str]]) -> list[Finding]:
    findings: list[Finding] = []
    for row in rows:
        year = int(row["fiscal_year"])
        revenue = int(row["total_revenue"])
        expenditures = int(row["total_expenditures"])
        transfers_in = int(row["transfers_in"])
        transfers_out = int(row["transfers_out"])
        stored_excess = int(row["excess_deficiency"])
        stored_net = int(row["net_change"])
        operating = revenue - expenditures
        after_transfers = operating + transfers_in + transfers_out
        if stored_excess != operating:
            findings.append(
                Finding(
                    "warning",
                    "projection_excess_semantics",
                    "general_fund_projection",
                    "excess_deficiency does not equal revenue minus expenditures",
                    year,
                    operating,
                    stored_excess,
                    stored_excess - operating,
                )
            )
        if stored_net != after_transfers:
            findings.append(
                Finding(
                    "warning",
                    "projection_net_semantics",
                    "general_fund_projection",
                    "net_change does not equal revenue minus expenditures plus stored transfers",
                    year,
                    after_transfers,
                    stored_net,
                    stored_net - after_transfers,
                )
            )
    return findings


def database_findings(database: Path, expected_rows: dict[str, int]) -> list[Finding]:
    if not database.exists():
        return [
            Finding(
                "warning",
                "database_missing",
                "gc_budget.db",
                "SQLite database was not found; CSV checks still ran",
            )
        ]
    findings: list[Finding] = []
    connection = sqlite3.connect(database)
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            findings.append(
                Finding("error", "sqlite_integrity", "gc_budget.db", integrity)
            )
        for table, expected in expected_rows.items():
            actual = connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            if actual != expected:
                findings.append(
                    Finding(
                        "error",
                        "database_row_count",
                        table,
                        "SQLite row count differs from CSV",
                        expected=expected,
                        actual=actual,
                        delta=actual - expected,
                    )
                )
        property_rows, property_years = connection.execute(
            "SELECT COUNT(*), COUNT(DISTINCT fiscal_year) FROM property_tax_trend"
        ).fetchone()
        if property_rows != property_years:
            findings.append(
                Finding(
                    "error",
                    "annual_view_cardinality",
                    "property_tax_trend",
                    "Annual trend contains more than one observation for a fiscal year",
                    expected=property_years,
                    actual=property_rows,
                    delta=property_rows - property_years,
                )
            )
    finally:
        connection.close()
    return findings


def audit(data_dir: Path) -> dict[str, object]:
    findings: list[Finding] = []
    datasets: dict[str, list[dict[str, str]]] = {}
    hashes: dict[str, str] = {}

    for dataset, spec in CSV_SPECS.items():
        path = data_dir / str(spec["filename"])
        if not path.exists():
            findings.append(
                Finding("error", "missing_file", dataset, f"Missing {path.name}")
            )
            datasets[dataset] = []
            continue
        hashes[path.name] = sha256(path)
        columns, rows = read_csv(path)
        datasets[dataset] = rows
        expected_columns = list(spec["columns"])
        if columns != expected_columns:
            findings.append(
                Finding(
                    "error",
                    "csv_schema",
                    dataset,
                    "CSV columns differ from expected schema",
                    expected=",".join(expected_columns),
                    actual=",".join(columns),
                )
            )
        findings.extend(duplicate_key_findings(dataset, rows, spec["key"]))
        start, end = spec["years"]
        findings.extend(expected_year_findings(dataset, rows, start, end))
        for row in rows:
            fiscal_year = int(row["fiscal_year"]) if row["fiscal_year"].isdigit() else None
            for field, value in row.items():
                if field == "fiscal_year" or field in {
                    "amount",
                    "general_fund_operating",
                    "general_fund_transfers",
                    "general_fund_total",
                    "special_revenue",
                    "debt_service",
                    "enterprise",
                    "total_budget",
                    "internal_service",
                    "beginning_balance",
                    "ending_balance",
                    "total_revenue",
                    "total_expenditures",
                    "excess_deficiency",
                    "transfers_in",
                    "transfers_out",
                    "net_change",
                }:
                    parse_int(
                        value,
                        dataset=dataset,
                        field=field,
                        fiscal_year=fiscal_year,
                        findings=findings,
                        allow_blank=(
                            dataset == "general_fund_balance"
                            and field == "beginning_balance"
                            and fiscal_year is not None
                            and fiscal_year >= 2027
                        ),
                    )

    totals = datasets["budget_totals"]
    if totals:
        findings.extend(budget_total_findings(totals))
        findings.extend(
            component_sum_findings(
                totals,
                datasets["general_fund_departments"],
                total_field="general_fund_operating",
                dataset="general_fund_departments",
                code="general_fund_component_mismatch",
            )
        )
        findings.extend(
            component_sum_findings(
                totals,
                datasets["special_revenue_funds"],
                total_field="special_revenue",
                dataset="special_revenue_funds",
                code="special_revenue_component_mismatch",
            )
        )
    findings.extend(balance_continuity_findings(datasets["general_fund_balance"]))
    findings.extend(projection_semantic_findings(datasets["general_fund_projection"]))
    findings.extend(
        database_findings(
            data_dir / "gc_budget.db",
            {name: len(rows) for name, rows in datasets.items()},
        )
    )

    counts = Counter(finding.severity for finding in findings)
    return {
        "data_dir": str(data_dir.resolve()),
        "files": hashes,
        "row_counts": {name: len(rows) for name, rows in datasets.items()},
        "summary": dict(sorted(counts.items())),
        "findings": [asdict(finding) for finding in findings],
    }


def render_text(report: dict[str, object]) -> str:
    lines = [f"Data directory: {report['data_dir']}"]
    row_counts = report["row_counts"]
    assert isinstance(row_counts, dict)
    lines.append(f"Rows checked: {sum(int(value) for value in row_counts.values())}")
    summary = report["summary"]
    assert isinstance(summary, dict)
    lines.append(
        "Findings: " + ", ".join(f"{severity}={count}" for severity, count in summary.items())
    )
    findings = report["findings"]
    assert isinstance(findings, list)
    for finding in findings:
        assert isinstance(finding, dict)
        year = f" FY{finding['fiscal_year']}" if finding["fiscal_year"] else ""
        delta = f" delta={finding['delta']:+,}" if finding["delta"] is not None else ""
        lines.append(
            f"[{str(finding['severity']).upper()}] {finding['code']}"
            f" {finding['dataset']}{year}: {finding['message']}{delta}"
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path, help="Directory containing the provisional CSVs")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument(
        "--fail-on",
        choices=("error", "warning", "never"),
        default="error",
        help="Exit nonzero when findings meet this severity",
    )
    args = parser.parse_args()

    report = audit(args.data_dir)
    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render_text(report))

    summary = report["summary"]
    assert isinstance(summary, dict)
    if args.fail_on == "error" and summary.get("error", 0):
        return 1
    if args.fail_on == "warning" and (
        summary.get("error", 0) or summary.get("warning", 0)
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
