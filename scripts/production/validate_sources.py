"""Source-file gates that run before anything reaches the dimensional model.

These check the frozen General Fund detailed-schedule inputs in `data/production/` against
themselves and against the county's own printed grand totals. They exist because the
dimensional model can only reconcile what it ingests, and a defect in the source CSVs
survives every downstream check by being consistent.

Two gates:

1. `check_detailed_reconciliation` — object rows sum to sub-department totals, sub-department
   totals sum to department totals, department totals sum to the series grand total, revenue
   sublines sum to categories, and categories sum to the series grand total. All three
   columns, all years.

   Its load-bearing rule: **a total row may not be zero or absent while its printed children
   sum non-zero.** A printed dash means nil under normal accounting presentation, so reading
   it as 0 is right in general. It is wrong on a total row contradicted by its own children,
   where zero is arithmetically impossible and propagating it fabricates an overspend. That
   is the FY2018 Total public safety case: the county omitted a total it had computed, and
   the omission survived two verification passes that only ever checked the actual column.
   Registered omissions live in DERIVED_TOTALS and must be stored absent, never as 0.

2. `check_cross_schedule` — our grand totals equal the totals the county prints on its basic
   budget-versus-actual statement, which is a different presentation of the same year
   (capital outlay pulled into a single line rather than left inside each department).
   Per-department figures legitimately differ between the two; grand totals do not. This is
   also the only check that reaches the original-budget column at the total level, since
   `general_fund_audited_series.csv` carries no original-budget figure.

Full provenance for both: `research/fy2025-budget-actual/source-anomalies.md`,
`fidelity-audit.md`, and `anomaly-queue.md`.
"""

from __future__ import annotations

import csv
import re
import json
from collections import defaultdict
from pathlib import Path

from scripts.curation.inventory_source_footnotes import markers_in_label
from scripts.production.ingest import (
    CONFLICTS_DATASET,
    EXTENDED_DATASETS,
    PRIMARY_DATASETS,
    RECOVERY_DATASETS,
)

ROOT = Path(__file__).resolve().parents[2]
BLIND_DIR = ROOT / "audit" / "blind-extraction"
RECOVERY_DIR = ROOT / "data" / "recovered"

# Department totals the county did not print, whose value is derived from printed children.
# Every entry needs a matching section in research/fy2025-budget-actual/source-anomalies.md.
DERIVED_TOTALS = {("2018", "Public safety")}

COLS = ("original_budget", "final_budget", "actual")
# general_fund_audited_series.csv has no original-budget column, so series-level checks run
# on final budget and actual. Original budget is reached at total level by check_cross_schedule.
SERIES_COLS = ("final_budget", "actual")

ABSENT = ("", "-", "blank", "n/a")


def _read(data_dir: Path, name: str) -> list[dict]:
    with (data_dir / name).open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def _money(value: str | None) -> int | None:
    """Printed cell to int, or None for absent. Absent is not zero."""
    s = (value or "").strip()
    if s.lower() in ABSENT:
        return None
    negative = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").replace("$", "").strip()
    try:
        n = int(s)
    except ValueError:
        return None
    return -n if negative else n


def _amount(value: str | None) -> int:
    return _money(value) or 0


