# Greenville County Budget Explorer

An independent, non-advocacy civic-information project. It helps Greenville County, South
Carolina residents see how county government raises, restricts, allocates and spends money,
and how that has changed over time.

**Live site:** [gcdata.alexreynolds.com](https://gcdata.alexreynolds.com/)

This repository holds everything behind the site: the source registry and document hashes,
the transcribed figures, the pipeline that turns them into the site's data, the tests that
check every published number against its source, and the web app.

## Where the numbers come from

Every figure comes from Greenville County's own published documents: its adopted budget books
(FY2004–05 through FY2027; some series reach back to FY2002 where a book prints earlier years
for comparison) and its audited Annual Comprehensive Financial Reports (FY2011 to FY2025).
The property-tax estimate also uses the County Auditor's 2025 millage sheet and county GIS.

Each published value keeps its source document, printed page, fiscal year and status
(`actual`, `adopted budget`, `proposed` or `projected`). Caveats such as a reorganization that
breaks a series, or a printed dash rather than a zero, are stored as data and travel with the
figures into the charts, tables and downloads.

The county's documents are not stored in this repository. It stores their SHA-256 hashes,
which is what makes a citation checkable. To fetch the documents and prove they are the ones
that were read:

```bash
python3 -m scripts.restore_sources
```

See [`docs/source-corpus-and-restore.md`](docs/source-corpus-and-restore.md).

## Repository layout

| Path | What it holds |
|---|---|
| `audit/blind-extraction/` | The first source-first extraction, frozen. Later observations go in `data/production/observations/`. |
| `data/production/` | Curated inputs: entities, hierarchy, notes, the source registry extension, document hashes for the ACFRs. |
| `data/recovered/` | Figures recovered from image-only tables, with their provenance. |
| `research/` | The research records behind specific figures: reconciliations, anomalies, fidelity audits. |
| `scripts/production/` | The pipeline (`pipeline.py`) and the exporter that writes the site's data (`export_app.py`). |
| `tests/` | Python tests, including the reconciliation and citation gates. |
| `web/` | The Next.js static site, its unit and browser tests, and the generated data it reads. |
| `docs/` | The accounting specification, data model, curation notes and runbooks. |

Start with [`docs/sources-funds-uses-architecture-spec.md`](docs/sources-funds-uses-architecture-spec.md)
for what the site means by money in, fund position and money out, and with
[`docs/product-brief.md`](docs/product-brief.md) for the editorial rules.

## Contributing

Corrections and new source-backed data are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md)
first: it covers setup, the checks every change must pass, and the rule that every number
needs a document and a printed page. [`ROADMAP.md`](ROADMAP.md) lists the data the site does
not cover yet.

If you think a figure on the site is wrong, open an issue with the "Wrong figure" template, or
email a@alexreynolds.com.

## Licence

Code: [MIT](LICENSE). The compiled dataset (everything under `data/`, `audit/`, `research/`,
`web/data/` and the site's downloads): [CC BY 4.0](DATA-LICENSE.md). The county's own documents are not part of
this repository and are not covered by either licence.

## Maintainer

Alex Reynolds maintains the project and releases the public site.
