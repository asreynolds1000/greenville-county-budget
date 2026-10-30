# Greenville County Budget Explorer — data methodology (canonical)

**Read this before touching the budget data.** It exists so no one (human or agent) has to
re-derive the source structure, the schedule choice, the basis decision, or how Codex's FY2025
production numbers were produced. Last updated 2026-07-20.

## 1. Sources

| What | Where | Notes |
|---|---|---|
| ACFR / CAFR (audited actuals) | greenvillecounty.org/FinanceDivision — index `FinancialReportNN.aspx`, PDFs under `PDFFinancialReport{YYYY}/` (recent) or `pdf_financial_report_{YYYY}/` (older) | Archive **FY2006–FY2025**. Full URLs in `sources.csv`. |
| Adopted budget books | greenvillecounty.org/ManagementandBudget — `pdf/{YYYY}/BudgetCombined.pdf` etc. | Biennium books **FY2004–FY2027**. Manifest: repo `data/source-manifest.csv`. |
| Restore | `python3 -m scripts.restore_sources` (county URL or byte-identical archive copy, hash-verified) | 475 MB. The app links each figure to the county URL. |

Download method: pattern-probe plus index-scrape of the county site. FY2006–2010 CAFRs are
split into section PDFs (no single "Complete" file); their budgetary schedule is in
`supplementary_information.pdf`.

## 2. THE key structural fact: two General Fund budgetary schedules

Each ACFR contains the General Fund *Budget and Actual (Budget Basis)* comparison **twice**:

- **Summary schedule** (~printed p.85): one page, department-total level, columns
  Original / Final / Actual / Variance. Cleanest and most uniform across years.
- **Detailed schedule** (~printed pp.92–97): multi-page, broken down by **sub-department** and by
  **object** (Salaries / Operations / Contractual agreements / Capital outlay), rolling up to
  `Total <department>`. Uses "Total elected officials – law enforcement / judicial / fiscal"
  groupings that allocate a few offices differently than the summary.

**Both reconcile to the same fund totals** (FY2025: revenue $246,871,125, expenditure $251,720,397),
but department-level numbers differ slightly between them (e.g., Law enforcement: summary
$80,509,371 vs detailed $80,593,880) because the groupings differ.

## 3. DECISION: standardize on the DETAILED schedule

**Codex's production model (`data/production/general_fund_budget_actual_comparison.csv`) uses the
DETAILED schedule.** Verified 2026-07-20: every FY2025 `spending_categories` row matches the detailed
schedule's `Total <dept>` line exactly, and they sum to $251,720,397. Revenue uses the detailed
schedule's 4-category rollup (Property taxes / County offices / Intergovernmental / Other revenues).

Therefore all years should be extracted from the **detailed schedule** for consistency, which also
delivers the object-level detail natively. The **summary schedule is the fallback** only for years
whose ACFR lacks a detailed object-level schedule (older years — verify per year).

> ⚠️ The first research pass (this package's original `audited-general-fund-series.csv` and
> `*-by-year.csv`) used the SUMMARY schedule. Those totals are correct and reconcile, but the
> department **allocations** do not match Codex's FY2025 production baseline. The rebuild re-extracts
> the detailed schedule so FY2011–FY2025 and Codex's FY2025 share one department methodology.

## 4. Basis decision (answers open question #6)

- **Primary basis = budget-basis actual**, i.e. the Actual column of the *Budget and Actual (Budget
  Basis)* schedule. This is what the production model uses and what makes budget-vs-actual coherent.
- Production **"Money In" = revenue + transfers in**, **"Money Out" = expenditure + transfers out**,
  on that basis. (FY2025: Money In actual $262,289,120 = $246,871,125 + $15,417,995; Money Out
  actual $261,365,005 = $251,720,397 + $9,644,608. Verified.)
- **Footnote the budget-to-GAAP adjustment** (ACFR Note 1-D). For FY2011–FY2017 the budget-basis
  actual differs from the audited (GAAP) fund-balance change by this documented amount; it is the
  reconciling item that bridges to the audited ending fund balance. FY2018–FY2025 have no material
  adjustment. Present budget-basis in the reader view; footnote the GAAP bridge.

## 5. Object-level detail (answers open question #3)

The detailed schedule (pp.92–97) carries **Salaries / Operations / Contractual agreements / Capital
outlay** per sub-department (confirmed FY2025). So object detail is **native to the ACFR** for years
that publish the detailed schedule — no budget-book parse needed for those. Older years may only have
department totals; the budget books remain the fallback for object detail where the ACFR lacks it.