def check_detailed_reconciliation(data_dir: Path) -> list[str]:
    errors: list[str] = []
    exp = _read(data_dir, "general_fund_detailed_expenditure.csv")
    rev = _read(data_dir, "general_fund_detailed_revenue.csv")
    series = {
        (r["fiscal_year"], r["measure"]): r
        for r in _read(data_dir, "general_fund_audited_series.csv")
    }

    objects: dict = defaultdict(lambda: defaultdict(int))
    sub_totals: dict = {}
    dept_totals: dict = {}

    for r in exp:
        year, dept = r["fiscal_year"], r["department"]
        sub, obj = r["subdepartment"], r["object"]
        if sub and obj:
            for c in COLS:
                objects[(year, dept, sub)][c] += _amount(r[c])
        elif sub:
            sub_totals[(year, dept, sub)] = r
        else:
            dept_totals[(year, dept)] = r

    for key, row in sub_totals.items():
        year, dept, sub = key
        for c in COLS:
            expected, got = objects[key][c], _amount(row[c])
            if expected != got:
                errors.append(
                    f"FY{year} {dept} / {sub} {c}: objects sum to {expected:,}, "
                    f"total row says {got:,}"
                )

    children: dict = defaultdict(lambda: defaultdict(int))
    for (year, dept, _sub), row in sub_totals.items():
        for c in COLS:
            children[(year, dept)][c] += _amount(row[c])

    for key, row in dept_totals.items():
        year, dept = key
        child = children.get(key, {})
        if not any(child.get(c, 0) for c in COLS):
            continue
        for c in COLS:
            got, expected = _money(row[c]), child.get(c, 0)
            if got is None or got == 0:
                if key in DERIVED_TOTALS:
                    if got == 0:
                        errors.append(
                            f"FY{year} {dept} {c}: registered as a derived total, so the "
                            f"cell must be empty (absent), but it holds 0. A zero here "
                            f"propagates a fabricated variance downstream."
                        )
                else:
                    errors.append(
                        f"FY{year} {dept} {c}: total is "
                        f"{'absent' if got is None else '0'} while its children sum to "
                        f"{expected:,}. Either the source omitted a computed total "
                        f"(register it in DERIVED_TOTALS with a source-anomalies.md entry) "
                        f"or the extraction is wrong."
                    )
            elif got != expected:
                errors.append(
                    f"FY{year} {dept} {c}: sub-departments sum to {expected:,}, "
                    f"total row says {got:,}"
                )

    by_year: dict = defaultdict(lambda: defaultdict(int))
    for (year, dept), row in dept_totals.items():
        for c in COLS:
            got = _money(row[c])
            if (got is None or got == 0) and (year, dept) in DERIVED_TOTALS:
                got = children[(year, dept)][c]
            by_year[year][c] += got or 0

    for year in sorted(by_year):
        rec = series.get((year, "total_expenditures"))
        if not rec:
            continue
        for c in SERIES_COLS:
            expected = _money(rec[c])
            if expected is not None and expected != by_year[year][c]:
                errors.append(
                    f"FY{year} departments sum to {by_year[year][c]:,} in {c}, "
                    f"series total expenditures says {expected:,}"
                )

    sublines: dict = defaultdict(lambda: defaultdict(int))
    cat_totals: dict = {}
    for r in rev:
        key = (r["fiscal_year"], r["category"])
        if r["subline"]:
            for c in COLS:
                sublines[key][c] += _amount(r[c])
        else:
            cat_totals[key] = r

    rev_by_year: dict = defaultdict(lambda: defaultdict(int))
    for key, row in cat_totals.items():
        year, cat = key
        for c in COLS:
            rev_by_year[year][c] += _amount(row[c])
        if not any(sublines[key].get(c, 0) for c in COLS):
            continue
        for c in COLS:
            expected, got = sublines[key][c], _amount(row[c])
            if expected != got:
                errors.append(
                    f"FY{year} revenue {cat} {c}: sublines sum to {expected:,}, "
                    f"category says {got:,}"
                )

    for year in sorted(rev_by_year):
        rec = series.get((year, "total_revenues"))
        if not rec:
            continue
        for c in SERIES_COLS:
            expected = _money(rec[c])
            if expected is not None and expected != rev_by_year[year][c]:
                errors.append(
                    f"FY{year} revenue categories sum to {rev_by_year[year][c]:,} in {c}, "
                    f"series total revenues says {expected:,}"
                )

    return errors


def check_cross_schedule(data_dir: Path) -> list[str]:
    errors: list[str] = []
    exp = _read(data_dir, "general_fund_detailed_expenditure.csv")
    rev = _read(data_dir, "general_fund_detailed_revenue.csv")
    printed = _read(data_dir, "general_fund_basic_statement_totals.csv")

    children: dict = defaultdict(lambda: defaultdict(int))
    for r in exp:
        if r["subdepartment"] and not r["object"]:
            for c in COLS:
                children[(r["fiscal_year"], r["department"])][c] += _amount(r[c])

    ours: dict = defaultdict(lambda: defaultdict(int))
    for r in exp:
        if r["subdepartment"] or r["object"]:
            continue
        key = (r["fiscal_year"], r["department"])
        for c in COLS:
            got = _money(r[c])
            if (got is None or got == 0) and key in DERIVED_TOTALS:
                got = children[key][c]
            ours[("total_expenditures", r["fiscal_year"])][c] += got or 0

    for r in rev:
        if r["subline"]:
            continue
        for c in COLS:
            ours[("total_revenues", r["fiscal_year"])][c] += _amount(r[c])

    for row in printed:
        measure = row["measure"]
        if measure not in ("total_revenues", "total_expenditures"):
            continue
        year = str(row["fiscal_year"])
        for c in COLS:
            expected = _money(row[c])
            if expected is None:
                continue
            got = ours[(measure, year)][c]
            if got != expected:
                errors.append(
                    f"FY{year} {measure} {c}: the county's basic statement prints "
                    f"{expected:,}, our detailed schedule sums to {got:,}, "
                    f"difference {got - expected:,}. The county's two presentations of "
                    f"this year do not reconcile, or our sum is wrong. Needs a human."
                )
    return errors


