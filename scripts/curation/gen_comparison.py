"""Generate the General Fund budget-versus-actual comparison dataset, FY2011-FY2025.

Regenerates `data/production/general_fund_budget_actual_comparison.csv` from the frozen
detailed-schedule inputs. Idempotent: run it twice, get the same bytes.

Run:  python3 -m scripts.curation.gen_comparison

## The gate that governs this script

FY2025 already existed in this file, curated separately and owner-reviewed, and its values
are rendered on a page that has passed owner review. **The FY2025 rows this script emits must
be identical to the ones already committed.** If they are not, the script is wrong, not the
existing file, and it refuses to write. That check is what makes it safe to trust the other
fourteen years, which nobody has reviewed by eye.

## Decisions this script implements

**`budget` is the ACFR final budget**, not the adopted budget-book figure. The comparison view
answers "what did the county end up authorising, and what did it spend," which is the
question the audited variance column answers. The adopted budget-book series stays separate
and is not replaced by this.

**`contribution`** is `actual - budget` for revenue and `budget - actual` for spending, so a
positive number always means the line moved the fund balance up relative to plan. Verified to
reproduce all 14 existing FY2025 rows exactly.

**Three label columns, because one cannot do the job.** The county's own wording drifts inside
a single page: a section headed "Community development and planning" is closed by "Total
community and development planning", and "Elected officials - Law enforcement" is closed with
a lowercase "law". FY2019 adds a trailing colon; FY2025 prints "Elected officials - law
enforcement:" where the owner-reviewed page reads "Law enforcement". Six independent blind
readers found that drift separately, so it is the county's, not ours.

- `source_label` is exactly what the county printed that year. Never tidied. It is what a
  reader checking the cited page will see, and it is what makes the citation honest.
- `label` is the display name, stable across years, taken from `canonical_key`. This is what
  a resident reads, and it is what the owner-reviewed FY2025 page already shows.
- `canonical_key` (from `department-crosswalk.csv`) is the join key that carries a series
  across the ~FY2013 reorganisation.

The first attempt used the printed label as the display label and the FY2025 gate caught it
immediately: seven of ten departments would have silently changed on an already-reviewed
page. Emitting only a tidied label would misquote the source; emitting only the printed label
would both break the series and change reviewed output. Keeping all three is the only option
that neither misquotes nor drifts.

**Page citations come from the fidelity audit.** Every department total in every year was
re-read from the PDF by a blind agent that recorded the page it read, so these cites are
verified rather than inferred.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DATA = _ROOT / "data" / "production"
_RESEARCH = _ROOT / "research" / "fy2025-budget-actual"
_READS = _RESEARCH / "fidelity-reads"

OUT = _DATA / "general_fund_budget_actual_comparison.csv"

# The owner-reviewed FY2025 rows, frozen. The gate MUST read this and not OUT: a check that
# reads the file it is about to overwrite validates against its own previous output, so the
# reviewed baseline disappears the first time the script runs and every run after that
# passes trivially. Same failure shape as a validator whose inputs live in a temp directory.
BASELINE = _DATA / "baselines" / "fy2025_comparison_owner_reviewed.csv"

FIELDS = [
    "fiscal_year",
    "section",
    "label",
    "source_label",
    "canonical_key",
    # `original_budget` sits before `budget` because that is the order the money moved:
    # adopted first, amended second. `budget` keeps its name — it is the ACFR final budget
    # and is the field the owner-reviewed FY2025 baseline carries, so renaming it would
    # break the gate that protects the reviewed page.
    "original_budget",
    "budget",
    "actual",
    "contribution",
    "source_code",
    "document_title_version",
    "source_url",
    "pdf_page",
    "printed_page",
]

# Display names, stable across years, keyed by canonical_key. These reproduce the labels on
# the owner-reviewed FY2025 page; the county's printed wording for the same rows is kept
# verbatim in `source_label`.
DISPLAY_NAMES = {
    "administrative_services": "Administrative services",
    "general_services": "General services",
    "community_development_planning": "Community development and planning",
    "public_safety": "Public safety",
    "emergency_medical_services": "Emergency medical services",
    "judicial_services": "Judicial services",
    "fiscal_services": "Fiscal services",
    "law_enforcement": "Law enforcement",
    "boards_commissions_others": "Boards, commissions and others",
    "debt_service": "Debt service",
    "human_resources": "Human resources",
    "public_works": "Public works",
}

# Revenue categories drift the same way departments do: "Intergovernmental" in seven years
# and "Intergovernmental revenues" in seven others. FY2012 is worse -- its printed category
# header was lost in the county's own book and the rows sit under the sub-group heading
# "State of South Carolina:", the label damage METHODOLOGY sec.11 records. Mapping it here
# gives that year a correct display label and a joinable key while `source_label` still
# carries the damaged heading a reader will see on the cited page.
REVENUE_KEYS = {
    "Property taxes": ("property_taxes", "Property taxes"),
    "County offices": ("county_offices", "County offices"),
    "Intergovernmental": ("intergovernmental", "Intergovernmental"),
    "Intergovernmental revenues": ("intergovernmental", "Intergovernmental"),
    "State of South Carolina:": ("intergovernmental", "Intergovernmental"),
    "Other revenues": ("other_revenues", "Other revenues"),
}

# See research/fy2025-budget-actual/source-anomalies.md A1. The county omitted this total;
# it is stored absent and derived from its printed children.
DERIVED_TOTALS = {("2018", "Public safety")}


def _read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def _money(value: str | None) -> int | None:
    s = (value or "").strip()
    if s in ("", "-"):
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").strip()
    try:
        n = int(s)
    except ValueError:
        return None
    return -n if negative else n


def _crosswalk() -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for r in _read(_RESEARCH / "department-crosswalk.csv"):
        out[(r["fiscal_year"], r["source_department"].strip())] = r["canonical_key"]
    return out


def _page_cites() -> tuple[dict[tuple[str, str], int], dict[str, int]]:
    """Page cites recorded by the blind fidelity readers.

    Returns (department pages keyed by year and department, revenue-detail page by year).
    Revenue detail opens the detailed schedule, so the lowest page a sampled revenue subline
    was read from is that year's revenue page.
    """
    cites: dict[tuple[str, str], int] = {}
    revenue_pages: dict[str, int] = {}
    for read_path in sorted(_READS.glob("fy20*-read.json")):
        sample_path = read_path.with_name(read_path.name.replace("-read", "-sample"))
        if not sample_path.exists():
            continue
        spec = {s["id"]: s for s in json.loads(sample_path.read_text())}
        data = json.loads(read_path.read_text())
        year = str(data["year"])
        for cell in data.get("cells", []):
            s = spec.get(cell["id"], {})
            if not cell.get("pdf_page"):
                continue
            page = int(cell["pdf_page"])
            if s.get("level") == "department_total":
                cites[(year, s["department"])] = page
            elif s.get("level") == "revenue_subline":
                revenue_pages[year] = min(revenue_pages.get(year, page), page)
    return cites, revenue_pages


# The county renamed the document from Comprehensive Annual Financial Report to Annual
# Comprehensive Financial Report (GFOA dropped the old acronym in 2021). Titles follow the
# designation recorded per year in research/sources.csv, formatted to the convention the
# production source registry already uses for the years it covers.
#
# FY2021 is a known discrepancy: research/sources.csv designates it ACFR while the frozen
# production registry titles it "Comprehensive Annual Financial Report". The registry entry
# is existing reviewed production data, so it is left alone rather than edited on an
# assumption, and `_source_meta` defers to it. Resolving it needs the FY2021 title page.
_TITLE = {
    "CAFR": "Greenville County Comprehensive Annual Financial Report for the Fiscal Year Ended June 30 {year}",
    "ACFR": "Greenville County Annual Comprehensive Financial Report for the Fiscal Year Ended June 30 {year}",
}


def _registry() -> dict[str, dict]:
    """The frozen production source registry, which wins wherever it has an entry."""
    path = _ROOT / "audit" / "blind-extraction" / "official-source-registry.csv"
    return {r["source_code"]: r for r in _read(path)}


def _sources() -> dict[str, dict]:
    """Per-year source metadata in the production convention, not the research shorthand.

    The comparison dataset is a presentation dataset with its own committed schema; the
    reviewed FY2025 rows use `FY2025-ACFR` and the full formal title, so every other year
    must be built the same way or the file would carry two naming schemes.
    """
    registry = _registry()
    out: dict[str, dict] = {}
    for r in _read(_RESEARCH / "sources.csv"):
        year = r["fiscal_year"]
        code = f"FY{year}-ACFR"
        designation = "ACFR" if " ACFR " in f" {r['document']} " else "CAFR"
        title = _TITLE[designation].format(year=year)
        known = registry.get(code)
        if known:
            title = known["document_title_version"]
        out[year] = {
            "source_code": code,
            "document": title,
            "source_url": r["source_url"],
        }
    return out


def _offsets() -> dict[str, int]:
    """printed_page = pdf_page - offset, verified per year against page footers."""
    path = _RESEARCH / "printed-page-offsets.csv"
    if not path.exists():
        return {}
    return {
        r["fiscal_year"]: int(r["offset"])
        for r in _read(path)
        if (r.get("offset") or "").strip().lstrip("-").isdigit()
    }


def _baseline_pages() -> dict[tuple[str, str], tuple[str, str]]:
    """FY2025 page cites, which live only in the owner-reviewed baseline.

    FY2025 was verified by dual independent extraction rather than by the fidelity audit, so
    the audit's per-department page records do not cover it.
    """
    out: dict[tuple[str, str], tuple[str, str]] = {}
    for r in _read(BASELINE):
        out[(r["fiscal_year"], r["label"])] = (r["pdf_page"], r["printed_page"])
    return out


def build_rows() -> list[dict]:
    exp = _read(_DATA / "general_fund_detailed_expenditure.csv")
    rev = _read(_DATA / "general_fund_detailed_revenue.csv")
    crosswalk = _crosswalk()
    cites, revenue_pages = _page_cites()
    sources = _sources()
    offsets = _offsets()
    baseline_pages = _baseline_pages()

    children: dict = defaultdict(lambda: defaultdict(int))
    for r in exp:
        if r["subdepartment"] and not r["object"]:
            for c in ("original_budget", "final_budget", "actual"):
                children[(r["fiscal_year"], r["department"])][c] += _money(r[c]) or 0

    rows: list[dict] = []

    def emit(year, section, source_label, budget, actual, page, original_budget=None):
        src = sources.get(year, {})
        offset = offsets.get(year)
        contribution = (actual - budget) if section == "revenue_categories" else (budget - actual)
        key = crosswalk.get((year, source_label.strip()), "")
        if section == "spending_categories":
            display = DISPLAY_NAMES.get(key)
            if display is None:
                raise ValueError(
                    f"FY{year} {source_label!r} maps to canonical key {key!r}, which has no "
                    f"display name. Add it to DISPLAY_NAMES rather than falling back to the "
                    f"printed label, which drifts between years."
                )
        else:
            mapped = REVENUE_KEYS.get(source_label.strip())
            if mapped is None:
                raise ValueError(
                    f"FY{year} revenue category {source_label!r} has no canonical key. Add "
                    f"it to REVENUE_KEYS rather than falling back to the printed label, "
                    f"which drifts between years."
                )
            key, display = mapped
        pdf_page = str(page) if page else ""
        printed_page = str(page - offset) if (page and offset is not None) else ""
        if not pdf_page:
            pdf_page, printed_page = baseline_pages.get((year, display), ("", ""))
        if not pdf_page:
            raise ValueError(
                f"FY{year} {section} {display!r} has no page citation. Every published "
                f"figure must name the page it came from; emitting a blank cite would "
                f"publish an unverifiable number."
            )
        rows.append({
            "fiscal_year": year,
            "section": section,
            "label": display,
            "source_label": source_label,
            "canonical_key": key,
            # The budget as ORIGINALLY ADOPTED, before any mid-year amendment.
            #
            # `budget` below is the ACFR's final budget column, which is the right basis for
            # variance analysis and is what the comparison view shows. But publishing only
            # the final budget loses the amendment: the gap between these two columns is
            # where a mid-year change to the adopted plan actually appears, and a reader
            # asking "what did Council adopt, and what did it become?" could not answer it
            # from the downloads. Empty where the source does not print one — absent is not
            # zero.
            "original_budget": "" if original_budget is None else original_budget,
            "budget": budget,
            "actual": actual,
            "contribution": contribution,
            "source_code": src.get("source_code", ""),
            "document_title_version": src.get("document", ""),
            "source_url": src.get("source_url", ""),
            "pdf_page": pdf_page,
            "printed_page": printed_page,
        })

    years = sorted({r["fiscal_year"] for r in exp})
    for year in years:
        for r in rev:
            if r["fiscal_year"] != year or r["subline"]:
                continue
            budget, actual = _money(r["final_budget"]), _money(r["actual"])
            if budget is None or actual is None:
                continue
            emit(year, "revenue_categories", r["category"], budget, actual,
                 revenue_pages.get(year), _money(r.get("original_budget")))

        for r in exp:
            if r["fiscal_year"] != year or r["subdepartment"] or r["object"]:
                continue
            key = (year, r["department"])
            budget, actual = _money(r["final_budget"]), _money(r["actual"])
            original = _money(r.get("original_budget"))
            if budget is None and key in DERIVED_TOTALS:
                budget = children[key]["final_budget"]
                # Derive the original the same way, or the two columns would be built on
                # different bases for the same row.
                if original is None:
                    original = children[key]["original_budget"] or None
            if budget is None or actual is None:
                continue
            emit(year, "spending_categories", r["department"], budget, actual,
                 cites.get(key), original)

    return rows


def main() -> int:
    rows = build_rows()

    existing = {
        (r["fiscal_year"], r["section"], r["label"]): r
        for r in _read(BASELINE)
    }

    drift = []
    for row in rows:
        if row["fiscal_year"] != "2025":
            continue
        prior = existing.get((row["fiscal_year"], row["section"], row["label"]))
        if prior is None:
            drift.append(f"FY2025 {row['section']} {row['label']}: not in the reviewed file")
            continue
        # Every field the baseline carries, not a chosen subset. The first version of this
        # gate compared only budget/actual/contribution and silently let source_code and the
        # page cites change on already-reviewed rows.
        for field in prior:
            if str(row[field]) != str(prior[field]):
                drift.append(
                    f"FY2025 {row['section']} {row['label']} {field}: "
                    f"reviewed file says {prior[field]}, this script produces {row[field]}"
                )

    reviewed_2025 = [k for k in existing if k[0] == "2025"]
    produced_2025 = {(r["fiscal_year"], r["section"], r["label"]) for r in rows if r["fiscal_year"] == "2025"}
    for key in reviewed_2025:
        if key not in produced_2025:
            drift.append(f"FY2025 {key[1]} {key[2]}: in the reviewed file but not produced")

    if drift:
        print("REFUSING TO WRITE. The FY2025 rows must match the owner-reviewed file exactly.")
        for d in drift:
            print("  " + d)
        return 1

    with OUT.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    years = sorted({r["fiscal_year"] for r in rows})
    missing_key = sum(1 for r in rows if r["section"] == "spending_categories" and not r["canonical_key"])
    missing_page = sum(1 for r in rows if r["section"] == "spending_categories" and not r["pdf_page"])
    print(f"wrote {len(rows)} rows, FY{years[0]}-FY{years[-1]}")
    print(f"  FY2025 reproduces the owner-reviewed rows exactly ({len(reviewed_2025)} rows)")
    print(f"  spending rows without a crosswalk key: {missing_key}")
    print(f"  spending rows without a page cite: {missing_page}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
