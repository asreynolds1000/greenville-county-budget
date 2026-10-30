---
type: document
date: 2026-07-17
status: active
---

# Curation notes

The seed dimensions in `data/production/` were expanded and stabilized beginning
2026-07-17. Reconciliation is the safety net for every additive published tier.
After the sources–funds–uses re-baseline on 2026-07-20, more than 99% of
observations are mapped (2,534 of 2,542). The remaining 8 are retained
alternate-source conflict rows. No source rows were silently lost.

## Tiers curated and their reconciliation status

| Tier | Entities | Reconciliation |
|---|---|---|
| Whole-budget fund totals (seed) | 5 funds + total | Four funds → TOTAL BUDGET, 25/25 years |
| Broad GF revenue categories | 8 + total | Categories → Total Estimated Financial Sources, 25/25 |
| Named special-revenue funds | 14 | Funds → SR total, 25/25 |
| Internal Service Fund components | 4 (+ seed Fleet) | Components → ISF total, adopted 25/25 |
| GF departments (this tier) | 93 depts + 16 categories + gf.expenditures | Zero adopted failures; 34 rollups have no printed direct total for comparison |

## Department tier — editorial decisions to spot-check

**Category merges (reorganization identity).** Raw category labels were merged where they
name the same function across renames/OCR drift. **Research against the county's own
budget books (FY2004–FY2024 organizational-structure sections) confirmed most of
these** — see "Reorganization research" below. Category display names now use the
county's real names. The merges:

- `opcat.administrative` ← ADMINISTRATIVE, APPOINTED OFFICIALS/ADMINISTRATIVE SERVICES, and the TOTAL variants
- `opcat.department-of-administration` ← DEPARTMENT OF ADMINISTRATION and its total variant; the FY2026 book confirms this as a distinct category
- `opcat.general-services` ← GENERAL SERVICES, DEPARTMENT OF GENERAL SERVICES
- `opcat.public-safety` ← PUBLIC SAFETY, DEPARTMENT OF PUBLIC SAFETY
- `opcat.public-works` ← PUBLIC WORKS, DEPARTMENT OF PUBLIC WORKS
- `opcat.judicial` ← ELECTED & APPOINTED OFFICES/JUDICIAL, JUDICIAL SERVICES
- `opcat.law-enforcement` ← ELECT. & APPTD. OFFICES/LAW ENFORCE., LAW ENFORCEMENT SERVICES
- `opcat.fiscal` ← ELECTED AND APPOINTED OFFICES/FISCAL, FISCAL SERVICES
- `opcat.community-development-planning` ← COMMUNITY DEVELOPMENT AND PLANNING, COMMUNITY PLANNING AND DEVELOPMENT, DEPARTMENT OF PLANNING AND DEVELOPMENT
- `opcat.other-services` ← OTHER SERVICES, O THER SERV ICES (OCR)

Departments (the 93 detail entities) were **not** merged across renames — OCR
variants cluster together, but genuinely different names stay separate. If two
department names are the same office renamed, that merge has not been made.

**Architecture.** The department tree is `gf.expenditures → operating category →
department`, rooted at `gf.expenditures` (TOTAL GENERAL FUND EXPENDITURES).
`fund.general` exposes this root through a non-additive `detail_view` relationship:
users can drill into the 11-category FY2026 detail without counting those values a
second time under the whole-budget total. Expenditures and budget differ in four
years, so they are related views rather than interchangeable totals.

## Reconciliation status and explicit exceptions

- Every adopted rollup with a printed direct total reconciles. The publication
  validator treats any future adopted mismatch as an error.
- Two non-adopted historical rollups have partial source coverage and remain audit
  warnings outside the adopted publication gate: the FY2007 proposed total-budget
  view and the FY2011 proposed Internal Service Fund comparison.
