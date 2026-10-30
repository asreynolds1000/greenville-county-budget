#!/usr/bin/env python3
"""Extract Greenville County Enterprise Funds operating-budget summaries.

The Enterprise table is not the governmental-fund sources-and-uses statement.
It reports Solid Waste and Stormwater operating revenue, a source-printed Fund
Balance Usage (Contribution) line inside the revenue block, and operating
expenses.  This route preserves those distinctions instead of treating a draw
on fund balance as outside revenue or inventing beginning/ending positions.
"""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.blind_extract.table_numbers import raw_tokens, tokens, zero_printed_form  # noqa: E402


OUTPUT_COLUMNS = (
    "fiscal_year",
    "value",
    "status",
    "fund_type",
    "statement_section",
    "operating_category",
    "original_label",
    "source_url",
    "document_title_version",
    "pdf_page",
    "printed_page",
    "table_section",
    "source_code",
    "ambiguity_flag",
    "notes",
)
TABLE_SECTION = "Enterprise Funds Operating Budgets"
OUTPUT_PATH = ROOT / "data/production/observations/enterprise-summary.csv"
RECOVERY_PATH = ROOT / "research/fund-coverage/fy2020-2023-enterprise-raster-recovery.csv"
DIFFERENCE_PATH = ROOT / "research/fund-coverage/enterprise-flow-differences.csv"


@dataclass(frozen=True)
class Source:
    code: str
    relative_pdf: str
    url: str
    title: str
    pdf_page: int
    printed_page: int
    columns: tuple[tuple[int, str], ...]
    starred_actual_year: int | None = None
    recovery: bool = False


SOURCES = (
    Source(
        "FY2004-05",
        "data/raw/gc-fy2004-2005/09-Approvedi_Proprietary.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/Approvedi_Proprietary.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2004 and 2005 — Proprietary Funds",
        5,
        143,
        ((2002, "ACTUAL"), (2003, "PROJECTED"), (2004, "BUDGET"), (2005, "BUDGET")),
    ),
    Source(
        "FY2006-07",
        "data/raw/gc-fy2006-2007/11-final_A019_proprietary_pages191-200.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2006/final_A019_proprietary_pages191-200.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2006 and 2007 — Proprietary Funds",
        5,
        195,
        ((2004, "ACTUAL"), (2005, "PROJECTED"), (2006, "BUDGET"), (2007, "BUDGET")),
    ),
    Source(
        "FY2008-09",
        "data/raw/gc-fy2008-2009/09-proprietary_funds.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/proprietary_funds.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2008 and 2009 — Proprietary Funds",
        5,
        209,
        ((2006, "ACTUAL"), (2007, "PROJECTED"), (2008, "BUDGET"), (2009, "BUDGET")),
    ),
    Source(
        "FY2010-11",
        "data/raw/gc-fy2010-2011/08-proprietary_funds.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2010/proprietary_funds.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2010 and 2011 — Proprietary Funds",
        5,
        225,
        ((2008, "ACTUAL"), (2009, "PROJECTED"), (2010, "BUDGET"), (2011, "BUDGET")),
    ),
    Source(
        "FY2012-13",
        "data/raw/gc-fy2012-2013/budget_combined2012.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/budget_combined2012.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2012 and 2013",
        181,
        173,
        (
            (2010, "BUDGET"), (2010, "ACTUAL"),
            (2011, "BUDGET"), (2011, "ACTUAL"),
            (2012, "BUDGET"), (2013, "BUDGET"),
        ),
        2011,
    ),
    Source(
        "FY2014-15",
        "data/raw/gc-fy2014-2015/budget_combined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2014/budget_combined.pdf",
        "County of Greenville Budget Document Fiscal Years 2014 and 2015",
        148,
        148,
        (
            (2012, "BUDGET"), (2012, "ACTUAL"),
            (2013, "BUDGET"), (2013, "ACTUAL"),
            (2014, "BUDGET"), (2015, "BUDGET"),
        ),
        2013,
    ),
    Source(
        "FY2016-17",
        "data/raw/gc-fy2016-2017/budget_combined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf",
        "County of Greenville Budget Document Fiscal Years 2016 and 2017",
        149,
        149,
        (
            (2014, "BUDGET"), (2014, "ACTUAL"),
            (2015, "BUDGET"), (2015, "ACTUAL"),
            (2016, "BUDGET"), (2017, "BUDGET"),
        ),
        2015,
    ),
    Source(
        "FY2018-19",
        "data/raw/gc-fy2018-2019/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2018 and 2019",
        151,
        151,
        (
            (2016, "BUDGET"), (2016, "ACTUAL"),
            (2017, "BUDGET"), (2017, "ACTUAL"),
            (2018, "BUDGET"), (2019, "BUDGET"),
        ),
        2017,
    ),
    Source(
        "FY2020-21",
        "data/raw/gc-fy2020-2021/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2019/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2020 and 2021",
        153,
        153,
        (
            (2018, "BUDGET"), (2018, "ACTUAL"),
            (2019, "BUDGET"), (2019, "ACTUAL"),
            (2020, "BUDGET"), (2021, "BUDGET"),
        ),
        2019,
    ),
    Source(
        "FY2022-23",
        "data/raw/gc-fy2022-2023/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2022/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2022 and 2023",
        154,
        153,
        (
            (2020, "BUDGET"), (2020, "ACTUAL"),
            (2021, "BUDGET"), (2021, "ACTUAL"),
            (2022, "BUDGET"), (2023, "BUDGET"),
        ),
        2021,
        True,
    ),
    Source(
        "FY2024-25",
        "data/raw/gc-fy2024-2025/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2024/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2024 and 2025",
        153,
        152,
        (
            (2022, "BUDGET"), (2022, "ACTUAL"),
            (2023, "BUDGET"), (2023, "ACTUAL"),
            (2024, "BUDGET"), (2025, "BUDGET"),
        ),
        2023,
    ),
    Source(
        "FY2026",
        "data/raw/gc-fy2026/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Year 2026",
        157,
        156,
        (
            (2024, "BUDGET"), (2024, "ACTUAL"),
            (2025, "BUDGET"), (2025, "ACTUAL"),
            (2026, "BUDGET"),
        ),
        2025,
    ),
)