def check_audited_equations(data_dir: Path) -> list[str]:
    """The audited General Fund accounting identities, written era-correctly.

    The naive forms of both equations fail, and they fail in ways that look like data errors
    rather than modelling errors, so they get written down here once instead of being
    rediscovered. Measured against the committed data:

    - Position, naive (`beginning + net_change = ending`): passes 8 of 15 years. It fails
      FY2011 through FY2017, because those years print an explicit "Adjustment: Budget to
      GAAP basis (Note 1-D)" line reconciling the budget-basis result to the GAAP fund
      balance. Including that term passes all 15.
    - Flow, naive (`revenue - expenditure + transfers_in - transfers_out = net_change`):
      passes **0 of 15**. `transfers_out` is stored as a negative value, so it is added, not
      subtracted. Even then four years carry a legitimate residual (asset and land sales, and
      an FY2023 budget-to-GAAP adjustment) which is itemised separately. With the sign fixed
      and the residual included, all 15 pass.
    - Fund-balance classifications are two-level: detail rows plus a TOTAL row that repeats
      their sum. Summing every row double-counts the balance exactly 2x.
    """
    errors: list[str] = []
    series: dict[str, dict[str, int | None]] = {}
    for r in _read(data_dir, "general_fund_audited_series.csv"):
        series.setdefault(r["fiscal_year"], {})[r["measure"]] = _money(r["actual"])

    # The residuals file now carries a `column` field (`actual` | `final_budget`) because
    # FY2011's Final Budget column has its own residual (a fund balance appropriation) that
    # has no bearing on this identity, which is built entirely from `actual` measures above.
    # Filtering here keeps a final_budget-only row from silently perturbing the actual-column
    # flow check for the same fiscal year.
    residuals = {
        r["fiscal_year"]: _amount(r["residual_total"])
        for r in _read(data_dir, "general_fund_flow_residuals.csv")
        if r.get("column", "actual") == "actual"
    }

    # Every identity below is skipped when a term is missing, which is the correct behaviour
    # for a genuinely absent figure and the wrong behaviour for a lost one. Without this
    # check, dropping a measure makes the equations pass by having nothing to test: the gate
    # goes quiet exactly when something has gone wrong. Caught by a negative test that
    # removed a measure and saw the validator report success.
    required = {
        "fund_balance_beginning",
        "fund_balance_ending",
        "net_change",
        "total_revenues",
        "total_expenditures",
        "transfers_in",
        "transfers_out",
    }
    years = sorted(series)
    for year in years:
        present = {m for m, v in series[year].items() if v is not None}
        missing = required - present
        if missing:
            errors.append(
                f"FY{year} audited series is missing {sorted(missing)}. Every audited year "
                f"must carry all of {sorted(required)}; a missing measure silently disables "
                f"the identities that would otherwise check it."
            )

    for year in years:
        s = series[year]
        beginning, ending = s.get("fund_balance_beginning"), s.get("fund_balance_ending")
        net_change = s.get("net_change")
        adjustment = s.get("budget_to_gaap_adjustment") or 0
        if beginning is not None and ending is not None and net_change is not None:
            got = beginning + net_change + adjustment
            if got != ending:
                errors.append(
                    f"FY{year} position: beginning {beginning:,} + net change {net_change:,} "
                    f"+ Note 1-D adjustment {adjustment:,} = {got:,}, but the audited ending "
                    f"balance is {ending:,}"
                )

        revenue, expenditure = s.get("total_revenues"), s.get("total_expenditures")
        transfers_in, transfers_out = s.get("transfers_in"), s.get("transfers_out")
        if None not in (revenue, expenditure, transfers_in, transfers_out, net_change):
            residual = residuals.get(year, 0)
            got = revenue - expenditure + transfers_in + transfers_out + residual
            if got != net_change:
                errors.append(
                    f"FY{year} flow: revenue {revenue:,} - expenditure {expenditure:,} "
                    f"+ transfers in {transfers_in:,} + transfers out {transfers_out:,} "
                    f"(stored negative) + other financing {residual:,} = {got:,}, "
                    f"but net change is {net_change:,}"
                )

    for earlier, later in zip(years, years[1:]):
        if int(later) != int(earlier) + 1:
            continue
        ending = series[earlier].get("fund_balance_ending")
        beginning = series[later].get("fund_balance_beginning")
        if ending is not None and beginning is not None and ending != beginning:
            errors.append(
                f"FY{earlier} ends at {ending:,} but FY{later} begins at {beginning:,}; "
                f"the audited year chain is broken"
            )

    # The balance sheet prints its own General Fund total, in a different statement from the
    # budgetary schedule the audited series comes from. Agreement between them is independent
    # corroboration rather than a restatement, so a disagreement is worth stopping for.
    for row in _read(data_dir, "general_fund_balance_sheet_pages.csv"):
        printed = _money(row["total_fund_balance"])
        year = str(row["fiscal_year"])
        ending = series.get(year, {}).get("fund_balance_ending")
        if printed is not None and ending is not None and printed != ending:
            errors.append(
                f"FY{year}: the balance sheet prints a total fund balance of {printed:,} "
                f"but the budgetary schedule reports an ending balance of {ending:,}. "
                f"Two statements in the same document disagree."
            )

    by_year: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in _read(data_dir, "general_fund_balance_classifications.csv"):
        bucket = "total" if r["classification"].strip().upper() == "TOTAL" else "detail"
        by_year[r["fiscal_year"]][bucket] += _amount(r["amount"])

    for year, sums in sorted(by_year.items()):
        detail, total = sums.get("detail", 0), sums.get("total", 0)
        if detail != total:
            errors.append(
                f"FY{year} fund-balance classifications: detail rows sum to {detail:,} "
                f"but the printed TOTAL row is {total:,}"
            )
        ending = series.get(year, {}).get("fund_balance_ending")
        if ending is not None and total != ending:
            errors.append(
                f"FY{year} fund-balance classifications total {total:,} does not equal the "
                f"audited ending balance {ending:,}"
            )

    return errors


