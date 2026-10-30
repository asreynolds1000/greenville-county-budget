# Notes for coding agents

Start with `README.md`, then `CONTRIBUTING.md`: setup, the checks every change must pass, and what each failure means.

- Accounting meaning: `docs/sources-funds-uses-architecture-spec.md` governs. Editorial rules: `docs/product-brief.md`.
- Every number needs a source document and a printed page. Absent is not zero.
- Never hand-edit `web/data/`, `web/public/downloads/` or `dist/`. Change curated inputs under `data/`, then run `python3 -m scripts.production.pipeline` and `python3 -m scripts.production.export_app`.
- `audit/blind-extraction/` is frozen. Never run `scripts.curation.gen_departments`.
- Python uses the standard library only. The web app needs Node 22 (`web/.nvmrc`).
- Never re-capture page baselines or re-hash fund-panel markup to make a test pass. `CONTRIBUTING.md` explains the legitimate procedure.
- Changing `SITE_URL` in `web/src/lib/site.ts` moves every fund-panel hash, because each panel embeds the host once.
- Reader-facing text states how a quantity is measured and reaches no conclusion about it.
- `web/AGENTS.md` holds Next.js version notes for the web app.
