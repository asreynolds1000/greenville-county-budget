---
title: Fund coverage source anomalies
date: 2026-08-01
status: verified
---

# Fund coverage source anomalies

These are defects or presentation omissions in the official source pages, not corrections to the county's figures. The observation layer preserves every printed value. Validation registers the exact printed delta so a future extraction change cannot make the exception silently disappear or grow.

## FY2012 Special Revenue three-part one-dollar chain

The FY2014-15 budget book, PDF and printed page 48, prints FY2012 sources of $27,642,584 and expenditures of $20,905,101. Their difference is $6,737,483, while the printed operating result is $6,737,484: equation delta -$1.

The printed operating result plus other financing of -$11,813,141 is -$5,075,657, while printed net change is -$5,075,658: equation delta +$1. Beginning balance $16,611,795 plus printed net change is $11,536,137, while ending balance is $11,536,138: equation delta -$1.

## FY2013 Special Revenue operating result

On the same page, FY2013 sources of $28,141,091 less expenditures of $15,630,845 equal $12,510,246. The printed operating result is $12,510,245: equation delta +$1. The later financing and position equations reconcile as printed.

## FY2012 Debt Service source components

The FY2014-15 budget book, PDF and printed page 51, prints FY2012 Debt Service source components totaling $11,107,749 and a source total of $11,107,750: equation delta -$1. The operating-result equation uses the printed total and reconciles exactly.

## Unlabelled Debt Service expenditure totals

The FY2012-13 book on PDF page 54 (printed page 46) and the FY2014-15 book on PDF and printed page 51 print a ruled four-value total immediately after the final Debt Service expenditure line without repeating “Total Expenditures.” The extractor assigns that semantic label from its table position and validates it against both the detail sum and the printed operating result.

## Inventory correction: older clean tables exist

The July 22 scoping pass classified FY2012-13 and FY2014-15 as wide-table-only sources. Fidelity review found dedicated, text-backed Special Revenue and Debt Service summary pages in both books. Those pages are preferable to slicing columns from the countywide table because they expose the full fund statement and keep labels adjacent to their values. The older backfill therefore uses the clean pages while retaining the same four-column overlap and latest-publication rule.

## Enterprise inventory reaches FY2002

The July 22 scoping pass treated Enterprise as part of the FY2012-13-and-later table inventory. The older FY2004-05, FY2006-07, FY2008-09, and FY2010-11 proprietary-fund documents each contain an Enterprise operating-budget table. Together with the combined books, they cover every site year from FY2002 through FY2026. Enterprise therefore has a different source boundary from Special Revenue and Debt Service.

## FY2004 Enterprise total omits two printed components

The FY2006-07 proprietary-funds document, physical page 5 and printed page 195, prints FY2004 ACTUAL Property Taxes of $3,370,709 and Charges for Services of $2,643,084, but its $5,554,193 `TOTAL FUNDS` equals only Other revenue of $686,488 plus Stormwater Fees of $4,867,705. The component sum exceeds the printed total by exactly $6,013,793—the sum of the two omitted lines. Both components and the source total are preserved, and the validator registers that exact delta.

## Enterprise one-dollar subtotal defects

The FY2016-17 book, physical and printed page 149, has two independent one-dollar defects in actual columns:

- FY2014 Solid Waste funding components sum to $9,980,899, while `Total Solid Waste` is $9,980,900. Consequently all Enterprise funding components are one dollar below `TOTAL FUNDS`.
- FY2015 Stormwater expense detail sums to $8,097,474, while `Total Stormwater` is $8,097,473.

The source values remain unchanged and both exact deltas are registered in extraction validation.

## Enterprise balanced-budget total defects

Three source budget columns print revenue-and-funding totals that differ from their printed expense totals even though a budget column normally balances:

- FY2014 in the FY2016-17 book: funding $22,003,432, expenses $22,003,332, difference +$100.
- FY2017 in the FY2016-17 book: funding $22,034,570, expenses $22,034,568, difference +$2.
- FY2026 in the FY2026 book: funding $33,222,897, expenses $33,222,597, difference +$300. The $33,222,597 expense total is also the Enterprise amount printed in the countywide budget total.

These differences are recorded in `enterprise-flow-differences.csv`; the extractor does not rewrite either side.

## FY2025 Solid Waste cross-page conflict

The FY2026 Enterprise overview on physical page 157 (printed page 156) prints FY2025 ACTUAL Solid Waste expenses of $22,166,676. The division detail on the following physical page prints `Total Expenses` of $40,748,361, driven by Operating Expenses of $32,790,533. The Enterprise observation route uses the overview statement consistently and retains this cross-page disagreement as a research note rather than mixing two statement scopes.