_TEXT_REPAIRS = {
    "O PERATING BUDGETS": "OPERATING BUDGETS",
    "PROPERTY TA XES": "PROPERTY TAXES",
    "CHA RGES FOR SERV ICES": "CHARGES FOR SERVICES",
    "SOLID WA STE F/ B CONTRIBUTION": "SOLID WASTE F/B CONTRIBUTION",
    "STORMWA TER FEES": "STORMWATER FEES",
    "TOTA L FUNDS": "TOTAL FUNDS",
    "SOLID WA STE": "SOLID WASTE",
    "STORMWA TER MA NA GEMENT": "STORMWATER MANAGEMENT",
    "TOTA L EXPENDITURES": "TOTAL EXPENDITURES",
    "PO SITIO N SUM M ARY": "POSITION SUMMARY",
}


def _clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip().rstrip(" $")
    for damaged, repaired in _TEXT_REPAIRS.items():
        value = value.replace(damaged, repaired)
    return value


def _page_text(source: Source) -> str:
    result = subprocess.run(
        (
            "pdftotext", "-f", str(source.pdf_page), "-l", str(source.pdf_page),
            "-layout", str(ROOT / source.relative_pdf), "-",
        ),
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def _aligned_tokens(
    line: str,
    anchors: list[int],
    complete_token_count: int,
    tolerance: int = 17,
) -> list[tuple[int, int, str, int] | None]:
    candidates = [token for token in raw_tokens(line) if token[1] >= anchors[0] - tolerance]
    # Complete monetary rows are safest by sequence. Dollar signs and proportional
    # fonts make token ends drift between rows in several later books, while the
    # printed left-to-right fiscal-column order is stable. Extra final candidates
    # are the source's biennium-total column and are intentionally not observations.
    if len(candidates) >= complete_token_count:
        return candidates[:len(anchors)]
    selected: list[tuple[int, int, str, int] | None] = []
    used: set[int] = set()
    for anchor in anchors:
        choices = [
            (abs(token[1] - anchor), index, token)
            for index, token in enumerate(candidates)
            if index not in used and abs(token[1] - anchor) <= tolerance
        ]
        if not choices:
            selected.append(None)
            continue
        _distance, index, token = min(choices)
        used.add(index)
        selected.append(token)
    return selected


def _aligned_cells(
    line: str,
    anchors: list[int],
    complete_token_count: int,
    tolerance: int = 17,
) -> list[int | None]:
    return [
        token[3] if token is not None else None
        for token in _aligned_tokens(line, anchors, complete_token_count, tolerance)
    ]


def _label_before_cells(line: str, anchors: list[int], tolerance: int = 17) -> str:
    aligned = [
        (start, end)
        for start, end, _amount in tokens(line)
        if end >= anchors[0] - tolerance
        and min(abs(end - anchor) for anchor in anchors) <= tolerance
    ]
    if not aligned:
        return ""
    return _clean_text(line[:min(start for start, _end in aligned)])


def _row(
    source: Source,
    year: int,
    status: str,
    value: int,
    label: str,
    section: str,
    recovered: bool = False,
) -> dict[str, object]:
    route = (
        "Visually transcribed from the embedded raster table; checked against every "
        "printed subtotal."
        if recovered
        else "Extracted from the official fixed-width page text."
    )
    if status == "ACTUAL" and year == source.starred_actual_year:
        route += " The source marks this ACTUAL column unaudited as of printing."
    return {
        "fiscal_year": year,
        "value": value,
        "status": status,
        "fund_type": "Enterprise Fund",
        "statement_section": section,
        "operating_category": section,
        "original_label": label,
        "source_url": source.url,
        "document_title_version": source.title,
        "pdf_page": source.pdf_page,
        "printed_page": source.printed_page,
        "table_section": TABLE_SECTION,
        "source_code": source.code,
        "ambiguity_flag": "",
        "notes": route,
    }


def _revenue_section(label: str, current_fund: str) -> str:
    upper = label.upper()
    fund = current_fund
    if upper.startswith("SOLID WASTE"):
        fund = "solid_waste"
    elif upper.startswith(("STORMWATER", "STOMWATER")):
        fund = "stormwater"
    if upper.startswith("TOTAL SOLID WASTE"):
        return "total_solid_waste_revenue"
    if upper.startswith("TOTAL STORMWATER"):
        return "total_stormwater_revenue"
    if upper.startswith(("TOTAL FUNDS", "TOTAL REVENUES")):
        return "total_enterprise_revenue"
    if "FUND BALANCE" in upper or "F/B CONTRIBUTION" in upper:
        return f"position_change_{fund}"
    if "OTHER FINANCING SOURCES" in upper:
        return f"financing_{fund}"
    return f"inflow_{fund}"


def _outflow_section(label: str) -> str:
    upper = label.upper()
    if upper.startswith("TOTAL EXPENDITURES") or upper.startswith("TOTAL EXPENSES"):
        return "total_enterprise_expense"
    if upper.startswith("TOTAL STORMWATER"):
        return "total_stormwater_expense"
    if upper.startswith("SOLID WASTE"):
        return "outflow_solid_waste"
    return "outflow_stormwater"


def extract_text_source(
    source: Source,
    page: str | None = None,
    *,
    include_printed_form: bool = False,
) -> list[dict[str, object]]:
    page = _page_text(source) if page is None else page
    lines = page.splitlines()
    table_start = next(
        index for index, line in enumerate(lines)
        if "OPERATING BUDGETS" in _clean_text(line).upper()
    )
    table_lines = lines[table_start:]
    total_line = next(
        line for line in table_lines
        if _clean_text(line).upper().startswith(("TOTAL FUNDS", "TOTAL REVENUES"))
    )
    all_anchors = [end for _start, end, _amount in tokens(total_line)]
    anchors = all_anchors[:len(source.columns)]
    if len(anchors) != len(source.columns):
        raise ValueError(
            f"{source.code}: expected {len(source.columns)} fiscal columns, found {len(anchors)}"
        )

    rows: list[dict[str, object]] = []
    block = ""
    current_fund = "solid_waste"
    for line in table_lines:
        stripped = _clean_text(line)
        upper = stripped.upper()
        if upper.startswith("POSITION SUMMARY"):
            break
        if upper == "REVENUES" or upper.startswith("REVENUES "):
            block = "revenue"
            continue
        if upper in {"EXPENDITURES", "EXPENSES"}:
            block = "outflow"
            continue
        if not block:
            continue
        if upper == "SOLID WASTE":
            current_fund = "solid_waste"
            continue
        if upper == "STORMWATER":
            current_fund = "stormwater"
            continue

        complete_token_count = len(source.columns) + (0 if source.code == "FY2026" else 1)
        cells = _aligned_tokens(line, anchors, complete_token_count)
        values = [cell[3] if cell is not None else None for cell in cells]
        if not any(value is not None for value in values):
            continue
        label = _label_before_cells(line, anchors)
        if not label:
            continue
        section = (
            _revenue_section(label, current_fund)
            if block == "revenue"
            else _outflow_section(label)
        )
        for (year, status), amount, cell in zip(source.columns, values, cells, strict=True):
            if amount is not None:
                row = _row(source, year, status, amount, label, section)
                if include_printed_form and amount == 0:
                    assert cell is not None
                    row["printed_form"] = zero_printed_form(cell[2])
                rows.append(row)
    return rows


def extract_recovery(source: Source, path: Path = RECOVERY_PATH) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            for year, status in source.columns:
                key = f"fy{year}_{status.lower()}"
                rows.append(
                    _row(
                        source,
                        year,
                        status,
                        int(raw[key]),
                        raw["original_label"],
                        raw["statement_section"],
                        recovered=True,
                    )
                )
    return rows


def extract_all() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for source in SOURCES:
        if source.recovery:
            rows.extend(extract_recovery(source))
        else:
            rows.extend(extract_text_source(source))
    return rows


# Exact source-printed subtotal anomaly. The FY2006-07 book's FY2004 ACTUAL
# TOTAL FUNDS omits Property Taxes and Charges for Services even though both are
# printed immediately above it: 3,370,709 + 2,643,084 = 6,013,793.
SOURCE_EXCEPTIONS = {
    ("FY2006-07", 2004, "ACTUAL", "enterprise_revenue"): 6_013_793,
    ("FY2016-17", 2014, "ACTUAL", "enterprise_revenue"): -1,
    ("FY2016-17", 2014, "ACTUAL", "solid_waste_revenue"): -1,
    ("FY2016-17", 2015, "ACTUAL", "stormwater_expense"): 1,
}


def _one(group: list[dict[str, object]], section: str) -> int:
    values = [int(row["value"]) for row in group if row["statement_section"] == section]
    if len(values) != 1:
        raise ValueError(f"expected one {section!r} row, found {len(values)}")
    return values[0]


def validate(rows: list[dict[str, object]]) -> None:
    groups: dict[tuple[str, int, str], list[dict[str, object]]] = {}
    for row in rows:
        key = (str(row["source_code"]), int(row["fiscal_year"]), str(row["status"]))
        groups.setdefault(key, []).append(row)
    expected = {
        (source.code, year, status)
        for source in SOURCES
        for year, status in source.columns
    }
    if set(groups) != expected:
        raise ValueError(f"source-column coverage mismatch: {set(groups) ^ expected}")

    for (source_code, year, status), group in groups.items():
        def check(identity: str, delta: int, message: str) -> None:
            expected_delta = SOURCE_EXCEPTIONS.get((source_code, year, status, identity), 0)
            if delta != expected_delta:
                raise ValueError(
                    f"{source_code} FY{year} {status}: {message}; "
                    f"expected delta {expected_delta:+d}, observed {delta:+d}"
                )

        total_revenue = _one(group, "total_enterprise_revenue")
        revenue_components = sum(
            int(row["value"])
            for row in group
            if row["statement_section"].startswith((
                "inflow_", "financing_", "position_change_",
            ))
        )
        check(
            "enterprise_revenue",
            revenue_components - total_revenue,
            "Enterprise revenue/funding components do not reconcile",
        )

        for fund in ("solid_waste", "stormwater"):
            subtotal_rows = [
                row for row in group
                if row["statement_section"] == f"total_{fund}_revenue"
            ]
            if not subtotal_rows:
                continue
            subtotal = int(subtotal_rows[0]["value"])
            components = sum(
                int(row["value"])
                for row in group
                if row["statement_section"] in {
                    f"inflow_{fund}", f"financing_{fund}", f"position_change_{fund}",
                }
            )
            check(f"{fund}_revenue", components - subtotal, f"{fund} funding does not reconcile")

        storm_detail = sum(
            int(row["value"])
            for row in group
            if row["statement_section"] == "outflow_stormwater"
        )
        storm_totals = [
            int(row["value"])
            for row in group
            if row["statement_section"] == "total_stormwater_expense"
        ]
        if storm_totals:
            check("stormwater_expense", storm_detail - storm_totals[0], "Stormwater expenses do not reconcile")
            storm_expense = storm_totals[0]
        else:
            storm_expense = storm_detail
        solid_expense = sum(
            int(row["value"])
            for row in group
            if row["statement_section"] == "outflow_solid_waste"
        )
        total_expense = _one(group, "total_enterprise_expense")
        check(
            "enterprise_expense",
            solid_expense + storm_expense - total_expense,
            "Enterprise expenses do not reconcile",
        )


def write(rows: list[dict[str, object]], path: Path = OUTPUT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_flow_differences(
    rows: list[dict[str, object]],
    path: Path = DIFFERENCE_PATH,
) -> None:
    """Record the source-printed revenue/funding less expense difference.

    Enterprise actuals are operating-budget comparisons, not fund-balance
    roll-forwards. A nonzero actual difference is therefore evidence to expose,
    not an amount this extractor should force into a missing position statement.
    """
    groups: dict[tuple[str, int, str], list[dict[str, object]]] = {}
    for row in rows:
        key = (str(row["source_code"]), int(row["fiscal_year"]), str(row["status"]))
        groups.setdefault(key, []).append(row)
    output = []
    for (source_code, year, status), group in sorted(groups.items()):
        revenue = _one(group, "total_enterprise_revenue")
        expense = _one(group, "total_enterprise_expense")
        difference = revenue - expense
        if (source_code, year, status) == ("FY2006-07", 2004, "ACTUAL"):
            classification = "source_total_exception"
            note = (
                "Printed TOTAL FUNDS omits the printed Property Taxes and Charges for "
                "Services components; exact component delta is $6,013,793."
            )
        elif status == "BUDGET" and difference:
            classification = "budget_source_exception"
            note = (
                "The source-printed budget funding total differs from its expense total; "
                "values are preserved without correction."
            )
        elif difference:
            classification = "actual_or_projected_variance"
            note = (
                "Operating-budget comparison variance; the page does not print beginning "
                "and ending fund balance positions."
            )
        else:
            classification = "balanced"
            note = "Source-printed funding and expense totals are equal."
        output.append({
            "source_code": source_code,
            "fiscal_year": year,
            "status": status,
            "total_revenue_and_funding": revenue,
            "total_expenses": expense,
            "difference": difference,
            "classification": classification,
            "note": note,
        })
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=output[0].keys(), lineterminator="\n")
        writer.writeheader()
        writer.writerows(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate committed output")
    args = parser.parse_args()
    if args.check:
        with OUTPUT_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    else:
        rows = extract_all()
    validate(rows)
    if not args.check:
        write(rows)
        write_flow_differences(rows)
    print(f"validated {len(rows)} observations across {sum(len(source.columns) for source in SOURCES)} source columns")


if __name__ == "__main__":
    main()