## 6. Extraction + validation

- Text: `pdftotext -layout`. **FY2012 is scanned (no unicode text layer) → OCR** (tesseract 5.5.2,
  300 dpi). Hold OCR output to the same reconciliation bar.
- GF isolation: the single-fund 4-column budgetary schedule whose Total revenues > $100M (no other
  fund approaches it).
- **Authoritative checks (every year):** internal `beginning + net change + budget-to-GAAP adj =
  ending`; year chain `ending == next year's beginning`. Both hold FY2011–FY2025. Line detail:
  categories sum to total revenue; departments (+ labeled residual) sum to total expenditure.
- Row-label drift by era: FY2011–2018 use "Fund balance - ending" / "Net changes"; FY2019+ use
  "Fund balance, end of year" / "Net change". FY2006–2010 use a "fund balance usage" presentation
  with no clean begin/end (excluded).

## 7. Scope decisions (2026-07-20)

| # | Decision |
|---|---|
| FY2006–2010 | **Dropped for now, NOT permanent.** Different presentation. |
| FY2026 | **Include the adopted FY2026 budget** (from the budget book — not yet audited). |
| Dept reclassification (~2013) | Old ("Public works", "Human resources") → new ("EMS", "Community development"). **Map old→new** for continuous trend lines; keep a break marker. |
| FY2022–23 transfer surge | Dig the notes/MD&A for a documented cause; if none, present amount-only. |
| Link-out | App cites/links each figure to greenvillecounty.org. Confirmed. |
| Salary/operations | Extract from ACFR detailed schedule where available; budget books otherwise. |

## 8. Production model target (for the merge, #10)

`data/production/general_fund_budget_actual_comparison.csv` schema:
`fiscal_year, section, label, budget, actual, contribution, source_code, document_title_version,
source_url, pdf_page, printed_page`. Sections: `revenue_categories`, `spending_categories`.
`contribution` = normalized result contribution (positive = improved the result). The exporter turns
curated CSVs into validated app JSON deterministically — values are never hard-coded in the React
component (see repo README / roadmap).

## 9. Codex verification log

- **FY2025 production comparison CSV: VERIFIED** (2026-07-20). All revenue + spending categories
  match the detailed schedule and sum to the audited totals. Uses detailed-schedule groupings and
  the budget-basis actual. No corrections needed.
- Note: Codex's `printed_page` cites (91–97) point at the detailed schedule; the summary schedule is
  printed p.85. Both are in the same ACFR.

## 10. Detailed-schedule availability + rebuild spec (2026-07-20)

**Availability:** the detailed object-level schedule (title "SCHEDULE OF REVENUES AND EXPENDITURES",
with per-object Salaries/Operations/Contractual/Capital lines, ~36 salary lines/yr) is present for
**FY2011, FY2013–FY2025**. **FY2012 is the exception** (scanned → OCR; its detailed schedule must be
OCR-extracted, or fall back to budget-book object detail). FY2006–2010 excluded.

**Detailed schedule is a 3-level hierarchy:**
- Revenue: category (Property taxes / County offices / Intergovernmental / Other revenues) →
  office/source sub-line (Register of deeds, EMS fees, Building standards, Interest income, …).
  Codex used the 4 category rollups; the sub-lines are richer and available.
- Expenditure: department (`Total <dept>`) → sub-department → object
  (Salaries / Operations / Contractual agreements / Capital outlay).

**Rebuild spec (the remaining work, in order):**
1. Detailed extractor → per year: revenue category rollups + sub-lines; department totals
   (`Total <dept>`, incl. the "Total elected officials - X" groupings) + sub-department + object
   lines. **Validate FY2025 department totals reproduce Codex's production CSV exactly** before
   scaling. Reconcile: object → sub-dept → dept → total; categories → total revenue.
2. FY2012 detailed detail from OCR (or budget-book fallback), held to reconciliation.
3. Department crosswalk (#7): old (FY2011/2013: Public works, Human resources) → new (EMS,
   Community development). The detailed "Total elected officials - {law enforcement, judicial,
   fiscal}" groupings are the stable spine.
