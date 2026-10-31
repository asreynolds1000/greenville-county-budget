# FY2027 adopted-source readiness

Update 2026-10-30: the final adopted FY2027 book has been acquired and reconciled.
See the final-source resolution below; the September record is preserved as history.

Checked 2026-09-06 against Greenville County's current Management & Budget index, Notices
page, Council agenda directory through September 1, and approved minutes.

## Conclusion

FY2027 was legally adopted at third reading on June 16, 2026. No consolidated final source
was located in the official publications checked on 2026-09-06. The official third-reading
agenda still links an unsigned ordinance whose filename and contents identify it as the
version **after second reading**. The final appropriation therefore has to be reconstructed
from that PDF plus the meeting minutes.

That reconstruction is sufficiently well supported for research, but not for the current
publication contract. The production hierarchy requires every displayed total and member
to be source-cited and reconciled. The one amendment that passed adds a General Fund line
item without saying which broad General Fund schedule category contains it. Loading the
reconstructed total would either leave a $200,000 hierarchy difference or require guessing
its category.

Do not promote either local FY2027 PDF to `adopted` and do not extend the public site's
latest fiscal year until a consolidated final primary source resolves that difference.

## Official record

1. The [June 16 third-reading agenda](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202026/County%20Council/2026.06.16/agenda.htm)
   places the FY2027 ordinance under third reading and links the ordinance and proposed
   amendments.
2. The linked [ordinance after second reading](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202026/County%20Council/2026.06.16/FY2027%20Budget%20Ordinance%20-%20after%202nd%20Reading.pdf)
   has a blank ordinance number, blank adoption date, and blank signatures. Its Section 1
   General Fund appropriation is $288,294,094.
3. The approved [June 16 meeting minutes](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202026/County%20Council/2026.07.21/June%2016%20CC%20minutes.pdf)
   record the amendment votes and final adoption. Only Kelly Long's first amendment
   carried: $200,000 was added for an `Oversight Ad Hoc Committee` General Fund line item.
   The ordinance as amended then passed 8-4.

The other proposed changes did not alter the adopted figures:

- Joey Russo's $2,289,914 public-safety compensation amendment failed 3-9.
- Kelly Long's $7,000 General Services reduction failed 3-9.
- Steve Shaw's $4,000,000 reallocation failed 2-10.
- Steve Shaw's public-relations position removal failed 2-10.
- Steve Shaw withdrew the proposed first-responder millage language.

The defensible reconstructed General Fund appropriation is therefore **$288,494,094**:
$288,294,094 after second reading plus the adopted $200,000 amendment. The schedule-level
bridge is recorded in `fy2027-adoption-bridge.csv`. Values labelled
`reconstructed_adopted` are derived from two official records, not amounts printed in one
final source.

## Local corpus

| Source ID | Local file | Classification | Use |
|---|---|---|---|
| `gc-fy2027-proposed` | `data/raw/gc-fy2027-proposed/Proposed.pdf` | Proposed biennial budget, created 2025-05-06 | Research only; never adopted evidence |
| `gc-fy2027-after-second` | `data/raw/gc-fy2027-after-second/FY2027-Budget-Ordinance---after-2nd-Reading.pdf` | Unsigned ordinance after second reading, created 2026-06-09 | Base document for the adoption bridge, not final by itself |

The adoption minutes and amendment memoranda are official web sources but are not copied
into the production corpus because they do not form a consolidated adopted budget. If the
county never publishes a final artifact, the fallback is to acquire a signed ordinance or
certified line-item schedule directly from the Clerk to Council or Management and Budget.

## What unblocks ingestion

Acquire one of the following, in preference order:

1. the signed and numbered FY2027 ordinance with all adopted amendments incorporated;
2. the final FY2027 adopted operating and capital budget book; or
3. a certified post-adoption line-item schedule that assigns the $200,000 Oversight line
   to a broad General Fund schedule category.

Then:

1. add the artifact to `data/source-manifest.csv` with `status=adopted` and fetch/hash it;
2. compare every schedule total against `fy2027-adoption-bridge.csv`;
3. extract FY2027 through the General, Special Revenue, Debt Service, and Enterprise routes;
4. add FY2027 statement instances and scope coverage only at the detail actually printed;
5. run source validation, reconciliation, export freshness, and the full test suite; and
6. only then allow `getLatestFiscalYear()` to move the site from FY2026 to FY2027.

This is a source-availability blocker, not an extraction-design blocker. The non-General-
Fund extractors and production statement model are ready for the final document.

## Project policy

Confirmed 2026-09-06: keep FY2026 as the latest production year and wait for a consolidated
final FY2027 primary source. No consolidated final source located in the official
publications checked. The split-document reconstruction remains research evidence;
it is not promoted as an adopted production hierarchy. Requesting a signed ordinance or
certified schedule from the county is the next acquisition action, but no external request
has been sent from this project.

## Final-source resolution — 2026-10-30

The official [FY2027 index](https://www.greenvillecounty.org/ManagementandBudget/Budget27.aspx),
linked from the live Management and Budget index, now publishes the
[combined final book](https://www.greenvillecounty.org/ManagementandBudget/pdf/2027/BudgetCombined.pdf).
The 209-page single-year book was created October 23, 2026. Its SHA-256 is
`d315174a853c4a8fbadae93b6f6901a34e54a0be517efe6b64bf3152bf556b4a`.
The byte-identical archived capture is `20261030191122`.

The cover identifies Fiscal Year 2027; the budget message begins on printed page 6.
The Appendix prints Ordinance No. 5790 on printed page 193 and adoption on June 16, 2026
on printed page 198. The FY2027 overview on printed page 35 retains a “PROPOSED BUDGET”
column heading; the numbered and dated final ordinance establishes the edition's status.
The book contains prior-year comparison columns, not a second newly adopted FY2026 budget.

Every one of the 12 ordinance schedule totals matches the adoption bridge. The bridge's
new final-book columns record the printed amounts and pages without replacing the earlier
reconstruction. Appropriations are printed on pages 193–194; estimated sources on pages 194–196.

The $200,000 amendment is placed at **Other Services** in broad Schedule A: the final book
prints $17,006,528 on page 193, compared with $16,806,528 after second reading. Every other
broad General Fund category is unchanged. The General Fund total rises by the same $200,000
to $288,494,094. Pages 35, 57 and 125 repeat the final Other Services amount. The committee
name is not printed as a separate line, so no committee entity or finer placement is inferred.

Before ingestion, 415 matching five-column FY2026 budget cells, all 40 FY2026 adopted overview
rows, and all 18 Enterprise FY2026 budget observations matched the FY2026 source. FY2026
unaudited actual comparison columns in the new book are not ingested. The earlier sources,
values, citations and notes remain in place.

The six ingestion steps above are now resolved: the adopted source and archive records are
registered; all bridge totals reconcile; 195 FY2027 observations follow the existing General,
Special Revenue, Debt Service and Enterprise table routes; 18 statement instances and 18
scope-coverage rows describe the printed detail; production validation and export checks run;
and FY2027 becomes the latest published year. No audited FY2027 actual is claimed.

The FY2027 Tax Sale Revenue cell on page 56 is blank. It remains absent rather than becoming
zero; the nine printed Other Revenue components sum to $6,895,056. The source's lease-accounting
reconciliation dash on page 57 is retained as unmodeled evidence. The General Fund lease-related
transfer on page 131 is $8,342,254 while the Debt Service capital-lease amount on pages 35 and
194 is $8,342,253. Both printed amounts are preserved; no transfers-removed county total is derived.
