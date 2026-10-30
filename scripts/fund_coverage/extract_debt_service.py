#!/usr/bin/env python3
"""Extract and reconcile recent Debt Service summary statements."""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.blind_extract.table_numbers import tokens  # noqa: E402
from scripts.fund_coverage.extract_special_revenue import (  # noqa: E402
    OUTPUT_COLUMNS,
    Source,
    _aligned_tokens,
    _label_before_cells,
)
from scripts.blind_extract.table_numbers import zero_printed_form  # noqa: E402
from scripts.fund_coverage.summary_validation import (  # noqa: E402
    SummaryLabels,
    validate_summary,
)


TABLE_SECTION = "Debt Service Fund Summary of Estimated Financial Sources and Uses"
OUTPUT_PATH = ROOT / "data/production/observations/debt-service-summary.csv"
RECOVERY_PATH = ROOT / "research/fund-coverage/fy2020-2023-debt-service-raster-recovery.csv"
LABELS = SummaryLabels(
    operating_result="Excess (deficiency) of revenues over(under) expenditures",
    ending_position="Fund Balance June 30",
    source_exceptions={("FY2014-15", 2012, "inflow"): -1},
)

SOURCES = (
    Source(
        "FY2012-13",
        "data/raw/gc-fy2012-2013/budget_combined2012.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/budget_combined2012.pdf",
        "County of Greenville Operating and Capital Budget Fiscal Years 2012 and 2013",
        54,
        46,
        (2010, 2011, 2012, 2013),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2011,
    ),
    Source(
        "FY2014-15",
        "data/raw/gc-fy2014-2015/budget_combined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2014/budget_combined.pdf",
        "County of Greenville Budget Document Fiscal Years 2014 and 2015",
        51,
        51,
        (2012, 2013, 2014, 2015),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2013,
    ),
    Source(
        "FY2016-17",
        "data/raw/gc-fy2016-2017/budget_combined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf",
        "County of Greenville Budget Document Fiscal Years 2016 and 2017",
        50,
        50,
        (2014, 2015, 2016, 2017),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2015,
    ),
    Source(
        "FY2018-19",
        "data/raw/gc-fy2018-2019/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2018 and 2019",
        50,
        50,
        (2016, 2017, 2018, 2019),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2017,
    ),
    Source(
        "FY2020-21",
        "data/raw/gc-fy2020-2021/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2019/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2020 and 2021",
        52,
        52,
        (2018, 2019, 2020, 2021),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2019,
    ),
    Source(
        "FY2022-23",
        "data/raw/gc-fy2022-2023/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2022/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2022 and 2023",
        52,
        51,
        (2020, 2021, 2022, 2023),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2021,
    ),
    Source(
        "FY2024-25",
        "data/raw/gc-fy2024-2025/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2024/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Years 2024 and 2025",
        50,
        49,
        (2022, 2023, 2024, 2025),
        ("ACTUAL", "ACTUAL", "BUDGET", "BUDGET"),
        2023,
    ),
    Source(
        "FY2026",
        "data/raw/gc-fy2026/BudgetCombined.pdf",
        "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf",
        "County of Greenville Budget Document Fiscal Year 2026",
        49,
        48,
        (2024, 2025, 2026),
        ("ACTUAL", "ACTUAL", "BUDGET"),
        2025,
    ),
)


