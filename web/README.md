# Greenville County Budget Explorer — web

Next.js (App Router) static export of the Greenville County Budget Explorer.
See `../docs/sources-funds-uses-architecture-spec.md` for the architecture and
`../CONTRIBUTING.md` for setup and the checks every change must pass.

## What this is

A static site (`output: 'export'`): every page is prerendered at build time from the
data committed in `data/` (see **Data contract** below). One small server function,
`server/propertyRecord.mjs`, fetches a single 2025 county property record for the
property-tax estimate; `npm run prepare:deploy` packages it beside the static pages.
There is no database and no runtime configuration.

## Local development

```bash
nvm use          # picks up .nvmrc (Node 22)
npm install
npm run dev       # http://localhost:3000
```

```bash
npm run build     # runs the prebuild data validation, then `next build` -> out/
npm run test      # vitest
npm run lint       # eslint (includes the chart-import restriction, see below)
npm run typecheck # tsc --noEmit
```

## Data contract

The app never talks to the Python pipeline or `dist/gc_budget.sqlite`
directly. It reads exactly two things, both committed to git:

- `data/` — `entities.json`, `sources.json`, `years.json`, and one
  `pages/<entity_id>.json` per entity. Produced by
  `scripts/production/export_app.py` (repo root) from `dist/gc_budget.sqlite`.
- `public/downloads/` — the per-entity and per-year CSVs behind the
  "downloadable data" gate.

**Never hand-edit anything under `data/` or `public/downloads/`.** Regenerate
both from the repo root with:

```bash
python3 -m scripts.production.pipeline && python3 -m scripts.production.export_app
```

and commit the diff in the same commit as whatever curation/CSV change caused
it. CI's freshness gate (`.github/workflows/ci.yml`) fails the build
if a fresh regen doesn't byte-match what's committed — a curation change and
its data effect can never silently drift apart.

Every file in `data/` is validated against `src/lib/schema.ts` (zod) as an
`npm run build` **prebuild** step (`scripts/validate-data.ts`). A shape
mismatch between the exporter's output and what the app expects fails the
build before a single page renders.

## Chart import restriction

Chart SVG primitives (Step 4+, under `src/components/charts/`) are only
importable from `src/components/Figure.tsx` — enforced by an ESLint
`no-restricted-imports` rule in `eslint.config.mjs`. This is what makes "a
chart without a caption, an accessible data table, a CSV download, and a
source affordance" unrepresentable in the codebase, not
just a code-review convention.

## Deployment (Vercel)

- **Root Directory:** `web` (this directory — the repo root is the Python
  pipeline, which Vercel's build never touches).
- **Framework preset:** Next.js.
- **Build command / output:** defaults (`next build`, static export to `out/`
  via `output: 'export'` in `next.config.ts`).
- **Node version:** pinned via `.nvmrc` (22) and `package.json` `engines`.
- **Releases:** the maintainer builds and releases the public site; preview
  builds are `noindex`.

## Directory layout

```
web/
├── .nvmrc  package.json  next.config.ts   # output: 'export', images unoptimized
├── data/                    # COMMITTED exporter output — see Data contract above
│   ├── entities.json  sources.json  years.json
│   └── pages/<entity_id>.json
├── public/downloads/        # COMMITTED per-entity/per-year CSVs
├── scripts/
│   └── validate-data.ts     # prebuild: zod-parse every file in data/
└── src/
    ├── app/                 # routes: /, /e/[entityId], /e/[entityId]/[fy]
    ├── components/          # Amount, EntityYearView, charts/ (import-restricted)
    └── lib/                 # schema.ts (zod), loaders.ts, format.ts
```