NOTE_TYPES = {
    "budget_only",
    "taxonomy_break",
    "extraction_method",
    "derived_value",
    "basis_adjustment",
    "basis_label",
    "comparability_break",
    "unusual_movement",
    "undocumented_cause",
    "incomplete_flow_decomposition",
    "no_appropriation",
    "presentation_difference",
    "label_drift",
    "statement_not_printed",
    "interfund_transfer",
    "printed_dash",
}

# Where a note applies. `entity` narrows to ONE line by entity id, which is what an
# absorption like Engineering's FY2016 consolidation needs — a `series`-scoped note would
# split every department's history at that year, which is both wrong and noisy.
SCOPE_TYPES = {"dataset", "fiscal_year", "line", "series", "entity", "printed_form"}

SEVERITIES = {"info", "warning"}
NOTE_STATUS_CLASSES = {"actual", "adopted", "estimated", "financing", "projected", "proposed"}

# What a note obliges the interface to do. The obligation is data, not developer memory: a
# note whose only effect is a badge does not stop a reader misreading a fifteen-year line
# that crosses a department reorganisation, and a badge is the first thing lost when someone
# screenshots a chart. `series_split` and `basis_label` are contracts the components must
# honour, and the web tests assert the rendering behaviour rather than the note's presence.
#
# Added deliberately rather than inventing a type per note:
#   callout      render the headline and text in full beside the figure it qualifies, and
#                inside any chart drawn from that figure, so a crop carries it. Never only
#                as a numbered footnote: a superscript is the first thing a screenshot loses,
#                and this contract exists for the caveats a reader must not miss.
#   explanation  render as an expandable section under the figure, titled by the headline,
#                with the text's blank-line-separated paragraphs and its source reference.
#                Never as a superscript. For material a reader needs on request rather than
#                on arrival.
RENDER_CONTRACTS = {
    "badge", "footnote", "inline_marker", "series_split", "basis_label",
    "callout", "explanation",
}

# Facts about the data that MUST carry a note before they can be published. Each entry is a
# thing a resident could otherwise misread, with no way to discover the catch.
REQUIRED_NOTES = {
    "extraction_method": "FY2012 was read from page images; its text layer is unusable",
    "derived_value": "FY2018 public safety budget is derived, not printed by the county",
    "basis_adjustment": "FY2011-FY2017 reconcile through a budget-to-GAAP adjustment",
    "comparability_break": "the ~FY2013 department reorganisation breaks series continuity",
    "undocumented_cause": "the FY2023 transfer surge has no explanation in the county's report",
    "no_appropriation": "FY2022-FY2025 debt service records spending against no budget",
    "presentation_difference": "our department totals differ from the county's summary page",
    "statement_not_printed": "years before FY2018 have no printed sources-to-budget statement",
    "budget_only": "FY2026 has an adopted budget but no audited result to compare it against",
    "taxonomy_break": "the FY2026 budget book groups departments differently from the ACFRs",
    "interfund_transfer": "whole-budget files can include both sides of interfund transfers",
    "printed_dash": "the production observation layer normalizes printed dashes to arithmetic zero",
}


def _entity_ids(data_dir: Path) -> set[str]:
    return {r["entity_id"] for r in _read(data_dir, "entity.csv")}


def check_data_notes(data_dir: Path) -> list[str]:
    """Caveats are data, and the ones that matter are mandatory.

    Before this existed every caveat this project had earned lived either in a research
    document no visitor reads or in a sentence a component rendered for one hand-written
    year. Fifteen years of pages cannot be annotated that way.
    """
    errors: list[str] = []
    rows = _read(data_dir, "data_notes.csv")

    seen_ids: set[str] = set()
    present_types: set[str] = set()

    for row in rows:
        note_id = row["note_id"].strip()
        if not note_id:
            errors.append("a data note has no note_id")
            continue
        if note_id in seen_ids:
            errors.append(f"duplicate note_id: {note_id}")
        seen_ids.add(note_id)

        note_type = row["note_type"].strip()
        if note_type not in NOTE_TYPES:
            errors.append(
                f"{note_id}: note_type {note_type!r} is not in the controlled vocabulary. "
                f"Add it deliberately rather than inventing a type per note."
            )
        present_types.add(note_type)

        if row["severity"].strip() not in SEVERITIES:
            errors.append(f"{note_id}: severity must be one of {sorted(SEVERITIES)}")

        status_class = row.get("status_class", "").strip()
        if status_class and status_class not in NOTE_STATUS_CLASSES:
            errors.append(
                f"{note_id}: status_class must be blank or one of {sorted(NOTE_STATUS_CLASSES)}"
            )

        scope_type = row["scope_type"].strip()
        if scope_type not in SCOPE_TYPES:
            errors.append(
                f"{note_id}: scope_type {scope_type!r} is not in the controlled vocabulary "
                f"{sorted(SCOPE_TYPES)}"
            )
        if scope_type == "entity":
            # An entity-scoped note naming an id that does not exist never fires, and a
            # note that never fires is indistinguishable from a caveat nobody wrote.
            entity_id = row["scope_value"].strip()
            if entity_id not in _entity_ids(data_dir):
                errors.append(
                    f"{note_id}: scope_value {entity_id!r} is not an entity, so this note "
                    f"would silently never render"
                )
        if scope_type == "printed_form":
            forms = {form for form in row["scope_value"].split(";") if form}
            if forms != {"-", "--"}:
                errors.append(
                    f"{note_id}: printed_form scope must cover exactly '-' and '--', got "
                    f"{sorted(forms)}"
                )

        if row["render_contract"].strip() not in RENDER_CONTRACTS:
            errors.append(
                f"{note_id}: render_contract {row['render_contract']!r} is not recognised"
            )

        for field in ("headline", "text", "source_ref"):
            if not row[field].strip():
                errors.append(f"{note_id}: {field} is empty")

        start, end = row["fiscal_year_start"].strip(), row["fiscal_year_end"].strip()
        if start and end and int(start) > int(end):
            errors.append(f"{note_id}: fiscal year range runs backwards ({start} to {end})")

    for note_type, why in REQUIRED_NOTES.items():
        if note_type not in present_types:
            errors.append(
                f"no {note_type} note is published, but {why}. A reader has no way to "
                f"discover this from the figures alone."
            )

    printed_dash_note = next(
        (row for row in rows if row["note_id"].strip() == "note.printed-dash"),
        None,
    )
    if printed_dash_note is None:
        errors.append(
            "note.printed-dash is missing; dash-derived values would retain arithmetic zero "
            "without the site-wide source-form disclosure"
        )
    elif (
        printed_dash_note["scope_type"].strip() != "printed_form"
        or {form for form in printed_dash_note["scope_value"].split(";") if form}
        != {"-", "--"}
        or printed_dash_note["render_contract"].strip() != "inline_marker"
    ):
        errors.append(
            "note.printed-dash must be an inline_marker scoped to both '-' and '--' "
            "printed forms"
        )

    return errors


