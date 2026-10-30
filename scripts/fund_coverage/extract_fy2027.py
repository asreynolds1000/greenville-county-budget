"""Extract only FY2027 from the hash-verified final book, preserving comparisons.

General Fund tables follow the frozen overview/appropriations/consolidated
routes. The other funds use their existing production extractors. This narrow
entry point never rewrites the frozen extraction or an earlier year's rows.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import subprocess
from dataclasses import replace
from pathlib import Path

from scripts.blind_extract.table_numbers import raw_tokens, year_tokens, zero_printed_form
from scripts.fund_coverage import extract_debt_service as debt
from scripts.fund_coverage import extract_enterprise as enterprise
from scripts.fund_coverage import extract_special_revenue as sr
from scripts.production.ingest import observation_id

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "data/raw/gc-fy2027/BudgetCombined.pdf"
SHA256 = "d315174a853c4a8fbadae93b6f6901a34e54a0be517efe6b64bf3152bf556b4a"
DATASET = "fy2027-adopted-budget"
OUTPUT = ROOT / "data/production/observations" / f"{DATASET}.csv"
URL = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2027/BudgetCombined.pdf"
TITLE = "County of Greenville Budget Document Fiscal Year 2027"
FIELDS = (
    "fiscal_year", "value", "status", "fund_type", "statement_section",
    "operating_category", "original_label", "source_url", "document_title_version",
    "pdf_page", "printed_page", "table_section", "source_code", "ambiguity_flag",
    "notes", "included_in_reported_total_budget", "treatment_note",
)


def row(cell, label, page, section, status, **extra):
    result = dict(
        fiscal_year=2027, value=cell[3], status=status, original_label=label,
        source_url=URL, document_title_version=TITLE, pdf_page=page,
        printed_page=page - 1, table_section=section, source_code="FY2027",
        ambiguity_flag="", notes="Extracted from the hash-verified final FY2027 book.",
        **extra,
    )
    if cell[3] == 0:
        result["printed_form"] = zero_printed_form(cell[2])
    return result


def general_rows(pages):
    rows = []
    page = pages[35]
    total = next(line for line in page.splitlines() if "TOTAL BUDGET" in line)
    anchors = [cell[1] for cell in raw_tokens(total)]
    fund = ""
    for line in page.splitlines():
        heading = line.strip()
        if heading in {
            "GENERAL FUND BUDGET", "SPECIAL REVENUE FUND", "DEBT SERVICE FUND",
            "ENTERPRISE FUND", "INTERNAL SERVICE FUND",
        }:
            fund = heading.removesuffix(" BUDGET").title()
        cells = sr._aligned_tokens(line, anchors, tolerance=10)
        if not fund or cells[2] is None:
            continue
        label = sr._label_before_cells(line, anchors, tolerance=10)
        if not label or label.startswith(("FY20", "Fiscal Year")):
            continue
        if fund in {"Debt Service Fund", "Enterprise Fund"} and not label.startswith("TOTAL "):
            # The existing overview route publishes these fund totals only;
            # their statement detail comes from the separate extraction routes.
            continue
        extra = {"fund_type": "Whole Budget" if label == "TOTAL BUDGET" else fund}
        if label.startswith("TOTAL ") and label != "TOTAL OPERATING BUDGET":
            extra["included_in_reported_total_budget"] = "no" if fund == "Internal Service Fund" else "yes"
        rows.append(row(
            cells[2], label, 36, "Budget Expenditure Overview", "ADOPTED BUDGET",
            **extra,
        ))

    page = pages[57]
    header = next(line for line in page.splitlines() if all(f"FY{year}" in line for year in (2025, 2026, 2027)))
    positions = [header.index(f"FY{year}") for year in (2025, 2026, 2027)]
    category = ""
    for line in page.splitlines()[page.splitlines().index(header) + 1:]:
        if line.strip().startswith(("* FY", "Fiscal Year")):
            break
        cells = year_tokens(line, positions, [0, 1, 2], 4)
        if not raw_tokens(line):
            heading = line.strip()
            if heading and heading.upper() == heading:
                category = heading
            continue
        if not category or cells[2] is None:
            continue
        first = next((cell for cell in cells if cell), None)
        label = re.sub(r"\s+", " ", line[:first[0]]).strip().rstrip(" $")
        if label:
            rows.append(row(cells[2], label, 58, "General Fund Appropriations Summary", "BUDGET", operating_category=category))

    page = pages[36]
    total = next(line for line in page.splitlines() if "Total Estimated Financial Sources" in line)
    anchors = [cell[1] for cell in raw_tokens(total)]
    phase = ""
    for line in page.splitlines():
        label = sr._label_before_cells(line, anchors, tolerance=12)
        if line.strip() == "Financial Sources":
            phase = "revenue"
        elif line.strip() == "Expenditures":
            phase = ""
        elif line.strip() == "Other Financing Sources and Uses" or label.startswith("Net Increase"):
            phase = "financing"
        cell = sr._aligned_tokens(line, anchors, tolerance=12)[0]
        if not phase or cell is None or not label:
            continue
        if phase == "revenue" and label not in {
            "Property Taxes", "County Offices/Fees", "Intergovernmental", "Other",
            "Total Estimated Financial Sources",
        }:
            # Other funds' row headings carry structural dashes in this column.
            continue
        # Match the existing General Fund route: unused financing dashes are
        # omitted; printed beginning/change/ending position rows are retained.
        if phase == "financing" and not label.startswith(("Transfers", "Total Other", "Net Increase", "Fund Balance")):
            continue
        status = "ESTIMATED" if phase == "revenue" or label.startswith(("Fund Balance", "Net Increase")) else "BUDGETED FINANCING"
        rows.append(row(cell, label, 37, "Consolidated Fund Summary", status))

    page = pages[56]
    header = next(line for line in page.splitlines() if all(f"FY{year}" in line for year in (2025, 2026, 2027)))
    positions = [header.index(f"FY{year}") for year in (2025, 2026, 2027)]
    in_other = False
    for line in page.splitlines():
        if line.strip() == "OTHER REVENUE":
            in_other = True
            continue
        if "TOTAL OTHER REVENUE" in line:
            break
        if in_other:
            cells = year_tokens(line, positions, [0, 1, 2], 4)
            if cells[2] is not None:
                label = re.sub(r"\s+", " ", line[:cells[0][0]]).strip().rstrip(" $")
                rows.append(row(cells[2], label, 57, "General Fund Revenue Summary", "ESTIMATED"))

    page = pages[131]
    total = next(line for line in page.splitlines() if "TOTAL TRANSFERS FROM OTHER FUNDS" in line)
    anchors = [cell[1] for cell in raw_tokens(total)]
    in_from = False
    for line in page.splitlines():
        if line.strip() == "GENERAL FUND TRANSFERS FROM:":
            in_from = True
            continue
        if in_from:
            label = sr._label_before_cells(line, anchors)
            cell = sr._aligned_tokens(line, anchors)[-1]
            if label in {"Hospitality Tax", "Accommodations Tax", "Infrastructure Bank", "Workers Compensation"} and cell:
                rows.append(row(cell, label, 132, "General Fund Transfers From", "BUDGETED FINANCING"))
    return rows


def extract():
    if hashlib.sha256(PDF.read_bytes()).hexdigest() != SHA256:
        raise ValueError("FY2027 source hash changed; stop and review the edition")
    pages = subprocess.check_output(["pdftotext", "-layout", str(PDF), "-"], text=True).split("\f")
    rows = general_rows(pages)
    for module in (sr, debt):
        source = replace(
            next(source for source in module.SOURCES if source.code == "FY2026"),
            code="FY2027", relative_pdf="data/raw/gc-fy2027/BudgetCombined.pdf",
            url=URL, title=TITLE, years=(2025, 2026, 2027),
            statuses=("ACTUAL", "ACTUAL", "BUDGET"), starred_year=2026,
        )
        rows.extend(r for r in module.extract_text_source(source, include_printed_form=True) if r["fiscal_year"] == 2027)
    source = replace(
        next(source for source in enterprise.SOURCES if source.code == "FY2026"),
        code="FY2027", relative_pdf="data/raw/gc-fy2027/BudgetCombined.pdf",
        url=URL, title=TITLE,
        columns=((2025, "BUDGET"), (2025, "ACTUAL"), (2026, "BUDGET"), (2026, "ACTUAL"), (2027, "BUDGET")),
        starred_actual_year=2026,
    )
    rows.extend(r for r in enterprise.extract_text_source(source, include_printed_form=True) if r["fiscal_year"] == 2027)
    return rows


def main():
    rows = extract()
    with OUTPUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, FIELDS, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    path = ROOT / "data/production/printed_cell_forms.csv"
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        existing = [r for r in reader if r["source_dataset"] != DATASET]
    for ordinal, r in enumerate(rows):
        if r["value"] == 0:
            existing.append(dict(
                observation_id=observation_id(DATASET, ordinal), source_dataset=DATASET,
                source_row_ordinal=ordinal, echo_fiscal_year=2027,
                echo_original_label=r["original_label"], echo_value=0,
                source_code="FY2027", pdf_page=r["pdf_page"], table_section=r["table_section"],
                printed_form=r["printed_form"], review_status="machine_classified",
                classification_method="fixed_width_token",
                review_note="Raw monetary token re-read from the hash-verified source page.",
            ))
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing)
    print(f"Extracted {len(rows)} FY2027 observations; earlier-year inputs preserved")


if __name__ == "__main__":
    main()
