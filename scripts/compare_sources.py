#!/usr/bin/env python3
"""Compare every numeric cell in the provisional data with official observations."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable


OVERVIEW_FIELDS = {
    "general_fund_operating": "totaloperatingbudget",
    "general_fund_transfers": "interfundtransfers",
    "general_fund_total": "totalgeneralfundbudget",
    "special_revenue": "totalspecialrevenuefund",
    "debt_service": "totaldebtservicefund",
    "enterprise": "totalenterprisefund",
    "total_budget": "totalbudget",
    "internal_service": "totalinternalservicefund",
}

REVENUE_FIELDS = {
    "Property Taxes": "property_tax",
    "County Offices": "county_office_revenue",
    "Intergovernmental": "intergovernmental",
    "Other": "other",
}

PROJECTION_FIELDS = {
    "total_revenue": "total_revenues",
    "total_expenditures": "total_recurring_expenditures",
    "transfers_in": "transfers_in",
    "transfers_out": "transfers_out",
    "net_change": "excess_deficit",
    "ending_balance": "ending_fund_balance",
}

OUTPUT_FIELDS = [
    "dataset",
    "row_key",
    "fiscal_year",
    "field",
    "stored_value",
    "classification",
    "expected_values",
    "matched_status",
    "source_url",
    "pdf_page",
    "source_label",
    "notes",
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def normalized_label(label: str) -> str:
    value = re.sub(r"[^a-z0-9]", "", label.casefold())
    value = value.replace("jucicial", "judicial")
    if value.startswith("departmentof"):
        value = value[len("departmentof") :]
    aliases = {
        "communitydevelopmentandplanning": "communitydevelopmentplanning",
        "communityplanninganddevelopment": "communitydevelopmentplanning",
        "planninganddevelopment": "planningdevelopment",
        "electedappointedofficeslawenforc": "electedappointedofficeslawenforcement",
        "electedappointedofficeslawenforcemen": "electedappointedofficeslawenforcement",
        "roadpaving": "roadprogram",
        "victimrights": "victimsrights",
    }
    return aliases.get(value, value)


def observation(row: dict[str, str]) -> dict[str, object]:
    return {
        "value": int(row["value"]),
        "status": row.get("status", ""),
        "url": row.get("source_url", ""),
        "page": row.get("pdf_page", ""),
        "label": row.get("original_label", ""),
        "notes": row.get("notes", ""),
    }


def result(
    dataset: str,
    row_key: str,
    fiscal_year: int,
    field: str,
    stored_value: int,
    classification: str,
    candidates: Iterable[dict[str, object]] = (),
    *,
    matched: dict[str, object] | None = None,
    notes: str = "",
) -> dict[str, str | int]:
    choices = list(candidates)
    chosen = matched or (choices[0] if choices else {})
    expected_values = sorted({int(item["value"]) for item in choices})
    return {
        "dataset": dataset,
        "row_key": row_key,
        "fiscal_year": fiscal_year,
        "field": field,
        "stored_value": stored_value,
        "classification": classification,
        "expected_values": "|".join(str(value) for value in expected_values),
        "matched_status": str(chosen.get("status", "")),
        "source_url": str(chosen.get("url", "")),
        "pdf_page": str(chosen.get("page", "")),
        "source_label": str(chosen.get("label", "")),
        "notes": notes or str(chosen.get("notes", "")),
    }


def compare_observation(
    *,
    dataset: str,
    row_key: str,
    fiscal_year: int,
    field: str,
    stored_value: int,
    canonical: list[dict[str, object]],
    alternates: list[dict[str, object]] | None = None,
) -> dict[str, str | int]:
    alternates = alternates or []
    for candidate in canonical:
        if int(candidate["value"]) == stored_value:
            return result(
                dataset,
                row_key,
                fiscal_year,
                field,
                stored_value,
                "verified_canonical",
                canonical,
                matched=candidate,
            )
    for candidate in alternates:
        if int(candidate["value"]) == stored_value:
            return result(
                dataset,
                row_key,
                fiscal_year,
                field,
                stored_value,
                "official_alternate_only",
                canonical,
                matched=candidate,
                notes="Value appears in another official book version, not the selected later adopted comparison column.",
            )
    return result(
        dataset,
        row_key,
        fiscal_year,
        field,
        stored_value,
        "source_mismatch" if canonical else "unmapped",
        canonical,
        notes="No matching official observation for this semantic field." if canonical else "No one-to-one source field was mapped.",
    )


def overview_indexes(blind_dir: Path) -> tuple[dict[tuple[str, int, str], list[dict[str, object]]], dict[tuple[str, int, str], list[dict[str, object]]]]:
    canonical: dict[tuple[str, int, str], list[dict[str, object]]] = defaultdict(list)
    files = {
        "whole": "whole-budget-major-funds.csv",
        "general": "general-fund-operating-categories-and-transfers.csv",
        "special": "named-special-revenue-funds.csv",
    }
    for domain, filename in files.items():
        for row in read_csv(blind_dir / filename):
            key = (domain, int(row["fiscal_year"]), normalized_label(row["original_label"]))
            canonical[key].append(observation(row))

    alternates: dict[tuple[str, int, str], list[dict[str, object]]] = defaultdict(list)
    for row in read_csv(blind_dir / "official-document-conflicts.csv"):
        fund_type = row.get("fund_type", "")
        if fund_type == "General Fund":
            domains = ("general", "whole")
        elif fund_type == "Special Revenue Fund":
            domains = ("special", "whole")
        else:
            domains = ("whole",)
        for domain in domains:
            key = (domain, int(row["fiscal_year"]), normalized_label(row["original_label"]))
            alternates[key].append(observation(row))
    return canonical, alternates


def source_rank(url: str) -> int:
    for rank, marker in enumerate(("/2022/", "/2024/", "/2026/"), start=1):
        if marker in url:
            return rank
    return 0


def load_projection_sources(source_dir: Path) -> dict[int, list[dict[str, str]]]:
    by_year: dict[int, list[dict[str, str]]] = defaultdict(list)
    for path in sorted(source_dir.glob("*-general-fund-projection.csv")):
        for row in read_csv(path):
            row["_source_file"] = path.name
            by_year[int(row["fiscal_year"])].append(row)
    for rows in by_year.values():
        rows.sort(key=lambda row: source_rank(row["source_url"]), reverse=True)
    return by_year


def wide_observation(row: dict[str, str], field: str, *, negate: bool = False) -> dict[str, object]:
    value = int(row[field])
    return {
        "value": -value if negate else value,
        "status": row["status"],
        "url": row["source_url"],
        "page": row["pdf_page"],
        "label": field,
        "notes": row.get("notes", ""),
    }


def normalized_status(status: str) -> str:
    value = status.casefold().strip()
    if value.startswith("actual"):
        return "actual"
    if value.startswith("project"):
        return "projected"
    if value == "budget" or value.endswith(" budget"):
        return "budget"
    return value


def compare_versioned(
    *,
    dataset: str,
    row_key: str,
    fiscal_year: int,
    field: str,
    stored_value: int,
    stored_status: str,
    source_field: str,
    versions: list[dict[str, str]],
    negate: bool = False,
) -> dict[str, str | int]:
    candidates = [wide_observation(row, source_field, negate=negate) for row in versions]
    canonical = candidates[:1]
    for index, candidate in enumerate(candidates):
        if int(candidate["value"]) != stored_value:
            continue
        status_matches = normalized_status(str(candidate["status"])) == normalized_status(stored_status)
        if index == 0 and status_matches:
            classification = "verified_canonical"
        elif index == 0:
            classification = "status_mismatch"
        elif status_matches:
            classification = "official_alternate_only"
        else:
            classification = "official_alternate_status_mismatch"
        return result(
            dataset,
            row_key,
            fiscal_year,
            field,
            stored_value,
            classification,
            canonical,
            matched=candidate,
            notes=(
                "Stored data type differs from the source column status."
                if not status_matches
                else "Value appears only in an older official projection table."
                if index
                else ""
            ),
        )
    return result(
        dataset,
        row_key,
        fiscal_year,
        field,
        stored_value,
        "source_mismatch" if candidates else "unmapped",
        canonical,
        notes="No official version of this field contains the stored value." if candidates else "No official source row covers this fiscal year.",
    )


def audit(data_dir: Path, blind_dir: Path, source_dir: Path) -> list[dict[str, str | int]]:
    results: list[dict[str, str | int]] = []
    canonical, alternates = overview_indexes(blind_dir)

    for row in read_csv(data_dir / "budget_totals.csv"):
        year = int(row["fiscal_year"])
        for field, semantic in OVERVIEW_FIELDS.items():
            domain = "general" if field in {"general_fund_operating", "general_fund_transfers"} else "whole"
            key = (domain, year, semantic)
            results.append(compare_observation(dataset="budget_totals", row_key=str(year), fiscal_year=year, field=field, stored_value=int(row[field]), canonical=canonical[key], alternates=alternates[key]))

    for row in read_csv(data_dir / "general_fund_departments.csv"):
        year = int(row["fiscal_year"])
        semantic = normalized_label(row["department"])
        key = ("general", year, semantic)
        source_label_override = False
        if not canonical[key] and semantic == "publicworks" and year in {2012, 2013}:
            key = ("general", year, "communitydevelopmentplanning")
            source_label_override = True
        compared = compare_observation(dataset="general_fund_departments", row_key=f"{year}|{row['department']}", fiscal_year=year, field="amount", stored_value=int(row["amount"]), canonical=canonical[key], alternates=alternates[key])
        if source_label_override and compared["classification"] == "verified_canonical":
            compared["classification"] = "label_mismatch"
            compared["notes"] = "Stored label says Public Works, but the source amount is for the combined Community Development and Planning category."
        results.append(compared)

    for row in read_csv(data_dir / "special_revenue_funds.csv"):
        year = int(row["fiscal_year"])
        semantic = normalized_label(row["fund_name"])
        key = ("special", year, semantic)
        results.append(compare_observation(dataset="special_revenue_funds", row_key=f"{year}|{row['fund_name']}", fiscal_year=year, field="amount", stored_value=int(row["amount"]), canonical=canonical[key], alternates=alternates[key]))

    projections = load_projection_sources(source_dir)
    for row in read_csv(data_dir / "general_fund_revenue.csv"):
        year = int(row["fiscal_year"])
        results.append(compare_versioned(dataset="general_fund_revenue", row_key=f"{year}|{row['source']}|{row['data_type']}", fiscal_year=year, field="amount", stored_value=int(row["amount"]), stored_status=row["data_type"], source_field=REVENUE_FIELDS[row["source"]], versions=projections.get(year, [])))

    for row in read_csv(data_dir / "general_fund_balance.csv"):
        year = int(row["fiscal_year"])
        for field, source_field in (("beginning_balance", "beginning_fund_balance"), ("ending_balance", "ending_fund_balance")):
            if row[field] == "":
                continue
            results.append(compare_versioned(dataset="general_fund_balance", row_key=str(year), fiscal_year=year, field=field, stored_value=int(row[field]), stored_status=row["data_type"], source_field=source_field, versions=projections.get(year, [])))

    for row in read_csv(data_dir / "general_fund_projection.csv"):
        year = int(row["fiscal_year"])
        versions = projections.get(year, [])
        for field, source_field in PROJECTION_FIELDS.items():
            results.append(compare_versioned(dataset="general_fund_projection", row_key=str(year), fiscal_year=year, field=field, stored_value=int(row[field]), stored_status=row["data_type"], source_field=source_field, versions=versions, negate=field == "transfers_out"))

        # This column changes meaning in the provisional CSV. Check both the
        # source's after-financing excess/deficit and the pre-financing operating gap.
        semantic_candidates: list[dict[str, object]] = []
        for version in versions:
            official = wide_observation(version, "excess_deficit")
            operating = dict(official)
            operating["value"] = int(version["total_revenues"]) - int(version["total_recurring_expenditures"])
            operating["label"] = "calculated operating gap"
            semantic_candidates.extend((official, operating))
        stored = int(row["excess_deficiency"])
        match = next((candidate for candidate in semantic_candidates if int(candidate["value"]) == stored), None)
        results.append(result("general_fund_projection", str(year), year, "excess_deficiency", stored, "semantic_ambiguity" if match else "source_mismatch", semantic_candidates[:2], matched=match, notes="Column meaning is not stable: values alternate between the operating gap and the source table's after-financing excess/deficit."))

    return results


def write_report(results: list[dict[str, str | int]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with (output_dir / "cell-comparison.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(results)

    overall = Counter(str(row["classification"]) for row in results)
    by_dataset: dict[str, Counter[str]] = defaultdict(Counter)
    for row in results:
        by_dataset[str(row["dataset"])][str(row["classification"])] += 1
    summary = {
        "numeric_cells_checked": len(results),
        "classification_counts": dict(sorted(overall.items())),
        "by_dataset": {name: dict(sorted(counts.items())) for name, counts in sorted(by_dataset.items())},
    }
    (output_dir / "comparison-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--blind-dir", type=Path, default=Path("audit/blind-extraction"))
    parser.add_argument("--source-dir", type=Path, default=Path("audit/source-transcriptions"))
    parser.add_argument("--output-dir", type=Path, default=Path("audit/comparison"))
    args = parser.parse_args()
    results = audit(args.data_dir, args.blind_dir, args.source_dir)
    write_report(results, args.output_dir)
    print(json.dumps(Counter(str(row["classification"]) for row in results), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
