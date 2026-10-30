"""Generate the county-overview coverage states in `data/production/scope_coverage.csv`.

Run:  python3 -m scripts.curation.gen_scope_coverage

## What this file is, and what it is not

`scope_coverage.csv` is not extracted data. It is **this project's claim about what it
covers**, per scope, per domain, per year. The claim is what a resident reads when a region
of the county overview is empty, and an empty region with no words is the failure the whole
step exists to prevent: absence must be a designed state.

So the coverage LEVEL and the gap NOTE are hand-authored below, in `POLICY`. They are
editorial statements and they should be written by a person.

What is derived from the build is only the mechanical part: which years exist, which status
classes back the claim, and which source document to cite. Deriving those by hand across six
scopes, three domains and twenty-five years is 300 rows of transcription, which is 300
chances to be wrong about something a script can read.

## Why deriving the level too would be worthless

If this script computed the coverage level from the data, then the pipeline gate that checks
the level against the data (`_check_scope_coverage` in `scripts/production/validate.py`)
would be checking the script against itself, and would pass forever. That is precisely the
failure this repo has produced eight times in one day — a check written narrower than the
thing it is meant to catch (see the napkin).

Keeping the level hand-authored means the gate is a real adversary:

- claim `unavailable` for a scope that in fact has values, and the gate fails the build;
- claim `complete` for a scope with nothing behind it, and the gate fails the build.

Either way a human has to change either the claim or their mind. That is the point.

## Two-pass, deliberately

This reads `dist/gc_budget.sqlite`, so the order is: build, regenerate, build again. The
second build is what validates the regenerated claim. The generator refuses to run against a
missing or stale database rather than silently emitting a partial year range.

Rows whose (scope, domain) pair is not in `POLICY` are preserved byte-for-byte. The General
Fund's own position and outflow rows were curated earlier and reviewed; this script must not
touch them, and it asserts that it has not.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
import sys
from collections import Counter
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DATA = _ROOT / "data" / "production"
_DB = _ROOT / "dist" / "gc_budget.sqlite"
_CSV = _DATA / "scope_coverage.csv"

_FIELDS = [
    "scope_entity_id", "domain", "fiscal_year", "coverage_level",
    "status_classes", "gap_note", "source_code",
]

# Hand-authored coverage claims. One entry per (scope entity, domain) the county overview
# renders. Levels come from the controlled vocabulary in schema.py:
# complete | partial | total_only | unavailable.
#
# Note the discipline in the wording of every gap note: it says what THIS SITE has not
# extracted, never what the county did not publish. We know the former for certain; the
# latter would be a claim about a document we have not exhaustively read.
POLICY: dict[tuple[str, str], tuple[str, str]] = {
    ("budget.total", "inflow"): (
        "partial",
        "Money in is covered for the General Fund only. The special revenue, debt "
        "service, and enterprise funds each raise their own money, which this site has "
        "not extracted from official sources. General Fund revenue is not county revenue.",
    ),
    ("budget.total", "position"): (
        "partial",
        "Fund balance position is covered for the General Fund only. The other funds "
        "hold balances that this site has not extracted from official sources.",
    ),
    ("budget.total", "outflow"): (
        "complete",
        "The four funds the county reports in its total budget, each at its published "
        "total. Detail within a fund varies by fund.",
    ),
    ("fund.general", "inflow"): (
        "complete",
        "Complete at the county's published revenue-category level. Detail within a "
        "category is published for FY2026 Other Revenue only.",
    ),
    ("fund.special-revenue", "inflow"): (
        "unavailable",
        "Revenue for the special revenue funds has not been extracted from official "
        "sources. Only what each fund is authorised to spend is shown.",
    ),
    ("fund.special-revenue", "position"): (
        "unavailable",
        "Fund balance position for the special revenue funds has not been extracted "
        "from official sources.",
    ),
    ("fund.special-revenue", "outflow"): (
        "partial",
        "The fund total, and the county's named special revenue funds at their own "
        "totals. There is no detail within each named fund.",
    ),
    ("fund.debt-service", "inflow"): (
        "unavailable",
        "Revenue for the debt service fund has not been extracted from official sources.",
    ),
    ("fund.debt-service", "position"): (
        "unavailable",
        "Fund balance position for the debt service fund has not been extracted from "
        "official sources.",
    ),
    ("fund.debt-service", "outflow"): (
        "total_only",
        "The fund total only. No detail within the fund has been extracted from "
        "official sources.",
    ),
    ("fund.enterprise", "inflow"): (
        "complete",
        "Complete at the Enterprise operating-budget category level. Fund-balance usage "
        "and other financing are identified separately and are not outside revenue.",
    ),
    ("fund.enterprise", "position"): (
        "unavailable",
        "The FY2002 source does not print an Enterprise fund-balance usage or position line.",
    ),
    ("fund.enterprise", "outflow"): (
        "complete",
        "Complete at the source's Solid Waste and Stormwater summary-category level. "
        "Detail within each operating division is not claimed.",
    ),
    ("fund.internal-service", "inflow"): (
        "unavailable",
        "Revenue for the internal service fund has not been extracted from official "
        "sources.",
    ),
    ("fund.internal-service", "position"): (
        "unavailable",
        "Fund balance position for the internal service fund has not been extracted "
        "from official sources.",
    ),
    ("fund.internal-service", "outflow"): (
        "total_only",
        "The fund total only, and it is deliberately outside the county total: it is "
        "departments billing each other, so counting it would count the same spending "
        "twice.",
    ),
}


def _policy_for(scope: str, domain: str, fiscal_year: int) -> tuple[str, str]:
    """Return the reviewed claim, including fund-coverage breakpoints by year."""
    if (scope, domain) == ("fund.enterprise", "inflow"):
        return POLICY[(scope, domain)]
    if (scope, domain) == ("fund.enterprise", "outflow"):
        return POLICY[(scope, domain)]
    if (scope, domain) == ("fund.enterprise", "position") and fiscal_year >= 2003:
        return (
            "partial",
            "The operating-budget page prints Solid Waste and Stormwater Fund Balance "
            "Usage (Contribution), but not beginning or ending fund-balance positions. "
            "Positive values are usage and negative values are contributions.",
        )
    if fiscal_year >= 2010:
        if (scope, domain) == ("budget.total", "inflow"):
            return (
                "partial",
                "Money in is covered at the published summary-category level for the "
                "General Fund, selected Special Revenue Funds, Debt Service Fund, and "
                "Enterprise Funds. Enterprise fund-balance usage and financing are kept "
                "separate from outside revenue; fund-level amounts are not a consolidated "
                "county revenue statement.",
            )
        if (scope, domain) == ("budget.total", "position"):
            return (
                "partial",
                "Fund balance position is covered for the General Fund and selected "
                "Special Revenue Funds, plus the Debt Service Fund. Enterprise coverage "
                "is limited to fund-balance usage or contribution because its operating "
                "budget does not print beginning and ending positions.",
            )
        if (scope, domain) == ("fund.special-revenue", "inflow"):
            return (
                "complete",
                "Complete at the selected Special Revenue Funds' published summary-category "
                "level. No detail within each category is claimed, and the selected-funds "
                "scope can change between budget books.",
            )
        if (scope, domain) == ("fund.special-revenue", "position"):
            return (
                "complete",
                "Complete for the published beginning balance, net change, and ending "
                "balance of selected Special Revenue Funds. Fund balance is an accounting "
                "position, not cash; reserved and unreserved composition is available "
                "only through FY2019.",
            )
        if (scope, domain) == ("fund.special-revenue", "outflow"):
            return (
                "complete",
                "Complete at the selected Special Revenue Funds' published summary-category "
                "level. Named-fund totals are covered separately, but detail within each "
                "named fund is not.",
            )
        if (scope, domain) == ("fund.debt-service", "inflow"):
            return (
                "complete",
                "Complete at the Debt Service Fund's published summary-category level. "
                "Bond proceeds and interfund transfers are shown separately as financing, "
                "not counted as operating revenue.",
            )
        if (scope, domain) == ("fund.debt-service", "position"):
            return (
                "complete",
                "Complete for the published beginning balance, net change, and ending "
                "balance of the Debt Service Fund. Fund balance is an accounting position, "
                "not cash available for general purposes.",
            )
        if (scope, domain) == ("fund.debt-service", "outflow"):
            return (
                "complete",
                "Complete at the Debt Service Fund's published summary-category level, "
                "including principal retirement and interest and fiscal charges. The bond "
                "detail schedules are not yet modeled here.",
            )
    if (scope, domain) == ("budget.total", "inflow"):
        return (
            "partial",
            "Money in is covered for the General Fund and Enterprise Funds at their "
            "published category levels. Special Revenue and Debt Service inflows are not "
            "extractable from the older online budget books.",
        )
    if (scope, domain) == ("budget.total", "position") and fiscal_year >= 2003:
        return (
            "partial",
            "General Fund position is covered. Enterprise coverage is limited to the "
            "source-printed fund-balance usage or contribution; Special Revenue and Debt "
            "Service positions are not extractable from the older online budget books.",
        )
    return POLICY[(scope, domain)]

# Status classes are ordered by how a reader should meet them, not alphabetically:
# what was audited, then what was adopted, then what was estimated or projected.
_STATUS_ORDER = ["actual", "adopted", "approved", "estimated", "projected", "proposed", "financing"]


def _status_sort_key(status_class: str) -> tuple[int, str]:
    if status_class in _STATUS_ORDER:
        return (_STATUS_ORDER.index(status_class), status_class)
    return (len(_STATUS_ORDER), status_class)


def _read_existing() -> list[dict]:
    with _CSV.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise SystemExit(
            f"{db_path} does not exist. Run `python3 -m scripts.production.pipeline` first: "
            "this generator reads the build, then the next build validates what it wrote."
        )
    return sqlite3.connect(db_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        type=Path,
        default=_DB,
        help="built SQLite database (use build/gc_budget_build.sqlite after a coverage-gate failure)",
    )
    args = parser.parse_args(argv)
    conn = _connect(args.db)
    # Imported here rather than at module scope so the shared scope/domain logic has exactly
    # one definition, in the validator that adversarially checks this file's output.
    from scripts.production.validate import scope_domain_backing

    year_row = conn.execute(
        "SELECT MIN(fiscal_year), MAX(fiscal_year) FROM canonical_value "
        "WHERE entity_id='budget.total'"
    ).fetchone()
    if not year_row or year_row[0] is None:
        raise SystemExit("the build has no budget.total canonical values; is it complete?")
    first_year, last_year = int(year_row[0]), int(year_row[1])

    backing = scope_domain_backing(conn)

    existing = _read_existing()
    preserved = [r for r in existing if (r["scope_entity_id"], r["domain"]) not in POLICY]
    overwritten = {(r["scope_entity_id"], r["domain"]) for r in existing} & set(POLICY)
    if overwritten:
        # Not fatal, but it means a previously curated pair is now generated. Say so loudly
        # rather than letting reviewed wording disappear into a diff.
        print(f"NOTE: regenerating {len(overwritten)} previously curated scope/domain pairs: "
              f"{sorted(overwritten)}", file=sys.stderr)

    rows = list(preserved)
    for scope, domain in POLICY:
        for fy in range(first_year, last_year + 1):
            level, note = _policy_for(scope, domain, fy)
            values = backing.get((scope, domain, fy), [])
            statuses = sorted({v.status_class for v in values}, key=_status_sort_key)
            source_code = ""
            if level != "unavailable" and values:
                # Prefer the scope entity's own value as the thing to cite; otherwise the
                # document that backs most of the claim. Deterministic on ties.
                own = [v for v in values if v.entity_id == scope]
                pool = own or values
                counts = Counter(v.source_code for v in pool if v.source_code)
                if counts:
                    source_code = min(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            rows.append({
                "scope_entity_id": scope,
                "domain": domain,
                "fiscal_year": str(fy),
                "coverage_level": level,
                "status_classes": ";".join(statuses),
                "gap_note": note,
                "source_code": source_code,
            })

    rows.sort(key=lambda r: (r["scope_entity_id"], r["domain"], int(r["fiscal_year"])))

    # The preservation promise, asserted rather than assumed. Compared by content, not by
    # position: this script sorts the whole file, and the General Fund's curated rows move
    # within it without changing.
    def _key(row: dict) -> tuple:
        return tuple(row.get(field) or "" for field in _FIELDS)

    kept = sorted((_key(r) for r in rows if (r["scope_entity_id"], r["domain"]) not in POLICY))
    if kept != sorted(_key(r) for r in preserved):
        raise SystemExit("refusing to write: a preserved row changed. Fix the generator.")

    with _CSV.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    generated = len(rows) - len(preserved)
    print(f"wrote {len(rows)} coverage rows to {_CSV.relative_to(_ROOT)} "
          f"({generated} generated, {len(preserved)} preserved)")
    print("now re-run `python3 -m scripts.production.pipeline` — that build is what "
          "checks the claims this file just made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
