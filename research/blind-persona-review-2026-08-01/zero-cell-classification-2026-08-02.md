---
type: research
date: 2026-08-02
status: complete
---

# Zero-cell printed-form classification

This is the evidence record for classifying printed zeros and dashes. It records source form. The
maintainer then decided, on 2026-08-03, that every dash-derived value receives a
visible source-form mark linked to the generic disclosure.

## Scope and result

Before reading any page, `python3 -m scripts.verify_sources --local` verified all 70 source
documents against the recorded hashes. The classifier reconstructed the production ingest set
and found 773 zero-valued observations. All 773 now have an exact-identity sidecar record in
`data/production/printed_cell_forms.csv`:

- 771 cells were printed as a single dash (`-`).
- 2 cells were printed as a double dash (`--`): Parks, Recreation, & Tourism in the FY2012 and
  FY2013 columns of the FY2014-15 Special Revenue table, PDF page 37.
- No cell was printed as numeric `0`, parenthetical `(0)`, or a missing token.

The largest source datasets were Debt Service summary (439 cells), Special Revenue summary
(251), and Enterprise summary (28). The remaining 55 came from the blind and recovered General
Fund / named-fund sources.

## Review method

The fixed-width extractors preserve raw monetary tokens before normalization. Their exact token
and year-column alignment classified 625 cells mechanically. Every other cell received a fresh
source read, and the automatic route received a deliberately non-uniform human sample:

- 104 raster-backed zero cells were visually read at 200 dpi: FY2022-23 PDF pages 40, 47, 52,
  and 60. This includes every raster zero, not a sample.
- 44 cells from older or one-off text routes were read in hash-verified fixed-width page text.
- 91 mechanically classified cells were also visually checked: all zero cells on Special
  Revenue FY2012-13 page 51, Debt Service FY2026 page 49, and Enterprise FY2012-13 page 181.

That makes 239 human-confirmed cells and 534 cells retaining machine-classified status. Review
rules name a readable page group but authorize it with the count and SHA-256 of the exact set of
observation IDs. A new row, removed row, shifted ordinal, or changed echo therefore fails rather
than inheriting a page-level classification.

## What reconciliation establishes—and what it does not

The Special Revenue, Debt Service, and Enterprise extractors independently require every source
column to satisfy the county's printed statement equations. Those equations reconcile when the
printed dashes participate arithmetically as zero, apart from already documented source
exceptions. This is evidence that zero is the correct arithmetic value for these statement
calculations. It does not establish that a dash means "the county appropriated nothing," nor
does it decide whether the site should display `$0`, a visible dash marker, or explanatory text.
That evidence informed, but did not itself settle, the maintainer's 2026-08-03 decision described above.

## Deliberate comparison exclusion

The 773-cell sidecar and validation gate cover ingested observations and their canonical values.
They intentionally do not claim coverage of the separate
`general_fund_budget_actual_comparison.csv` artifact. That comparison contains eight literal zero
fields: the Debt service `original_budget` / `budget` values for FY2022 through FY2025. Those
ACFR-derived rows do not enter observation ingest or canonicalization, and their publication
meaning is already carried by `note.debt-service-no-appropriation`. Widening printed-form
provenance to all comparison value columns is a separate data-contract change; this gate
does not silently certify those eight cells.