def _page_text(source: Source) -> str:
    return subprocess.run(
        (
            "pdftotext",
            "-f",
            str(source.pdf_page),
            "-l",
            str(source.pdf_page),
            "-layout",
            str(ROOT / source.relative_pdf),
            "-",
        ),
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def _row(
    source: Source,
    year: int,
    status: str,
    value: int,
    label: str,
    statement_section: str,
    recovered: bool = False,
) -> dict[str, object]:
    if recovered:
        provenance = (
            "Visually transcribed from the embedded raster table; checked against "
            "the printed subtotals and all three statement identities."
        )
    else:
        provenance = "Extracted from the official fixed-width page text."
    if year == source.starred_year:
        provenance += " The source marks this ACTUAL column unaudited as of printing."
    return {
        "fiscal_year": year,
        "value": value,
        "status": status,
        "fund_type": "Debt Service Fund",
        "statement_section": statement_section,
        "operating_category": statement_section,
        "original_label": label,
        "source_url": source.url,
        "document_title_version": source.title,
        "pdf_page": source.pdf_page,
        "printed_page": source.printed_page,
        "table_section": TABLE_SECTION,
        "source_code": source.code,
        "ambiguity_flag": "",
        "notes": provenance,
    }


def extract_text_source(
    source: Source,
    page: str | None = None,
    *,
    include_printed_form: bool = False,
) -> list[dict[str, object]]:
    page = _page_text(source) if page is None else page
    lines = page.splitlines()
    total_line = next(line for line in lines if "Total Estimated Financial Sources" in line)
    anchors = [end for _start, end, _value in tokens(total_line)]
    if len(anchors) != len(source.years):
        raise ValueError(f"{source.code}: expected {len(source.years)} year columns, found {len(anchors)}")

    rows: list[dict[str, object]] = []
    section = ""
    in_table = False
    for line in lines:
        stripped = re.sub(r"\s+", " ", line).strip()
        if stripped.startswith(("* FY", "* Transfers")) or re.match(r"FY\d{4} actual", stripped):
            break
        if stripped == "Financial Sources":
            section = "inflow"
            in_table = True
            continue
        if not in_table:
            continue
        if stripped == "Expenditures":
            section = "outflow"
            continue
        if stripped.startswith("Excess (deficiency) of revenues"):
            section = "operating_result"
        elif stripped == "Other Financing Sources and Uses":
            section = "financing"
            continue
        elif stripped.startswith("Net Increase"):
            section = "net_position_change"
        elif stripped.startswith("Fund Balance July 1"):
            section = "position"
        elif stripped.startswith("Fund Balance June 30"):
            section = "position"

        cells = _aligned_tokens(line, anchors)
        values = [cell[3] if cell is not None else None for cell in cells]
        if not any(value is not None for value in values):
            continue
        label = _label_before_cells(line, anchors)
        if section == "operating_result":
            label = LABELS.operating_result
        elif section == "net_position_change":
            label = "Net Increase (Decrease) in Fund Balance"
        elif label.startswith("Total Estimated Financial Sources"):
            label = "Total Estimated Financial Sources"
        elif section == "outflow" and not label and all(value is not None for value in values):
            # FY2012-13 and FY2014-15 print the ruled expenditure-total row without
            # repeating its label. Its position after the final detail line and its four
            # underlined values make the role explicit; keep the anomaly in research notes.
            label = "Total Expenditures"
        if not label:
            continue
        for year, status, value, cell in zip(
            source.years, source.statuses, values, cells, strict=True
        ):
            if value is not None:
                row = _row(source, year, status, value, label, section)
                if include_printed_form and value == 0:
                    assert cell is not None
                    row["printed_form"] = zero_printed_form(cell[2])
                rows.append(row)
    return rows


def extract_recovery(source: Source, path: Path = RECOVERY_PATH) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            for year, status in zip(source.years, source.statuses, strict=True):
                rows.append(
                    _row(
                        source,
                        year,
                        status,
                        int(raw[f"fy{year}"]),
                        raw["original_label"],
                        raw["statement_section"],
                        recovered=True,
                    )
                )
    return rows


def extract_all() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for source in SOURCES:
        if source.code == "FY2022-23":
            rows.extend(extract_recovery(source))
        else:
            rows.extend(extract_text_source(source))
    return rows


def validate(rows: list[dict[str, object]]) -> None:
    validate_summary(rows, SOURCES, LABELS)


def write(rows: list[dict[str, object]], path: Path = OUTPUT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate committed output without extracting PDFs")
    args = parser.parse_args()
    if args.check:
        with OUTPUT_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
    else:
        rows = extract_all()
    validate(rows)
    if not args.check:
        write(rows)
    print(f"validated {len(rows)} observations across {sum(len(source.years) for source in SOURCES)} source-year statements")


if __name__ == "__main__":
    main()
