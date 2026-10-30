---
type: research
date: 2026-07-17
status: active
---

# Existing dataset baseline audit

## Status

The existing FY2002–FY2026 dataset is **provisional**. It rebuilds reproducibly, but deterministic checks and an initial primary-source comparison found content and schema defects. No source values have been changed pending the blind extraction and adjudication pass.

## Frozen input

Source directory: a provisional working dataset kept outside this repository

| File | SHA-256 |
|---|---|
| `budget_totals.csv` | `82928c0be7f262d9c1626b04b8c8b74f5438dbdecfffc53192214fedce62a2b5` |
| `general_fund_balance.csv` | `1ae7edc25bce9f5acd1d41749f7a68a1154758ccd10569657d7705fa15dea8a8` |
| `general_fund_departments.csv` | `7810f77a69097209271c5503e47d8b0dcf10df4988e4c88b6b7be4fc10d2adb1` |
| `general_fund_projection.csv` | `ac50c8ca1df668ccedae4a26b259250240dbe748723af66009bc9cc212b4e54f` |
| `general_fund_revenue.csv` | `a49ce3a58c9805d586bc2d6023dd67b1d1c87b24a3de203a23cde1680ba7e72f` |
| `special_revenue_funds.csv` | `0297613f1d5cdffa6ab5020a6b054b82adbfb2d67391bdf7a7b47ca6c898ef27` |
| `build_database.py` | `3e84abe4db4e1fb82ab079219745d3b9a6b20d319f8c53bbcecf1007334a2d53` |
| `gc_budget.db` | `bd2d68e6d1756c373bd36290add8befa628cb99222125dbd08c86771dd356082` |

## Inventory

| Table | Rows | Coverage |
|---|---:|---|
| Budget totals | 25 | FY2002–FY2026 |
| General Fund departments | 230 | FY2002–FY2026 |
| Special-revenue funds | 206 | FY2002–FY2026 |
| General Fund revenue | 29 | FY2020–FY2026 |
| General Fund balance | 10 | FY2020–FY2029 |
| General Fund projection | 7 | FY2023–FY2029 |

A clean temporary rebuild from the CSVs reproduces the current SQLite tables and views. The defects below are therefore in the source CSV content or schema, not unexplained drift in the database file.

## Deterministic findings

### Budget-total arithmetic

- FY2002 `general_fund_total` exceeds `general_fund_operating + general_fund_transfers` by $5.
- FY2015 `total_budget` is $400 lower than the sum of General Fund total, special revenue, debt service, and enterprise funds.

### General Fund department sums

The stored department components do not equal the stored General Fund operating total in these years:

| Fiscal year | Component sum minus stored total |
|---|---:|
| FY2002 | $5 |
| FY2003 | $1,199,786 |
| FY2024 | $8,635,261 |

The FY2024 issue contains clear later-column carryovers when compared with the county's FY2026 adopted budget overview:

| Department | Stored FY2024 | Source-reported FY2024 | Difference |
|---|---:|---:|---:|
| Department of Administration | $44,035,256 | $39,132,287 | $4,902,969 |
| Department of General Services | $8,349,329 | $7,514,258 | $835,071 |
| Department of Public Works | $26,595,450 | $23,698,229 | $2,897,221 |

These three differences sum to the full $8,635,261 overstatement. The existing FY2024 operating total of $233,590,065 agrees with the source table, but its stored department components do not.

Primary source: [Greenville County FY2026 adopted budget](https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf), Budget Expenditure Overview.

### Special-revenue component sums

| Fiscal year | Component sum minus stored total |
|---|---:|
| FY2003 | $588,011 |
| FY2006 | $4,749,893 |
| FY2007 | $6,700,000 |
| FY2010 | -$9 |
| FY2021 | $902,000 |
| FY2025 | -$1,000,000 |

Some differences may result from omitted funds, changed labels, or competing official document versions. They remain defects in the present schema because the stored components cannot reproduce the stored total and no exclusion metadata explains why.

### Duplicate General Fund revenue

FY2022 contains two rows with the same logical key, both labeled actual Property Taxes:

- $112,186,696
- $112,960,396

The current `property_tax_trend` view includes both, so its lag calculation treats them as successive observations within one fiscal year.

### Fund-balance continuity

The FY2023 ending balance is $64,940,704, while the FY2024 beginning balance is $82,615,331, a $17,674,627 discontinuity. This may reflect a restatement, source-version change, or mixed table meanings. The present schema cannot explain it.

### Projection semantics

The `general_fund_projection` columns do not reconcile consistently under their current names. In particular, `excess_deficiency` does not consistently equal `total_revenue - total_expenditures`, and `net_change` cannot be reproduced consistently from the stored transfer fields.

The FY2026 county book contains multiple related tables with recurring revenue, other financing sources, recurring expenditures, transfers, total uses, excess/deficit, and ending balance. The present flattened schema appears to mix concepts from those tables. The blind pass must re-extract the complete table before the projection schema is redesigned.

## Source-catalogue findings

- The county's current official archive begins with the FY2004–FY2005 biennium. No reliable standalone adopted FY2002–FY2003 source has been located.
- Later budget books may report FY2002 and FY2003 as comparison columns, but those values must retain their actual/budget status rather than being assumed to be adopted appropriations.
- The current official archive ends with the adopted FY2026 book.
- The FY2027 third-reading agenda links an unsigned ordinance explicitly labeled “after 2nd Reading.” A final adopted FY2027 book or signed ordinance has not yet been located, so FY2027 remains un-ingested.

See `data/source-manifest.csv` for the official source catalogue and version status.

## Next audit gate

No corrections should be applied until the blind extractor returns source-reported values with document, page, table, label, and status. Every mismatch will then be adjudicated against the cited page and recorded in a discrepancy log.