SOURCE_FOOTNOTE_FIELDS = (
    "source_code",
    "table_section",
    "original_label",
    "marker",
    "footnote_text",
    "printed_page",
    "pdf_page",
    "printed_year_columns",
    "review_status",
)
SOURCE_FOOTNOTE_STATUSES = {"human_confirmed", "human_confirmed_missing_text"}

SOURCE_EDITION_FIELDS = (
    "source_code",
    "edition_status",
    "adoption_marker",
    "marker_source_file",
    "proposed_footer_pdf_pages",
    "review_status",
    "review_date",
    "notes",
)
SOURCE_EDITION_STATUSES = {"adopted", "proposed", "pre_adoption"}


def _observation_dataset_paths(data_dir: Path) -> list[tuple[str, Path]]:
    paths = [
        (dataset, BLIND_DIR / f"{dataset}.csv")
        for dataset in (*PRIMARY_DATASETS, CONFLICTS_DATASET)
    ]
    paths.extend(
        (dataset, RECOVERY_DIR / f"{dataset}.csv")
        for dataset in RECOVERY_DATASETS
    )
    paths.extend(
        (dataset, data_dir / "observations" / f"{dataset}.csv")
        for dataset in EXTENDED_DATASETS
    )
    return paths


def check_source_footnotes(data_dir: Path) -> list[str]:
    """Every source-label marker resolves to a reviewed, source-page footnote record.

    This deliberately scans the exact observation-bearing file set rather than label_map or
    generated JSON. The source marker is lost before rendering, so a downstream-only gate
    would certify the already-stripped data and never see the defect.
    """
    errors: list[str] = []
    path = data_dir / "source_footnotes.csv"
    if not path.exists():
        return [f"source footnote register is missing: {path}"]
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != SOURCE_FOOTNOTE_FIELDS:
            return [
                f"{path}: source footnote columns are {tuple(reader.fieldnames or ())}, "
                f"expected {SOURCE_FOOTNOTE_FIELDS}"
            ]
        footnotes = list(reader)

    by_key: dict[tuple[str, str, str], dict[str, str]] = {}
    for row in footnotes:
        key = (
            row["source_code"].strip(),
            row["table_section"].strip(),
            row["original_label"].strip(),
        )
        if not all(key):
            errors.append(f"source footnote has incomplete source/table/label identity: {key}")
            continue
        if key in by_key:
            errors.append(f"duplicate source footnote record: {key}")
            continue
        by_key[key] = row

        markers = markers_in_label(key[2])
        marker = row["marker"].strip()
        if markers != (marker,):
            errors.append(
                f"{key}: marker column {marker!r} does not match label markers {markers!r}"
            )

        status = row["review_status"].strip()
        text = row["footnote_text"].strip()
        if status not in SOURCE_FOOTNOTE_STATUSES:
            errors.append(
                f"{key}: review_status must be one of {sorted(SOURCE_FOOTNOTE_STATUSES)}"
            )
        elif status == "human_confirmed" and not text:
            errors.append(f"{key}: reviewed footnote text is empty")
        elif status == "human_confirmed_missing_text" and text:
            errors.append(
                f"{key}: missing-text status cannot carry wording the source did not print"
            )

        try:
            printed_page = int(row["printed_page"])
            pdf_page = int(row["pdf_page"])
            years = [int(value) for value in row["printed_year_columns"].split(";")]
        except ValueError:
            errors.append(f"{key}: pages and printed_year_columns must be integers")
            continue
        if printed_page < 1 or pdf_page < 1:
            errors.append(f"{key}: source pages must be positive")
        if not years or years != sorted(set(years)):
            errors.append(f"{key}: printed_year_columns must be a sorted, non-empty set")

    reached: set[tuple[str, str, str]] = set()
    for dataset, dataset_path in _observation_dataset_paths(data_dir):
        if not dataset_path.exists():
            errors.append(f"source-footnote scan is missing observation dataset {dataset_path}")
            continue
        with dataset_path.open(newline="", encoding="utf-8-sig") as handle:
            for ordinal, row in enumerate(csv.DictReader(handle), start=1):
                label = (row.get("original_label") or "").strip()
                if not markers_in_label(label):
                    continue
                key = (
                    (row.get("source_code") or "").strip(),
                    (row.get("table_section") or "").strip(),
                    label,
                )
                footnote = by_key.get(key)
                if footnote is None:
                    errors.append(
                        f"{dataset}:{ordinal}: marked label {label!r} has no reviewed source "
                        f"footnote for {key[0]!r} / {key[1]!r}"
                    )
                    continue
                reached.add(key)
                years = {
                    int(value) for value in footnote["printed_year_columns"].split(";")
                    if value
                }
                fiscal_year = int(row["fiscal_year"])
                if fiscal_year not in years:
                    errors.append(
                        f"{dataset}:{ordinal}: {label!r} FY{fiscal_year} is outside its "
                        f"reviewed printed year columns {sorted(years)}"
                    )

    for key in sorted(set(by_key) - reached):
        errors.append(
            f"{key}: source footnote record reaches no marked production observation"
        )

    return errors


