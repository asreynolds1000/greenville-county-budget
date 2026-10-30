"""Emit audited General Fund observations for the years the model does not yet carry.

The frozen blind extraction holds audited results for FY2019, FY2021 and FY2023-FY2025 only.
Everything else this project knows about audited years lives in
`general_fund_audited_series.csv`, which is reconciled but not modelled, so twelve of fifteen
years would render comparison bars with no headline plan-versus-result equation above them.

This writes the missing years into `data/production/observations/` in the observation schema,
ingested alongside the frozen extraction rather than edited into it. The blind extraction
stays exactly as extracted; that is the point of freezing it.

Run:  python3 -m scripts.curation.gen_audited_observations

## The Note 1-D adjustment

FY2011 through FY2017 do not satisfy `beginning + net change = ending`. Those years print an
explicit "Adjustment: Budget to GAAP basis (Note 1-D)" line reconciling the budget-basis
result to the GAAP fund balance, and without it as a term the statement is short by between
$48,397 and $1,080,312 depending on the year. It is emitted as its own observation against
its own entity so the statement reconciles honestly, rather than being folded into the net
change where it would silently misstate what the county reported as its result.

From FY2018 the adjustment is zero in every year, so no row is emitted and the equation
reduces to the simple form.
"""

from __future__ import annotations

import csv
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DATA = _ROOT / "data" / "production"
_BLIND = _ROOT / "audit" / "blind-extraction"
_RESEARCH = _ROOT / "research" / "fy2025-budget-actual"

OUT_DIR = _DATA / "observations"
OUT = OUT_DIR / "general-fund-audited-series-extension.csv"

# What the frozen blind extraction already holds, as (fiscal_year, printed label) pairs.
#
# Skipping by YEAR was wrong and cost four years of drivers: the frozen file carries only the
# three position measures for FY2019, FY2021, FY2023 and FY2024, and all seven for FY2025.
# Skipping those years wholesale meant their flow measures were never emitted, so the
# budget-versus-actual breakdown could not render for them even though the data existed.
def _already_modelled() -> set[tuple[str, str]]:
    return {
        (r["fiscal_year"], r["original_label"])
        for r in _read(_BLIND / "general-fund-audited-results.csv")
    }

TABLE_SECTION = "General Fund Budget and Actual"

# measure -> the label the county prints, which label_map.csv resolves to an entity.
MEASURE_LABELS = {
    "fund_balance_beginning": "Fund balance, beginning of year",
    "net_change": "Net change in fund balances",
    "fund_balance_ending": "Fund balance, end of year",
    "budget_to_gaap_adjustment": "Adjustment: Budget to GAAP basis (Note 1-D)",
    "total_revenues": "Total revenues",
    "total_expenditures": "Total expenditures",
    "transfers_in": "Transfers in",
    "transfers_out": "Transfers out",
}

FIELDS = [
    "fiscal_year", "value", "status", "original_label", "source_url",
    "document_title_version", "pdf_page", "printed_page", "table_section",
    "source_code", "ambiguity_flag", "notes",
]


def _read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def _int(value: str | None) -> int | None:
    s = (value or "").strip()
    if not s or not s.lstrip("-").isdigit():
        return None
    return int(s)


def main() -> int:
    series: dict[str, dict[str, int | None]] = {}
    for row in _read(_DATA / "general_fund_audited_series.csv"):
        series.setdefault(row["fiscal_year"], {})[row["measure"]] = _int(row["actual"])

    registry = {r["source_code"]: r for r in _read(_BLIND / "official-source-registry.csv")}
    comparison = _read(_DATA / "general_fund_budget_actual_comparison.csv")
    # Source metadata and page cites already resolved, per year, by the comparison build.
    meta: dict[str, dict] = {}
    for row in comparison:
        meta.setdefault(row["fiscal_year"], row)

    offsets = {
        r["fiscal_year"]: int(r["offset"])
        for r in _read(_RESEARCH / "printed-page-offsets.csv")
    }
    schedule_pages = {
        r["fiscal_year"]: {
            "first": int(r["first_pdf_page"]),
            "last": int(r["section_last_pdf_page"]),
        }
        for r in _read(_RESEARCH / "printed-page-offsets.csv")
    }
    summary_pages = {
        r["fiscal_year"]: {
            "pdf": int(r["pdf_page"]),
            "printed": int(r["printed_page"]),
        }
        for r in _read(_RESEARCH / "basic-statement-totals.csv")
        if r["measure"] == "total_revenues"
    }

    already = _already_modelled()

    rows: list[dict] = []
    for year in sorted(series):
        year_meta = meta.get(year)
        if year_meta is None:
            raise ValueError(f"FY{year} has no comparison row to take source metadata from")

        source_code = year_meta["source_code"]
        known = registry.get(source_code)
        title = (
            known["document_title_version"] if known
            else year_meta["document_title_version"]
        )
        if year not in schedule_pages or year not in offsets:
            raise ValueError(f"FY{year} lacks verified detailed-schedule page metadata")
        for measure, label in MEASURE_LABELS.items():
            if (year, label) in already:
                continue
            value = series[year].get(measure)
            if value is None:
                continue
            # From FY2018 the budget-to-GAAP adjustment is zero every year. Emitting a zero
            # observation would assert the county printed a nil line, which it did not.
            if measure == "budget_to_gaap_adjustment" and value == 0:
                continue
            # Revenue heads the detailed schedule. Expenditures and transfers close it.
            # The annual budget-and-actual statement carries the fund-balance bridge,
            # including beginning/end positions, net change, and the Note 1-D adjustment.
            pages = schedule_pages.get(year)
            closing_flow = {
                "total_expenditures",
                "transfers_in",
                "transfers_out",
            }
            position_measures = {
                "fund_balance_beginning",
                "net_change",
                "fund_balance_ending",
                "budget_to_gaap_adjustment",
            }
            if measure in position_measures:
                summary = summary_pages.get(year)
                if summary is None:
                    raise ValueError(f"FY{year} lacks verified budget-and-actual statement page metadata")
                pdf_page = summary["pdf"]
                printed_page = summary["printed"]
                note = "Audited General Fund budget-basis statement, including its fund-balance bridge."
            else:
                page_key = "last" if measure in closing_flow else "first"
                pdf_page = pages[page_key]
                printed_page = pdf_page - offsets[year]
                note = "Audited General Fund result on the budget basis."
            rows.append({
                "fiscal_year": year,
                "value": value,
                "status": "ACTUAL",
                "original_label": label,
                "source_url": year_meta["source_url"],
                "document_title_version": title,
                "pdf_page": pdf_page or "",
                "printed_page": printed_page if printed_page is not None else "",
                "table_section": TABLE_SECTION,
                "source_code": source_code,
                "ambiguity_flag": "",
                "notes": note,
            })

    rows.sort(key=lambda r: (int(r["fiscal_year"]), list(MEASURE_LABELS.values()).index(r["original_label"])))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    years = sorted({r["fiscal_year"] for r in rows})
    adjustments = sum(1 for r in rows if "Note 1-D" in r["original_label"])
    print(f"wrote {len(rows)} observations across {len(years)} years: {years[0]}-{years[-1]}")
    print(f"  Note 1-D adjustment rows (FY2011-FY2017 only): {adjustments}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
