# Fund coverage research

This package is the source-first expansion path for non-General-Fund accounting statements. It does not reuse the rejected legacy provisional dataset.

## Special Revenue recent-year pass

The first pass covers the six official budget publications from FY2016-17 through FY2026. Each publication's summary page contributes every printed year column, producing overlapping observations rather than silently replacing earlier books. The production canonicalizer can therefore apply the existing latest-publication rule while retaining alternatives for auditability.

Five pages have usable fixed-width PDF text. The FY2022-23 page is an embedded raster, so `fy2020-2023-raster-recovery.csv` records its reviewed visual transcription as a compact row-by-year matrix. Its totals reconcile to the dollar for financial sources, expenditures, other financing, net change, and ending fund balance. FY2022's printed `Reserved for Encumbrances` is a position adjustment: beginning balance plus net change less that reserve equals the printed ending balance.

Run from the repository root:

```sh
python3 scripts/fund_coverage/extract_special_revenue.py
python3 scripts/fund_coverage/extract_special_revenue.py --check
```

The extractor writes `data/production/observations/special-revenue-summary.csv`. Source PDFs remain in the ignored local source corpus under `data/raw`; every generated observation carries the official URL, physical PDF page, printed page, document version, source code, and the source's ACTUAL/BUDGET status.

The Special Revenue pass covers 23 source-year statements and the canonical FY2014-FY2026 sequence. The observations are mapped into five production accounting statements: inflow, outflow, financing, position, and the FY2014-FY2019 balance composition the source still printed.

## Debt Service recent-year pass

Debt Service uses the same six-publication overlap and latest-book-wins boundary as Special Revenue. Five pages are fixed-width text and the FY2022-23 page is an embedded raster recorded in `fy2020-2023-debt-service-raster-recovery.csv`. The recovery includes every printed zero, the source-signed transfers out, and the $67 beginning-balance difference between the FY2020-21 and FY2022-23 publications rather than smoothing that conflict away.

```sh
python3 scripts/fund_coverage/extract_debt_service.py
python3 scripts/fund_coverage/extract_debt_service.py --check
```

The extractor writes `data/production/observations/debt-service-summary.csv` and applies the same per-source-year gates as the Special Revenue route.

## FY2010-FY2015 inventory correction and backfill

The original scoping pass classified the FY2012-13 and FY2014-15 books as wide-table-only. Direct page inventory found dedicated text-backed fund summaries: Special Revenue on PDF pages 51/48 and Debt Service on PDF pages 54/51. The extraction routes now include those four pages, reaching FY2010 without a fragile horizontal slice of the countywide table. Exact source defects and the unlabelled Debt Service total rows are recorded in `source-anomalies.md`.

## Enterprise operating-budget pass

Enterprise is a different accounting shape, so it has a separate extractor rather than being forced through the governmental-fund summary validator. Direct inventory corrected a second assumption in the scoping pass: Enterprise operating-budget tables exist in every online budget publication, including the four older proprietary-fund files. The extracted source span is therefore FY2002-FY2026—the site's full range—not FY2010-FY2026.

```sh
python3 scripts/fund_coverage/extract_enterprise.py
python3 scripts/fund_coverage/extract_enterprise.py --check
```

The route writes 928 source-faithful observations across 63 publication columns to `data/production/observations/enterprise-summary.csv`. The FY2022-23 page is an embedded raster whose reviewed transcription is `fy2020-2023-enterprise-raster-recovery.csv`. Every other page is extracted from fixed-width PDF text.

The extractor deliberately classifies `Fund Balance Usage (Contribution)` as a position-change/funding line, not outside revenue. It also keeps `Other Financing Sources` separate. Enterprise pages do not print beginning and ending fund-balance positions, so the extraction does not manufacture a complete position roll-forward. `enterprise-flow-differences.csv` records the source's revenue-and-funding total less expenses for every source column; nonzero actual/projected variances remain evidence rather than being forced to zero.

## FY2027 adoption boundary

Council adopted FY2027 on June 16, 2026, but the county's third-reading package still
links the unsigned ordinance after second reading rather than a consolidated final source.
One $200,000 General Fund amendment passed. The official minutes make the revised total
reconstructable but do not assign that new line item to a printed broad schedule category,
so production ingestion would break the source hierarchy or require a guess. See
`fy2027-source-readiness.md` and the machine-readable `fy2027-adoption-bridge.csv`. FY2027
remains outside production until the signed ordinance, adopted book, or certified final
line-item schedule is acquired.
