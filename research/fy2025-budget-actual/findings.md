# Findings — General Fund budget vs. actual, Greenville County (FY2011–FY2025)

Research lead memo. Source: Greenville County ACFR/CAFR, General Fund *Schedule of Revenues,
Expenditures and Changes in Fund Balances — Budget and Actual (Budget Basis)*, one per fiscal
year. All numbers carry row-level provenance in `sources.csv`. Causes are stated only where the
source states them; otherwise the amount is reported and the cause marked as not documented.

## 1. Which revenue sources most exceeded or missed budget? (FY2025)

Actual General Fund revenue beat the final budget by **+$23.1M** ($246.9M vs $223.8M). The gap is
broad-based, led by:

- **Other miscellaneous revenues** +$6.46M (actual $9.23M vs $2.77M budget)
- **Intergovernmental** +$5.08M
- **Property taxes** +$4.88M (the largest single source, $149.5M)
- **County offices** +$4.79M
- **Interest revenue** +$3.37M (actual $4.05M on a $0.68M budget — a 6× overage)

Only **franchise fees** missed, −$1.48M. The source does not state causes for the overages.

## 2. Which departments most over- or under-ran budget? (FY2025)

Actual spending exceeded final budget by **−$10.07M** ($251.7M vs $241.6M). Concentrated in:

- **Law enforcement services** −$6.30M over (actual $80.5M) — by far the largest driver
- **Emergency medical services** −$1.95M over
- **Boards, commissions and others** −$1.81M over

Under budget: Community development and planning +$0.64M, Administrative services +$0.44M, Capital
outlay +$0.16M. (Total also includes $824,428 debt-service principal, not a department line.)

## 3. Recurring operations, one-time, or accounting?

Not determinable from the budgetary schedule alone. The schedule reports amounts and variances; it
does not classify them as recurring vs. one-time. Any such attribution would require the MD&A and
notes and is **not made here**.

## 4. Which cross-year comparisons are safe, and which need a break marker?

- **Safe:** the fund-balance position series FY2011–FY2025. Every year's ending fund balance equals
  the next year's beginning (validated, unbroken), and every year reconciles internally. This is a
  trustworthy 15-year trend line.
- **Needs a qualifier:** FY2016, FY2017, FY2022, FY2023 carry additional budgetary lines
  (appropriated fund balance / asset sales, not separately broken out in these books) so
  `revenue − expenditure + transfers` does not fully equal the net change those years. The net
  change and fund balances are still correct; only the flow *decomposition* is incomplete.
- **Break marker:** **FY2006–FY2010 are excluded.** Those older books present the budgetary General
  Fund on a "fund balance usage" basis without a clean beginning/ending fund balance, so they are
  not comparable to FY2011+ without bespoke cross-statement work.
- **Basis note:** FY2011–FY2017 schedules print an explicit *Budget-to-GAAP basis adjustment*
  (Note 1-D). Budget-basis and GAAP-basis actuals differ by that documented amount; both are
  retained. FY2018–FY2025 present with no material adjustment.

## 5. What can the interface state directly, and what needs a careful qualifier?

- **State directly:** the FY2025 budget-vs-actual equation (beginning + money in − money out =
  ending), the 15-year fund-balance trend, and department/revenue-category variances for FY2025 —
  all reconciled to the audited source.
- **Qualify:** (a) "budget basis" vs "GAAP basis" wherever an adjustment exists (FY2011–2017);
  (b) the FY2022–FY2023 transfer surge (transfers in of $55.7M and $45.0M vs a ~$15M norm — the
  source does not explain the spike, so present the amount, not a cause); (c) fund balance is an
  accounting position, not spendable cash.

## Method

ACFRs pulled from greenvillecounty.org/FinanceDivision.
FY2011, FY2013–FY2025 extracted deterministically from the PDF text layer; **FY2012 is a scanned
book with no usable text layer and was OCR'd** (tesseract), then held to the same reconciliation
bar. The General Fund schedule is isolated as the single-fund (4-column) budgetary schedule whose
total revenue exceeds $100M — no other fund approaches it. See `validation-report.md`.