- **FY2002–FY2005** have no extracted category-total rows (they came from the
  earliest book's comparison columns), so those mid-level rollups have no printed
  direct comparison total.
- **GF expenditures ≠ GF budget** in FY2002, FY2005, FY2007, FY2014.

The stabilization review corrected two linked table-parser defects: hyphens in
labels could be mistaken for zero-value cells, and sparse rows could shift a later
year or change column into the wrong fiscal year. The affected official pages were
re-extracted and regression-tested. This removed all canonical disputes and all
adopted rollup failures without altering the original 731-cell legacy comparison.

## FY2022–FY2023 department detail — recovered

The FY2022–FY2023 General Fund department appropriations were an embedded raster
image in the county PDF (page 60), which the text extraction could not read. They
are now **recovered**: rendered at 200 dpi and transcribed **twice independently** —
once by manual reading and once by Gemini 2.5 Pro — with both reads reconciling to
the printed category subtotals and grand totals to the dollar for both years
(FY2022 $205,859,228; FY2023 $213,676,673). Stored as a distinct provenance-tagged
source in `data/recovered/`, ingested separately from the frozen blind extraction,
and regenerated into the department tree (`scripts/curation/gen_departments.py`).
Coverage for those years is now marked "recovered," not "gap."

## Reorganization research (validating the merges)

Research into the county's own budget-book organizational-structure sections
(FY2004–FY2024) established:

- **Confirmed same, renamed:** General Services (= "Department of General Services"),
  Public Works (= "Department of Public Works"), and the Elected & Appointed Offices/
  {Judicial, Fiscal, Law Enforcement} → {Judicial, Fiscal, Law Enforcement} Services
  rename (~FY2006–08, under County Administrator Joseph Kernell, hired Jan 2004).
- **Confirmed same, weaker evidence:** Public Safety (= "Department of Public Safety").
- **Evolving function:** planning went category-less → "Community Development and
  Planning" (FY2014) → split into "Community Planning and Development" + a re-separated
  "Public Works" (by FY2024). Merged here as one entity; the FY2024 split is a
  candidate for refinement.
- **Distinct FY2026 category:** the official FY2026 appropriations summary prints
  `DEPARTMENT OF ADMINISTRATION` separately from Administrative Services. It is
  therefore modeled as `opcat.department-of-administration`, not treated as OCR.
- **New category:** "Strategic Operations" was created between FY2014 and FY2024,
  pulling GIS out of General Services and EMS out of Public Safety (the year-scoped
  edges capture this — EMS sits under Public Safety in FY2010 and Strategic Operations
  in FY2022).

## Sources–funds–uses re-baseline (2026-07-20)

All 150 `general-fund-balances-and-financing` observations are now mapped as
position, position-adjustment, financing-in, financing-out, or net-financing
entities. The source pages were checked to confirm these are the General Fund
column of the consolidated all-funds statement. Early net `Transfers` remain
distinct from the directional `Transfers In` / `Transfers Out` presentation that
begins in FY2018. The source-signed negative Transfers Out value is preserved;
the adopted operating overview's positive Interfund Transfers value is a separate
status-class observation on the same entity.

Seven controlled General Fund statements now validate 111 year instances:
position (25), financing (25), outflow (25), operating overview (25), and budget
sources (FY2018–26, 9), plus FY2026 Other Revenue detail and Transfers Out detail.
The FY2026 position, financing, sources-to-budget, and operating-uses equations
all reconcile to zero. Scope-aware position coverage is recorded for FY2002–26.

All 307 rows in the parallel, coarser General Fund operating overview are mapped.
Its broad categories reconcile to Total General Fund Operating Budget in all 25
years and remain a separate statement rather than additive children of the
department hierarchy. Eight retained alternate-source conflict observations are the only
unmapped rows in the production corpus. Their cited pages were visually rechecked on 2026-08-03.
They are deliberately left unmapped because the frozen register contains only the disagreeing
component cells, not the complete overview-component series; mapping them alone would publish
misleading fragments. The exact IDs and content echoes live in
`unmapped_observation_allowlist.csv`, and the production validator now fails on a changed
allowance or any ninth unmapped observation.

The department-detail total and official overview General Fund total differ in
three adopted years: FY2005 by -$7,472,167, FY2007 by -$4,980,433, and FY2014 by
+$2,000 (department detail minus overview). FY2002–03 have no adopted department
total in the selected detail series. These are source-view differences and remain
visible; neither statement is used to overwrite the other.

## FY2002–05 category-total fix (2026-07-19)

The earliest books (FY2002–05) print category totals with OCR letter-splits
(`TO TAL PUBLIC SAFETY`). The generator gated total detection on a raw
`startswith("TOTAL")`, which those variants failed, so the 10 spaced category
totals fell through and became phantom `dept.total*` "departments" **inside their
own category** — doubling that category's rollup (e.g. `opcat.administrative`
FY2004 rolled to 3,101,068 against the printed 1,550,534, with no printed direct
total, so the reconciliation gate never flagged it). Fix: `gen_departments._is_total_label`
despaces before matching and routing is gated on `TOTAL_MAP` membership, so every
printed total — clean or OCR-split — attaches to its `opcat.*` as a **direct
value**. One label variant (`TOTAL LAW ENFORCEMENT SERVICES`, distinct normalized
key from `TOTAL LAW ENFORCEMENT`) was added to `TOTAL_MAP`. This creates the
FY2004/05 `gf.expenditures` rollup tier (Σ category totals = 106,182,092 FY2004 /
118,463,012 FY2005) and makes all 10 categories reconcile to the dollar in
FY2004 and FY2005. Guarded by `tests/test_curation_totals.py`.

## Dual-parent departments resolved (2026-07-20)

The printed General Fund Appropriations Summary sections resolve the former
Property Management and Animal Care overlap directly. Both appear under Public
Works through FY2013, under Community Development and Planning beginning FY2014,
and under Public Works again in FY2024–26. Property Management has no row in the
recovered FY2022–23 department table; Animal Care remains under Community Planning
and Development for those years.

The year-scoped hierarchy edges now follow those printed assignments. No year
gives either department two parents, and no category sum can be inflated by the
former overlap.

## FY2026 Other Revenue and transfer detail (2026-07-20)

The FY2026 General Fund Revenue Summary on physical PDF page 57 (printed page 56)
provides ten lines beneath Other Revenue. They sum exactly to $6,772,089; eight
nonzero lines are presented in the interface and the two printed zero lines remain
in the data and downloads. This adds ten source observations and ten controlled
revenue-source entities.

The General Fund Appropriations Summary on physical PDF page 58 (printed page 57)
shows that the $8,502,046 of Transfers Out comprises $8,052,046 for debt service,
$250,000 for Special Revenue, and $200,000 for matching funds/grants; three other
printed components are zero. Those existing appropriation lines now form a
separate reconciled transfer-detail statement.

The budget narrative names Hospitality Tax, Infrastructure Bank, Workers
Compensation, and State Accommodations Tax as sources of the aggregate
$21,414,993 Transfers In. It does not allocate that amount among the four funds,
so the relationships are recorded as non-additive documented associations rather
than sized flows.
