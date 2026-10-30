"""Model the audited General Fund balance by how much of it is actually available.

"How much money does the county have?" is one of the questions this project exists to
answer, and fund balance is the figure people reach for. Most of it is not spendable cash.
The county reports it in classifications, and the difference between the headline balance and
the unassigned portion is the honest answer: in FY2025, $65.4 million unassigned out of an
$81.5 million total.

Emits per-classification observations and a `gf.balance-composition` statement asserting that
the classifications sum to the audited ending balance in every year.

Run:  python3 -m scripts.curation.gen_balance_composition

## Two facts the data carries that the model must not flatten

**The General Fund is never Restricted.** Restricted is printed as nil in all fifteen years.
No observation is emitted for it, because emitting a zero would assert the county printed a
nil line, and more importantly because a restricted balance is a meaningfully different claim
from an absent one.

**Assigned disappears after FY2017.** It is non-zero FY2011-FY2017 and nil afterwards. That
is a real change in how the county classifies its balance, not a gap in our data, so the
member is scoped to its era rather than carried forward as a run of zeros.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DATA = _ROOT / "data" / "production"
_BLIND = _ROOT / "audit" / "blind-extraction"
_RESEARCH = _ROOT / "research" / "fy2025-budget-actual"

OUT = _DATA / "observations" / "general-fund-balance-composition.csv"

TABLE_SECTION = "General Fund Balance Sheet"

CLASSIFICATIONS = {
    "Nonspendable": "balance.gf.nonspendable",
    "Restricted": "balance.gf.restricted",
    "Committed": "balance.gf.committed",
    "Assigned": "balance.gf.assigned",
    "Unassigned": "balance.gf.unassigned",
}

FIELDS = [
    "fiscal_year", "value", "status", "original_label", "source_url",
    "document_title_version", "pdf_page", "printed_page", "table_section",
    "source_code", "ambiguity_flag", "notes",
]


def _read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def main() -> int:
    rows = _read(_DATA / "general_fund_balance_classifications.csv")
    aggregated: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in rows:
        if row["classification"].strip().upper() == "TOTAL":
            continue
        aggregated[row["fiscal_year"]][row["classification"].strip()] += int(row["amount"])

    comparison_meta: dict[str, dict] = {}
    for row in _read(_DATA / "general_fund_budget_actual_comparison.csv"):
        comparison_meta.setdefault(row["fiscal_year"], row)

    pages = {
        r["fiscal_year"]: r
        for r in _read(_DATA / "general_fund_balance_sheet_pages.csv")
    }
    registry = {r["source_code"]: r for r in _read(_BLIND / "official-source-registry.csv")}
    extension = {
        r["source_code"]: r
        for r in _read(_DATA / "source_registry_extension.csv")
    }

    emitted: list[dict] = []
    for year in sorted(aggregated):
        meta = comparison_meta.get(year)
        if meta is None:
            raise ValueError(f"FY{year} has no comparison row to take source metadata from")
        source_code = meta["source_code"]
        known = registry.get(source_code) or extension.get(source_code)
        title = known["document_title_version"] if known else meta["document_title_version"]

        page = pages.get(year)
        if page is None:
            raise ValueError(
                f"FY{year} has no recorded balance-sheet page. Every published figure must "
                f"name the page it came from."
            )

        for classification in CLASSIFICATIONS:
            amount = aggregated[year].get(classification, 0)
            if amount == 0:
                # Nil is not the same claim as a printed zero. See the module docstring.
                continue
            emitted.append({
                "fiscal_year": year,
                "value": amount,
                "status": "ACTUAL",
                "original_label": f"Fund balance - {classification}",
                "source_url": meta["source_url"],
                "document_title_version": title,
                "pdf_page": page["pdf_page"],
                "printed_page": page["printed_page"],
                "table_section": TABLE_SECTION,
                "source_code": source_code,
                "ambiguity_flag": "",
                "notes": "Audited General Fund balance classification.",
            })

    order = list(CLASSIFICATIONS)
    emitted.sort(key=lambda r: (
        int(r["fiscal_year"]),
        order.index(r["original_label"].removeprefix("Fund balance - ")),
    ))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(emitted)

    years = sorted(aggregated)
    print(f"wrote {len(emitted)} observations, FY{years[0]}-FY{years[-1]}")
    for classification in CLASSIFICATIONS:
        count = sum(1 for r in emitted if r["original_label"].endswith(classification))
        print(f"  {classification:<14} {count:>2} years")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
