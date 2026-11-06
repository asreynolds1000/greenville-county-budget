# The source documents: how to restore them, and how changes are detected

The site's figures are transcribed from 71 Greenville County documents: 56 budget-book files
and 15 audited Annual Comprehensive Financial Reports (ACFRs), about 483 MiB in all. This
repository does not store the documents. It stores their SHA-256 hashes, which is what makes a
citation checkable: anyone can fetch a document and prove it is the exact file that was read.

## What depends on them

The build does **not** need the PDFs. `python3 -m scripts.production.pipeline` reads the
tracked CSVs in `audit/blind-extraction/`, `data/production/` and `data/recovered/`, so a fresh
clone builds and passes its tests with no documents at all. Four test classes that re-read
the PDFs skip when the documents or Poppler are absent.

The documents are needed to re-read a source: to check a disputed figure, extract a new fund or
year, or answer "the document says something different on that page."

| | Budget books | ACFRs |
|---|---|---|
| What they source | the adopted budget series, FY2002–FY2027 | every budget-versus-actual figure, FY2011–FY2025 |
| Hash manifest | `audit/source-files.json` | `data/production/acfr_source_files.json` |
| Restored to | `data/raw/<path>` | `data/raw/acfr/<filename>` |

`data/raw/` is gitignored.

## Restoring

```bash
python3 -m scripts.restore_sources            # fetch whatever is missing, then verify every file
python3 -m scripts.restore_sources --check    # no network: fail if any file is absent or differs
```

For each document the tool tries the county's official URL, then the byte-identical Internet
Archive capture listed in `data/production/source_archive_captures.csv`. It keeps a download
only if its SHA-256 equals the hash in the manifest, and it never edits a manifest.

As checked on 2026-10-30, 70 of the 71 documents have a byte-identical Internet Archive copy.
The exception is the FY2027 budget ordinance after second reading, which is still available
from the county's site. The Internet Archive copies matter because a county site
reorganization can move or remove a document; a restore still succeeds as long as either
source holds the exact bytes.

`scripts/fetch_sources.py` is a different tool. It acquires new documents and records their
hashes; use it only when adding a source, never to restore one.

## Detecting a document that changed under us

**A 404 announces itself. A corrected document re-posted at the same URL does not.** The link
keeps returning 200, the page keeps rendering, and every citation quietly starts pointing at a
page that no longer shows the figure that was read from it.

`python3 -m scripts.verify_sources` checks for that. It re-fetches every document from the
county's URL and compares it with the recorded hash.

```bash
python3 -m scripts.verify_sources            # network: re-fetch and compare all 71
python3 -m scripts.verify_sources --local    # disk only, no network
python3 -m scripts.verify_sources --json     # machine-readable, for a scheduled run
```

A changed hash exits non-zero but is **not** an error. A county revising its own document is
legitimate and usually news this project should act on: re-read the affected figures, then
update the manifest in the same pull request as the re-read.

The same check runs weekly in `.github/workflows/source-verification.yml`.

## Archive links on the site

Each cited document also has an archived-copy link on the site, recorded in
`data/production/source_archive_urls.csv`. Keep both the official URL and the archive URL when
adding a source.
