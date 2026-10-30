# Contributing

Thank you for helping. This project publishes numbers that residents rely on, so every change
has to show where its numbers came from and pass the checks below. That is most of what this
file explains.

## What is welcome

- **Corrections.** A figure that does not match the county's document. Say which document and
  which printed page.
- **New source-backed data.** The gaps are listed in [`ROADMAP.md`](ROADMAP.md): transit
  amounts, staffing and compensation, all-fund audited actuals, FY2027 once a final adopted
  source is published, roads across governments, and debt detail.
- **Accessibility and clarity fixes** to the site, as long as they keep the meaning of every
  figure and caveat.

Before writing any reader-facing text, read the editorial rules in
[`docs/product-brief.md`](docs/product-brief.md). In short: state how a quantity is measured
and stop. This site does not argue for or against any spending level, tax or public decision,
and pull requests that do will not be merged.

## Ground rules

- **Every number needs a document and a printed page.** No figure from memory, news coverage,
  or a secondary spreadsheet.
- **Absent is not zero.** An unpublished value stays null. A printed dash is recorded as a
  dash, with its arithmetic value kept separately.
- **Never hand-edit generated files**: `web/data/`, `web/public/downloads/`, `dist/`. Change
  the curated inputs, run the pipeline and exporter, and commit inputs and outputs together.
- **`audit/blind-extraction/` is frozen.** Later observations go in
  `data/production/observations/`; new sources go in
  `data/production/source_registry_extension.csv`.
- **Never run `scripts.curation.gen_departments`.** It predates later hand curation and would
  undo it.
- **Python uses the standard library only.** No pytest, no pandas.

## Setup

You need Python 3.14 (`.python-version`) and Node 22 (`web/.nvmrc`). Node 22 matters: newer
Node versions format compact currency differently and the page checks will fail.

```bash
git clone https://github.com/asreynolds1000/greenville-county-budget.git
cd greenville-county-budget

# Python: build the data and run the data tests (no source PDFs needed)
python3 -m scripts.production.pipeline
python3 -m scripts.production.export_app
python3 -m unittest discover tests

# Web: from web/
cd web
npm ci
npm test              # unit tests
npm run lint
npm run typecheck
npm run build         # also validates web/data before building
npx playwright install --with-deps chromium
npm run test:e2e      # browser tests
npm run check:links   # every internal link and asset in the export
npm run baselines:render
cd ..
REQUIRE_PAGE_BASELINES=1 python3 -m unittest tests.test_page_baselines
```

That is the same sequence CI runs on every pull request.

### The source documents (optional, needed for re-extraction)

Four Python test classes re-read the county's PDFs. Without the PDFs and Poppler they skip,
which is expected. To run them:

```bash
brew install poppler            # or: apt-get install poppler-utils
python3 -m scripts.restore_sources
python3 -m unittest discover tests
```

`restore_sources` downloads each document from the county's URL or a byte-identical Internet
Archive copy, and keeps it only if its SHA-256 matches the committed manifest.
`python3 -m scripts.restore_sources --check` verifies what is on disk without a network.

## Making a change

1. Branch from `main`.
2. For a data change, edit the curated input under `data/production/` (or add an observation),
   then run the pipeline and exporter. Review the diff in `web/data/` and
   `web/public/downloads/`: every changed line should be one you meant to change.
3. Run the setup sequence above.
4. Open a pull request. Fill in the template: the document, the printed page, and which check
   covers the change.

### Adding or re-reading a source document

[`docs/data-update-runbook.md`](docs/data-update-runbook.md) is the procedure. In outline:

1. Record the document in the source registry with its official URL, title, status, fiscal
   year and printed page numbers.
2. Record its SHA-256 in the matching manifest (`audit/source-files.json` for budget books,
   `data/production/acfr_source_files.json` for ACFRs). `shasum -a 256 <file>` prints it.
3. If the county has posted a revised edition, keep the earlier one as an alternative; never
   overwrite evidence. Cross-book conflicts go in
   `audit/blind-extraction/official-document-conflicts.csv`.
4. Add an archive URL to `data/production/source_archive_urls.csv` once the Internet Archive
   holds a copy.

`scripts/fetch_sources.py` acquires new documents and writes hashes; use it only when adding a
source. To restore existing documents, use `restore_sources`, which never writes a manifest.

## When a check fails

| Failure | What it means | What to do |
|---|---|---|
| `validate-data` (during `npm run build`) | `web/data/` no longer matches the schemas in `web/src/lib/schema.ts` | Find whether the exporter or the schema is wrong; never loosen a schema to make data pass. |
| Freshness (`git diff --exit-code web/data web/public/downloads` in CI) | Committed site data differs from a fresh regeneration | Run the pipeline and exporter, review the diff, commit it. |
| `verify_sources` reports CHANGED | The county's published document no longer matches the recorded hash | Not an error. Re-read the affected figures from the new document, then update the manifest in the same pull request. |
| Extraction tests skipped | PDFs or Poppler are absent | Expected in CI. Restore the sources to run them. |
| Page baselines differ | A reviewed page's visible text changed | See the next section. |
| Fund-panel markup hashes differ (`web/src/lib/fundPanel.test.tsx`) | Rendered fund panels changed | See the next section. |
| `check:links` fails | A page links to a route, anchor or asset that is not in the export | Fix the link or the target. |
| Reference closure (`tests/test_reference_closure.py`) | A document or a published note points at a file that is not in the repository | Fix the pointer or add the file. |

## Page baselines and panel hashes

Two checks hold reviewed pages still: page baselines (`tests/fixtures/page-baselines/`) and
125 SHA-256 hashes of rendered fund panels
(`web/tests/fixtures/fund-panel-canonical-markup.json`). They exist so a change cannot move a
published page silently.

**Never re-capture or re-hash to turn a red check green.** A baseline records what was
reviewed, not what the code currently does.

When you change visible text on purpose:

1. Render the candidate pages: `npm run build` and `npm run baselines:render` in `web/`.
2. See exactly what moved: `python3 -m scripts.curation.diff_page_baselines <route>`.
3. If every difference is one you intended, re-capture only those routes:
   `python3 -m scripts.curation.capture_page_baseline <route>`. Say in the pull request why
   each route moved.
4. For panel hashes, prove the change is only yours: render the panels, substitute your new
   strings back to the old ones, and confirm every panel returns to its committed hash. Then
   regenerate. If a fund you did not touch moves, the change leaked into a shared component.
5. After any visible-text change, run the full browser suite (`npm run test:e2e`), not only the
   spec you think you touched.

## Notes on older comments and records

This repository was published with a fresh history. Some code comments and research records
refer to the maintainer's working notes ("the napkin"), to plan steps, or to commits from the
earlier private history. Those are not published. The comment's own explanation is what
matters; if one is unclear, open an issue.

Production builds need `NEXT_PUBLIC_SITE_URL`; contributor and CI builds are preview builds and
do not.

## Reviews and response time

One person maintains this project in their spare time. Expect a reply within about a week. A
pull request with its source document and page stated is far quicker to review than one
without.

By contributing you agree your code is licensed under MIT and your data contributions under
CC BY 4.0, as described in the [README](README.md#licence). Please follow the
[code of conduct](CODE_OF_CONDUCT.md).
