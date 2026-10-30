---
type: guide
date: 2026-09-06
status: active
---

# Budget Explorer data update runbook

The next named data event is the FY2026 ACFR. It becomes a budget-versus-actual year only
after the county publishes the audited report and the report is read into the production
model. FY2027 remains outside production until a consolidated final source is acquired and verified (an adopted book,
signed ordinance or certified schedule satisfying the source-readiness record).

## Before editing data

1. Confirm the source is an official county publication and record its URL, title/version,
   publication status, fiscal year, printed pages, and sha256. For an ACFR, add the entry to
   `data/production/acfr_source_files.json`; for a budget book, use the existing source
   manifest and registry conventions. Preserve an alternate official edition rather than
   overwriting a conflicting source.
2. Restore the source documents if a page must be re-read: `python3 -m scripts.restore_sources`
   (see [`source-corpus-and-restore.md`](source-corpus-and-restore.md)). The tracked CSVs are
   sufficient to build, but the PDFs are needed to prove a disputed reading.
3. Run `python3 -m scripts.restore_sources --check` to confirm every restored PDF matches its
   recorded hash, then read the affected printed pages. A changed published hash is a review trigger, not
   permission to silently replace a transcription.

## Ingest and verify

Add source-first observations and provenance to the appropriate production CSVs. Keep
budget-versus-actual on the ACFR final amended budget basis and retain an originally adopted
budget beside it where available. Keep absent, numeric zero, and a dash-derived zero distinct;
carry source-form marks and caveats into the exports. Update coverage, notes, verification
status, and pending-year records when the new source changes those claims.

Do not run `scripts.curation.gen_departments`. It is stale and documented to regress the
curated hierarchy, recreate a resolved double count, reorder rows, and rewrite line endings.
Use the narrow generator only when its own docstring says it is safe: department aliases
belong in `scripts.curation.gen_entity_aliases.py`. Never hand-edit `web/data/` or
`web/public/downloads/`; those are exporter output.

Regenerate from the repository root:

```bash
python3 -m scripts.production.pipeline
python3 -m scripts.production.export_app
```

Then run the web gate from `web/`, using Node 22 (`.nvmrc`):

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run check:links
npm run test:e2e
```

Review the generated diff, source citations, caveats, comparison basis, and page baselines.
If a baseline changes intentionally, inspect and record that specific change before updating
the fixture; never regenerate fixtures to silence an unexplained difference. Run
`python3 -m unittest discover tests` from the root after the new web build so the baselines
check the artifact being reviewed.
For FY2026 ACFR work, independently spot-read the new year against the printed report and
confirm that the comparison starts at FY2026 only after the ACFR-specific checks pass. Keep
the source manifest, curated inputs, generated exports, and review evidence in the same
reviewable change.

## Publish

Open a pull request with the reviewed change and read the actual CI logs. CI regenerates the committed
inputs and requires `git diff --exit-code web/data web/public/downloads` to remain empty; it
also checks that a second regeneration is deterministic. An expected new-data diff before
commit is a review artifact, not a freshness failure.

The maintainer releases the public site after a change is merged. A source change or failed
freshness gate stops the release; fix and re-run the pipeline instead of deploying around it.


## Calendar-year property-tax data

Property-tax millage is a separate dataset under `data/property-tax/`; it is not a budget
appropriation or an audited receipt. The normal exporter now validates and exports it
before computing the published-data version. See the
[property-tax source record](../research/property-tax-2025/README.md) for the retained
PDF, extraction checks, component classification and unsupported cases.

For a new tax year, obtain the official Auditor sheet and verify every district row,
county-column components, school operations/debt split and tax-year relief rules. Update
source metadata/hash, schema/input validation, calculation oracles and UI year together.
Do not silently apply a new year to current GIS values or treat an estimate as a bill.
The source transcription, generated JSON and CSV are checked for deterministic freshness.
Address lookups go directly from the browser to county GIS; only the PIN and tax year go to
the site's own record function. Neither is persisted, and there are no analytics. Live GIS checks are a separate, small canary from deterministic
mocked regression tests; unavailable county services must preserve manual entry.