def check_source_editions(data_dir: Path) -> list[str]:
    """Every cited budget book is reviewed as adopted, down to the cited page.

    Edition is a source property, not something canonicalisation can infer from a status
    label. This check reads the exact observation-bearing file set so a future extractor
    cannot cite a proposed book while continuing to call the value adopted. Reviewed
    proposed-footer pages are retained as page-level exclusions: an uncited typesetting
    artifact is documented, while any present or future observation that points at one fails.
    """
    errors: list[str] = []
    path = data_dir / "source_edition_reviews.csv"
    if not path.exists():
        return [f"source edition review register is missing: {path}"]
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != SOURCE_EDITION_FIELDS:
            return [
                f"{path}: source edition columns are {tuple(reader.fieldnames or ())}, "
                f"expected {SOURCE_EDITION_FIELDS}"
            ]
        reviews = list(reader)

    by_code: dict[str, tuple[dict[str, str], set[int]]] = {}
    for row in reviews:
        code = row["source_code"].strip()
        if not code:
            errors.append("source edition review has an empty source_code")
            continue
        if code in by_code:
            errors.append(f"duplicate source edition review for {code}")
            continue
        status = row["edition_status"].strip()
        if status not in SOURCE_EDITION_STATUSES:
            errors.append(
                f"{code}: edition_status must be one of {sorted(SOURCE_EDITION_STATUSES)}"
            )
        if row["review_status"].strip() != "human_confirmed":
            errors.append(f"{code}: source edition must be human_confirmed")
        if not row["review_date"].strip():
            errors.append(f"{code}: source edition review_date is empty")
        if not row["marker_source_file"].strip():
            errors.append(f"{code}: source edition marker_source_file is empty")
        if status == "adopted" and not row["adoption_marker"].strip():
            errors.append(f"{code}: adopted source has no recorded adoption marker")
        if status != "adopted" and row["adoption_marker"].strip():
            errors.append(
                f"{code}: {status} source cannot carry an adopted-edition marker"
            )

        footer_pages: set[int] = set()
        raw_pages = row["proposed_footer_pdf_pages"].strip()
        if raw_pages:
            try:
                footer_pages = {int(value) for value in raw_pages.split(";")}
            except ValueError:
                errors.append(
                    f"{code}: proposed_footer_pdf_pages must be semicolon-separated integers"
                )
            if any(page < 1 for page in footer_pages):
                errors.append(f"{code}: proposed-footer PDF pages must be positive")
        by_code[code] = (row, footer_pages)

    cited_budget_codes: set[str] = set()
    cited_count = 0
    for dataset, dataset_path in _observation_dataset_paths(data_dir):
        if not dataset_path.exists():
            errors.append(f"source-edition scan is missing observation dataset {dataset_path}")
            continue
        with dataset_path.open(newline="", encoding="utf-8-sig") as handle:
            for ordinal, observation in enumerate(csv.DictReader(handle), start=1):
                code = (observation.get("source_code") or "").strip()
                # ACFRs are audited financial statements, not county budget editions.
                if not code.startswith("FY") or code.endswith("-ACFR"):
                    continue
                cited_count += 1
                cited_budget_codes.add(code)
                reviewed = by_code.get(code)
                if reviewed is None:
                    errors.append(
                        f"{dataset}:{ordinal}: budget source {code!r} has no edition review"
                    )
                    continue
                row, footer_pages = reviewed
                status = row["edition_status"].strip()
                if status != "adopted":
                    errors.append(
                        f"{dataset}:{ordinal}: budget source {code!r} is reviewed as "
                        f"{status}, not adopted"
                    )
                try:
                    pdf_page = int(observation["pdf_page"])
                except (KeyError, TypeError, ValueError):
                    errors.append(
                        f"{dataset}:{ordinal}: budget source {code!r} has no valid PDF page"
                    )
                    continue
                if pdf_page in footer_pages:
                    errors.append(
                        f"{dataset}:{ordinal}: budget source {code!r} cites PDF page "
                        f"{pdf_page}, reviewed with a Proposed Budget Document footer"
                    )

    if cited_count == 0:
        errors.append("source-edition gate reached zero budget observations")
    if not cited_budget_codes:
        errors.append("source-edition gate reached zero distinct budget sources")

    return errors