---

# Phase 2 addendum — line detail, fund-balance classifications, transfers

## Multi-year line detail (FY2011–FY2025)
`general-fund-revenue-by-year.csv` (6 revenue categories × 15 years) and
`general-fund-expenditure-by-year.csv` (departments × 15 years). Every year's categories sum
exactly to its total revenue, and every year's departments (plus a labeled debt-service/other
residual where the schedule carries one) sum exactly to its total expenditure. FY2012 detail is
OCR-derived. Note the department *names* change over the series (e.g., pre-2013 "Public works" /
"Human resources" vs. later "Emergency medical services" / "Community development") — an
organizational reclassification, so department-level trend lines need a break marker around 2013.

## FY2025 fund balance — how much is actually available
Of the $81,545,344 ending General Fund balance: **$65,438,641 (80%) is unassigned** and available
at the County's discretion; $11,187,615 is nonspendable (mostly $11.17M advances to other funds);
$4,919,088 is committed (contingency). Nothing is restricted or assigned in the General Fund.
This is the number to lead with for "available fund balance" — not the $81.5M total.
See `fy2025-fund-balance-classifications.csv`.

## FY2025 transfers (Note 8)
Transfers out of the General Fund ($9.64M) went mostly to Nonmajor Governmental Funds ($7.22M) and
the Capital Projects Fund ($2.34M). Transfers in ($15.42M) came from Nonmajor Governmental Funds
($13.17M) and Internal Service Funds ($2.25M). The county states transfers move revenue from the
collecting fund to the spending fund and finance other-fund programs from unrestricted General Fund
revenue; FY2025 specifically moved bond proceeds to Capital Projects for the County Administration
Complex. See `fy2025-transfers.csv`. (This resolves the earlier "present the amount, not a cause"
qualifier for FY2025 — the note documents the purpose. The FY2022–23 transfer surge is not covered
by this note and remains amount-only.)

## Salary / operations sub-lines — NOT in the ACFR
The research asked for salary/operations/contractual sub-lines "where available." They are **not**
in the ACFR — its General Fund budgetary schedule stops at the department level (Administrative
services, Law enforcement, etc.). That object-level detail lives in the county's **adopted budget
books** (FY2004–FY2027), not the audited report. Extracting it would be
a separate budget-book parse, out of scope for this audited-actuals package.

## Flow residual (#2) — itemized
The "other budgetary items" residual (net change minus revenue−expenditure+transfers) for FY2016,
FY2017, FY2022, FY2023 is attributable to **other financing sources beyond transfers** — gains/
proceeds on sales of land and capital assets, and (FY2023) a budget-to-GAAP basis adjustment. Clean
single-item years: FY2016 = $1,486,060 land sale; FY2017 = $855,170 land sale; FY2022 = $198,102
lease proceeds. FY2023's $3,164,209 = $1,343,082 asset sale + a ~$1.82M net budget-to-GAAP
adjustment. See `flow-residual-itemization.csv`. Fund balances remain authoritative (internal +
chain checks pass every year); this only decomposes the small operating-vs-fund-balance residual.

## Department crosswalk (#7)
`department-crosswalk.csv` maps every year's source department label to a canonical key (149 rows,
0 unmapped). Seven departments compare cleanly across all 15 years (label drift normalized). The
**FY2013 reorganization** is a genuine break: FY2011–12 {human_resources, public_works} were replaced
by FY2013+ {community_development_planning, emergency_medical_services} — a reorganization, not a
rename, so those four lines are not comparable across the 2013 boundary. Debt service breaks out as
its own line FY2022+. The FY2026 budget book uses a THIRD taxonomy (EMS embedded in "Department of
Administration"; narrower "Public safety"; retains "Public works") — mapped with per-row caveats.