4. Fund-balance classifications + transfers-by-fund, FY2011–FY2024 (#1); itemize FY2016/17/22/23
   flow residual (#2); investigate FY2022–23 transfer surge in notes/MD&A (#8).
5. FY2026 adopted budget from the budget book (#4) — budget-only, no actual (unaudited).
6. Merge to production (#10): emit Codex's schema (`fiscal_year, section, label, budget, actual,
   contribution, source_code, document_title_version, source_url, pdf_page, printed_page`) for all
   years; reconcile FY2025 against Codex's existing rows (must match); wire through the exporter.

**Status at this checkpoint:** phases 1–2 committed (summary-schedule series + line detail +
classifications + transfers, all reconciled). Codex FY2025 verified. This rebuild supersedes the
summary-schedule department allocations with the detailed schedule for production consistency.

## 11. Detailed-schedule rebuild results + gotchas (2026-07-20, 4-agent run, all verified)

**Delivered + independently verified (main-thread reconciliation, not agent self-report):**
- `detailed-revenue-by-year.csv` (504 rows), `detailed-expenditure-by-year.csv` (2,343 rows):
  category→subline revenue and department→sub-department→object (salary/operations/contractual/
  capital) expenditure, FY2011 + FY2013–FY2025 (+ FY2012 OCR). **FY2025 department totals match
  Codex's production CSV EXACTLY (all 10).**

  ⚠️ **CORRECTED 2026-07-21.** This entry previously claimed "all 15 years reconcile." That
  claim was false for the budget columns. The reconciliation behind it ran on the actual
  column and the sub-department level, where every year is clean; it never checked a
  department-total row against its own children in the budget columns. FY2018 Total public
  safety carried 0/0 there against children summing 27,502,445 / 27,764,075, and FY2018
  department totals under-summed the series total by exactly 27,764,075. The county's own
  page prints dashes on that row (a defect in the ACFR, not in our extraction — full
  evidence in `source-anomalies.md` A1), so the cells are now transcribed as absent and the
  total is derived.

  The accurate statement: **all 15 years now reconcile on all three columns at all three
  levels, enforced by `scripts/validate_detailed.py` (2,316 checks).** That script also
  carries the rule the original pass lacked — a total row may not be zero or absent while
  its printed children sum non-zero — so this class of defect cannot recur silently. Four
  source-true zero-budget rows (Debt service FY2022–FY2025) are documented in
  `source-anomalies.md` A2; they are correct and need a note, not a fix.
- `fund-balance-classifications-by-year.csv` (108 rows) + `transfers-by-year.csv` (99 rows),
  FY2011–FY2025: every year's classifications sum to the audited ending balance; transfers
  reconcile both directions. GF is **never Restricted**; **Assigned disappears after FY2017**.
- `fy2026-adopted-budget.csv`: FY2026 adopted GF budget (budget-only), both totals reconcile.
- `transfer-surge-fy2022-fy2023.md`: FY2022 spike = **$41.2M COVID Relief Fund transfer** (documented,
  MD&A breakdown); FY2023 $30.3M from Revenue Bonds → General is **not explained** in the ACFR
  (amount confirmed via the transfers table; cause genuinely absent, not overlooked).

**Gotchas to not rediscover:**
- **`pdftotext` files contain literal form-feed (\f) page breaks** → Python `.splitlines()` desyncs
  from `grep`/`wc -l` line numbers. Use `.split('\n')` only.
- **Detailed schedule needs stricter dash detection** than the summary: a "bare dash = 0" regex
  false-matches the hyphen in `Total elected officials - Judicial`.
- **The county's own ACFR mislabels some total lines**: FY2019–2024 print "Total detention division"
  where it is actually closing the Emergency Management division (copy-paste typo); spelling drift
  ("vererans", "indingent"). Resolve by structural frame position, NOT label text.
- **FY2012 OCR is lower-confidence**: the "Intergovernmental" category header dropped (its rows sit
  under the sub-group "State of South Carolina:"); one subline label has OCR garbage. Dollar figures
  reconcile; the label issue is cosmetic. Flag in any UI.
- **FY2026 budget book uses a DIFFERENT department taxonomy than the ACFR**: EMS is embedded inside
  "Department of Administration" (not its own dept); "Public safety" is narrower (Sheriff/Coroner/ME
  sit under Law enforcement); Capital outlay & Debt service are $0 summary rows (debt service is a
  transfer-out). The county's p.37 summary transposes the Public Works / Planning & Development
  labels vs the itemized p.57 (p.57 is authoritative). A crosswalk (#7) must bridge ACFR↔budget-book.

## 12. Integration

This research is integrated into the production pipeline. `data/production/general_fund_budget_actual_comparison.csv` carries FY2011–FY2025, and the site's General Fund budget-versus-actual pages are generated from it by `python3 -m scripts.production.pipeline` and `python3 -m scripts.production.export_app`. The caveats above (FY2026 budget-only, FY2012 lower confidence, budget-basis versus GAAP, the FY2026 taxonomy) travel with the data as notes.