def check_successor_relationships(data_dir: Path) -> list[str]:
    """A `succeeded_by` row claims one line continues as another. Prove it from the data.

    The claim is cheap to write and expensive to get wrong: a reader following a successor
    link is being told these are the same work under a later name. Three properties the
    published ranges can decide on their own:

    1. Both entities exist. A link to a renamed-away id is how a chain silently breaks.
    2. Their active ranges do not OVERLAP. Two lines printed in the same book for the same
       year are two different things, whatever they are called — this is the check that
       would have caught pairing ENGINEERING with a bureau it was printed alongside.
    3. The successor begins within one year of the predecessor ending. A multi-year gap
       means something happened in between that the link would paper over.

    Deliberately NOT checked: how far the value moved across the boundary. A rename can
    coincide with a real budget change and a scope change can coincide with a rename;
    rejecting a link for a large delta would encode a guess as a rule. That judgement is
    what `relationship_note` records and what a comparability note carries to the reader.
    """
    errors: list[str] = []
    rows = [
        r for r in _read(data_dir, "entity_relationship.csv")
        if r["relationship_type"].strip() == "succeeded_by"
    ]
    if not rows:
        return errors

    entities = {r["entity_id"]: r for r in _read(data_dir, "entity.csv")}

    def span(entity_id: str) -> tuple[int, int] | None:
        row = entities.get(entity_id)
        if not row:
            return None
        start, end = row.get("active_from_fy", ""), row.get("active_to_fy", "")
        if not start or not end:
            return None
        return int(start), int(end)

    for row in rows:
        rid = row["relationship_id"].strip()
        earlier, later = row["from_entity_id"].strip(), row["to_entity_id"].strip()

        for entity_id in (earlier, later):
            if entity_id not in entities:
                errors.append(f"{rid}: {entity_id!r} is not an entity")
        if earlier not in entities or later not in entities:
            continue

        a, b = span(earlier), span(later)
        if a is None or b is None:
            errors.append(
                f"{rid}: {earlier} or {later} has no active year range, so the "
                f"succession cannot be checked"
            )
            continue

        if a[1] >= b[0]:
            errors.append(
                f"{rid}: {earlier} (FY{a[0]}-FY{a[1]}) and {later} (FY{b[0]}-FY{b[1]}) "
                f"overlap. Two lines published for the same year are two different things, "
                f"so one cannot be the successor of the other."
            )
            continue

        if b[0] != a[1] + 1:
            errors.append(
                f"{rid}: {earlier} ends FY{a[1]} and {later} begins FY{b[0]}, leaving "
                f"FY{a[1] + 1}-FY{b[0] - 1} unaccounted for. A successor link across a gap "
                f"hides whatever happened in between."
            )

        if not row.get("relationship_note", "").strip():
            errors.append(
                f"{rid}: a succession claim with no relationship_note. The evidence for "
                f"'these are the same line' has to travel with the claim."
            )

    errors.extend(_check_quoted_figures(data_dir, rows))
    return errors


def _check_quoted_figures(data_dir: Path, rows: list[dict]) -> list[str]:
    """Every dollar figure quoted in a succession note must exist in one of its two series.

    These notes carry their evidence — "FY2019 818,658 to FY2020 874,878 (+6.9%)" — which
    is the point of them, and it is also the risk. On 2026-07-22 I wrote four of these by
    carrying the percentages over from an earlier analysis and inventing plausible dollar
    amounts to sit beside them. All four were wrong, in a note whose whole job is to be the
    evidence. The percentages were right, which is what made them look right.

    So the figures are checked against the published series rather than trusted. A number
    that appears in neither entity fails the build.
    """
    errors: list[str] = []
    values = _canonical_values_by_entity(data_dir)
    if values is None:
        return errors

    for row in rows:
        rid = row["relationship_id"].strip()
        note = row.get("relationship_note", "")
        quoted = {int(m.replace(",", "")) for m in re.findall(r"\b\d{1,3}(?:,\d{3})+\b", note)}
        if not quoted:
            continue
        universe = values.get(row["from_entity_id"], set()) | values.get(row["to_entity_id"], set())
        if not universe:
            continue
        unknown = sorted(quoted - universe)
        if unknown:
            errors.append(
                f"{rid}: the note quotes {unknown}, which appears in neither "
                f"{row['from_entity_id']} nor {row['to_entity_id']}. A succession note is "
                f"evidence; a figure in it that is not in the data is a fabrication."
            )
    return errors


