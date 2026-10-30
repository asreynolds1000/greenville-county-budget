---
type: research
date: 2026-09-07
status: active
---

# Property-tax allocation: 2025 source and implementation record

This record covers the property-tax view: a top-level explanation of the county collecting
taxes for other entities, with address or tax-map/PIN lookup.

## Source boundary

The [Auditor's millage index](https://www.greenvillecounty.org/Auditor/MillageSheets.aspx)
linked 2025 as its newest sheet when checked September 7, 2026. The feature therefore
explicitly estimates **tax year 2025**, not a 2026 bill or a county fiscal-year budget.

- Official document: [2025 Millage Sheet](https://www.greenvillecounty.org/Auditor/Forms/millage_2025.pdf), four pages.
- Its SHA-256 is recorded as `sourceSha256` in `data/property-tax/source-2025.json`.
- SHA256: `250df3a0b23615953609e3fbed70080147fd13e6186b0ef9af5c62ee0fa3bc74`.
- The source's 120 district rows were extracted with `pdftotext -bbox-layout`. Column
  positions preserve the difference between fire, other district, city, sanitation and
  arena entries. Decimal arithmetic independently reconciled all 120 row sums to their
  printed totals. All four pages were rendered and visually reviewed, including the
  page-four component key. Leading zeroes in district codes are preserved.
- Curated source transcription: `data/property-tax/millage-2025.csv`.
- Source metadata and component key: `data/property-tax/source-2025.json`.
- `scripts/property_tax.py` validates row uniqueness/count, component sums, recipient/rate
  pairs and pages before generating `web/data/property-tax/2025.json` and the millage CSV.
  The existing exporter calls it before calculating the global published-data hash.

The source's **COUNTY 60.1** column includes general county operations **47.3**, general
county debt **0.4**, Library **6.7**, Greenville Tech **4.4**, art museum operations **1.2**,
and art museum debt **0.1**. Only the first two belong in the displayed general county
operations/debt subtotal **47.7**. This is a levy classification, not proof of actual cash
receipts or unrestricted money that can be moved between these entities.

Greenville school millage **189.7** consists of operations **141.2** and debt **48.5**.
Anderson school districts 025/026 have total 263.6; Spartanburg school districts
432/435/437/438 have total 285.2. Their operating/debt splits were not source-verified;
4% estimates are withheld for those six districts. Do not infer the split from the totals.
A district labelled Fountain Inn, Greenville, Greer, Mauldin or Simpsonville in the FIRE
column is not thereby inside that city's municipal taxing jurisdiction.

## Calculation and independent oracle

Official rules: [Real Property FAQ](https://www.greenvillecounty.org/RealProperty/FAQ.aspx)
and [Homestead information](https://www.greenvillecounty.org/Auditor/HomesteadExemption.aspx).
Use the 2025 taxable market value, not a sale/listing price or full appraisal that ignores
applicable valuation treatment. Multiply the selected 4% or 6% ratio and payable millage.
For an approved legal residence, omit Greenville school operating mills once; school debt
remains. If the resident explicitly confirms an approved Homestead exemption, reduce the
market-value basis by up to $50,000. The estimate excludes other credits/exemptions, fees,
penalties and special arrangements. Mixed-ratio and agricultural properties are outside
scope. Amounts are rounded to cents per line and totals are sums of displayed lines.

A gpt-5.6-terra agent exercised the [official estimator](https://www.greenvillecounty.org/appsas400/RealPropertyTaxEstimator/Default.aspx)
with a hypothetical $100,000 property in district 065:

| Case | Gross levy | School Tax Credit | Homestead Less School Operations | Estimated tax |
|---|---:|---:|---:|---:|
| 4%, no Homestead | $1,000.40 | $564.80 | $0 | $435.60 |
| 6%, no Homestead | $1,500.60 | $0 | $0 | $1,500.60 |
| 4%, Homestead | $1,000.40 | $564.80 | $217.80 | $217.80 |

The School Tax Credit is exactly the school operating relief; subtracting it and also
removing school operating mills would double-count relief. The site's recipient amounts
are already net of that relief. These independent results are unit-test oracles.

## Lookup and actual bills

The [Auditor](https://www.greenvillecounty.org/Auditor/) assembles tax bills and governing
authority millage. The [Treasurer](https://www.greenvillecounty.org/Treasurer/) describes
its collection and disbursement responsibilities. A collection channel does not identify
which entity benefits from a levy.

A browser capture on September 7 showed the route through official bill search
to year-specific property details. Inspection and fresh requests established that
`/appsas400/RealProperty/Details.aspx?MapNumber=…&TaxYear=…` works without a prior session,
Receipt, or Item for the sampled properties. The earlier conclusion based only on the
ASP.NET search form was too restrictive. The importer additionally checks the tax-search
results for one unique PIN/year/receipt/item before using its exact details link; it rejects
multiple same-year records rather than assuming the default item. The HAR stays outside the
repository; no personal records or credentials are committed as fixtures.

The page fills its inputs from that year-specific record and displays its `Taxes:` total.
The county detail response does not include recipient allocation rows or a verified amount
paid. The recipient chart remains a separately labelled estimate from published millage.
Historical tax notice PDFs require separate receipt/year matching and allocation parsing;
the application does not claim to import those line items or actual distributions.

The HAR also establishes a notice route: `RealTaxesResults.aspx` can search by `MapNumber`
and `Criteria`, with exact year/receipt/item links. Its “View Tax Notice” URL uses
`/TaxNotices/DisplayTaxNotice.asp?sFileName=…`; that generator redirects to a static PDF
under `/TaxNotices/<year>/`. Populated notices contain `ALLOCATION OF TAX MONEY`, with
tax recipients, fees, credits, and gross/net totals. Some notices have a blank allocation
panel, so absence must not become zero. A future actual-notice importer must validate the
receipt/year/parcel identity and reconcile recipient cents to Total Tax, then separately
reconcile fees and credits to the net total. This route is verified research, not a shipped
recipient-line importer.

The address/parcel module talks directly from the browser to `www.gcgis.org`:

- `arcgis3/rest/services/Address_Locators/GreenvilleNJ_AddressPoint_Locator/GeocodeServer/suggest`
- the same locator's `findAddressCandidates`, only with a resident-selected `magicKey`;
- `arcgis3/rest/services/GreenvilleNJ/Tax_Parcel_Search_and_Select/MapServer/0/query`.

Exact PINs remain strings. Residents explicitly select an address suggestion; when it
resolves to one parcel, the app retrieves the matching tax-year record. A single exact
PIN result follows the same path. Multiple parcels require a “Use this property” choice
showing the district and value; never silently choose the first match. A missing county
value stays blank with an explanation, and new lookups clear the previous property's
inputs and estimate.
Do not run fuzzy free-text geocoding. Only `PIN,LOCATE,STRNUM,TAXMKTVAL,DIST` are requested;
owner/mailing fields are excluded. GIS CITY is an owner's mailing city and is not a property jurisdiction signal.
The county locator/parcel coordinate system is 6570; mismatches must fail closed.

GIS is current, while the rates are 2025. After selecting a parcel, the browser posts only
its PIN and tax year to `/api/property-record`. This narrow server function is necessary
because the county's HTML record does not allow cross-origin browser reads. It fetches a
fixed county search and detail URLs without cookies and accepts only one receipt/item for
the selected PIN/year, an exact returned map number/year, and one unambiguous value for each
expected field in `#MyData`.

The returned allowlist is PIN, tax year, receipt/item for the exact source link, district,
taxable market value, supported assessment class/ratio, explicit Homestead status, and the
listed tax total. `LR` / `LR - Legal Residence`
fills 4%; `OT` / `OT - Non-Legal Residence` fills 6%. Other or mixed classes remain unknown.
Only explicit `Yes` or `No` fills Homestead. Blank values remain blank, including clearing a
current GIS value when the 2025 record omits it. Unavailable records leave an identified GIS
fallback. Editing an input or starting another lookup cancels pending fills.

The function has bounded input/upstream responses, fixed request timeouts, no database,
logging, credentials, or cache. Owner, mailing, and payment-date fields are neither
returned nor retained. Addresses/PINs are not sent to analytics or put in the site's URL;
the selected PIN goes in the API's POST body. County and hosting infrastructure may keep
their own request logs. Manual entry remains available.

## Verification

The estimate is checked by unit tests against an independent calculation for district 065 (the oracle above), by server tests of the record reader, and by browser tests that use civic or fictional properties only. The screenshots in `evidence/` show fictional property details or a civic parcel. No resident's property record is stored in this repository.