def _canonical_values_by_entity(data_dir: Path) -> dict[str, set[int]] | None:
    """Published dollar values per entity, read from the exported app data.

    Returns None when the export is not present (a fresh clone, or a test fixture holding
    only the CSVs), so the rest of the successor checks still run.
    """
    pages = data_dir.parent.parent / "web" / "data" / "v2" / "pages"
    if not pages.is_dir():
        return None
    out: dict[str, set[int]] = {}
    for path in pages.glob("*.json"):
        try:
            page = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        out[page.get("entity_id", path.stem)] = {
            point["value"] for point in page.get("series", [])
            if point.get("measure_type") == "dollars" and point.get("value") is not None
        }
    return out


def check_hierarchy_edge_overlap(data_dir: Path) -> list[str]:
    """The same child must not hang off the same parent twice in the same year.

    A duplicated edge makes the child count twice in its parent's rollup. That is
    detectable today only where the county printed a total to reconcile against, and it is
    silent everywhere else — so this checks the cause rather than waiting for the symptom.

    Found the hard way on 2026-07-22: repointing three misprinted labels onto their
    canonical entities left the new edges alongside the broader ones that already covered
    those years, and Law Enforcement's FY2020 rollup came out exactly one medical examiner
    too large. The reconciliation gate caught it, which is the system working, but it
    reported a total that did not add up rather than the duplicate edge that caused it.
    """
    errors: list[str] = []
    rows = _read(data_dir, "hierarchy_edge.csv")
    GLOBAL_MIN, GLOBAL_MAX = 2002, 2026

    def span(row: dict) -> tuple[int, int]:
        start = row.get("effective_from_fy", "").strip() or GLOBAL_MIN
        end = row.get("effective_to_fy", "").strip() or GLOBAL_MAX
        return int(start), int(end)

    by_pair: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        key = (row["parent_entity_id"], row["child_entity_id"])
        by_pair.setdefault(key, []).append(row)

    for (parent, child), edges in sorted(by_pair.items()):
        if len(edges) < 2:
            continue
        spans = sorted((span(edge), edge) for edge in edges)
        for (a_start, a_end), _ in spans:
            for (b_start, b_end), _ in spans:
                if (a_start, a_end) >= (b_start, b_end):
                    continue
                if a_end >= b_start:
                    errors.append(
                        f"{parent} -> {child}: edges FY{a_start}-FY{a_end} and "
                        f"FY{b_start}-FY{b_end} overlap, so the child would be counted "
                        f"twice in FY{b_start}-FY{min(a_end, b_end)}"
                    )
    return errors


def check_owner_reviewed_comparison(data_dir: Path) -> list[str]:
    """The FY2025 comparison rows must still match the file a human signed off on.

    This check existed, inside `gen_comparison.py` — a script nothing requires anyone to
    run. A hand edit to the committed comparison CSV that preserved internal sums would
    have shipped with no gate firing, on the one page in this project that has passed owner
    review. Moving it into the pipeline is the difference between a check that exists and a
    check that runs.

    Compares every field the baseline carries, not a chosen subset, for the same reason
    the generator's version does: an earlier form of that gate compared three fields and
    let `source_code` drift on reviewed rows.
    """
    errors: list[str] = []
    baseline_path = data_dir / "baselines" / "fy2025_comparison_owner_reviewed.csv"
    if not baseline_path.exists():
        return [f"the owner-reviewed FY2025 baseline is missing: {baseline_path}"]

    baseline = {
        (r["fiscal_year"], r["section"], r["label"]): r
        for r in _read(data_dir, "baselines/fy2025_comparison_owner_reviewed.csv")
    }
    published = {
        (r["fiscal_year"], r["section"], r["label"]): r
        for r in _read(data_dir, "general_fund_budget_actual_comparison.csv")
        if r["fiscal_year"] == "2025"
    }

    for key, reviewed in baseline.items():
        current = published.get(key)
        if current is None:
            errors.append(f"FY2025 {key[1]} {key[2]}: reviewed row is no longer published")
            continue
        for field, value in reviewed.items():
            if str(current.get(field, "")) != str(value):
                errors.append(
                    f"FY2025 {key[1]} {key[2]} {field}: owner-reviewed file says {value!r}, "
                    f"published data says {current.get(field)!r}"
                )
    for key in published:
        if key not in baseline:
            errors.append(f"FY2025 {key[1]} {key[2]}: published but not in the reviewed file")
    return errors


def validate_sources(data_dir: Path) -> list[str]:
    return (
        check_detailed_reconciliation(data_dir)
        + check_cross_schedule(data_dir)
        + check_audited_equations(data_dir)
        + check_data_notes(data_dir)
        + check_source_footnotes(data_dir)
        + check_source_editions(data_dir)
        + check_successor_relationships(data_dir)
        + check_hierarchy_edge_overlap(data_dir)
        + check_owner_reviewed_comparison(data_dir)
    )
