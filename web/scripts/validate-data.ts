#!/usr/bin/env tsx
/**
 * Build-time data contract gate (plan Decision 3 / Step 3).
 *
 * Parses EVERY file in web/data/ against the zod schemas in src/lib/schema.ts
 * and exits non-zero on any drift. Run automatically as npm's "prebuild"
 * lifecycle hook (see package.json) — a shape mismatch between the Python
 * exporter's output and what this app expects fails `next build` before a
 * single page renders, rather than surfacing as a runtime error on a
 * deployed page.
 *
 * This script does NOT regenerate or modify web/data — it only reads and
 * validates the already-committed files. Regeneration is the Python
 * exporter's job (scripts/production/export_app.py).
 */
import fs from "node:fs";
import path from "node:path";

import type { ZodType } from "zod";
import { propertyTaxDataSchema } from "../src/lib/propertyTax";

import {
  correctionsFileSchema,
  pendingYearsFileSchema,
  budgetStatusFileSchema,
  dataNotesFileSchema,
  entitiesFileSchema,
  entityPageSchema,
  generalFundBudgetActualComparisonSchema,
  searchIndexFileSchema,
  sourcesFileSchema,
  verificationFileSchema,
  v2CoverageFileSchema,
  v2EntitiesFileSchema,
  v2EntityPageSchema,
  v2ManifestSchema,
  v2RelationshipsFileSchema,
  v2StatementsFileSchema,
  yearsFileSchema,
} from "../src/lib/schema";

const DATA_DIR = path.join(process.cwd(), "data");

type Failure = { file: string; message: string };

const failures: Failure[] = [];
let filesChecked = 0;

function validateFile(relPath: string, schema: ZodType): void {
  const filePath = path.join(DATA_DIR, relPath);
  filesChecked += 1;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    failures.push({ file: relPath, message: `could not read file: ${String(err)}` });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    failures.push({ file: relPath, message: `invalid JSON: ${String(err)}` });
    return;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    failures.push({
      file: relPath,
      message: result.error.issues
        .map((issue) => `  at ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n"),
    });
  }
}

function main(): void {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`✗ Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  validateFile("entities.json", entitiesFileSchema);
  validateFile("sources.json", sourcesFileSchema);
  validateFile("years.json", yearsFileSchema);
  validateFile(path.join("property-tax", "2025.json"), propertyTaxDataSchema);

  const pagesDir = path.join(DATA_DIR, "pages");
  const pageFiles = fs.existsSync(pagesDir)
    ? fs.readdirSync(pagesDir).filter((f) => f.endsWith(".json"))
    : [];

  if (pageFiles.length === 0) {
    failures.push({ file: "pages/", message: "no page files found — expected ~134" });
  }

  for (const fileName of pageFiles) {
    validateFile(path.join("pages", fileName), entityPageSchema);
  }

  validateFile(path.join("v2", "manifest.json"), v2ManifestSchema);
  validateFile(path.join("v2", "entities.json"), v2EntitiesFileSchema);
  validateFile(path.join("v2", "relationships.json"), v2RelationshipsFileSchema);
  validateFile(path.join("v2", "statements.json"), v2StatementsFileSchema);
  validateFile(path.join("v2", "coverage.json"), v2CoverageFileSchema);

  // These four were outside the gate until 2026-07-22, and the omission is instructive:
  // the script reported "323 files checked" while the caveat layer that annotates every
  // figure on the site was not among them. A new scope_type in notes.json passed this
  // check and then crashed `next build` during prerender, which is the same defect
  // arriving later and less legibly. A gate is only as good as the set it covers.
  validateFile(path.join("v2", "notes.json"), dataNotesFileSchema);
  validateFile(path.join("v2", "corrections.json"), correctionsFileSchema);
  validateFile(path.join("v2", "pending-years.json"), pendingYearsFileSchema);
  validateFile(path.join("v2", "budget-status.json"), budgetStatusFileSchema);
  validateFile(path.join("v2", "search-index.json"), searchIndexFileSchema);
  validateFile(path.join("v2", "verification.json"), verificationFileSchema);
  validateFile(
    path.join("v2", "comparisons", "general-fund-fy2025-budget-actual.json"),
    generalFundBudgetActualComparisonSchema,
  );

  const v2PagesDir = path.join(DATA_DIR, "v2", "pages");
  const v2PageFiles = fs.existsSync(v2PagesDir)
    ? fs.readdirSync(v2PagesDir).filter((f) => f.endsWith(".json"))
    : [];

  if (v2PageFiles.length === 0) {
    failures.push({ file: "v2/pages/", message: "no v2 entity page files found" });
  }

  for (const fileName of v2PageFiles) {
    validateFile(path.join("v2", "pages", fileName), v2EntityPageSchema);
  }

  // A production deploy with no domain configured would ship 2,679 canonical tags and a
  // sitemap pointing at an unregistrable host. The `.invalid` fallback is designed to fail
  // VISIBLY rather than point somewhere wrong, but "visible to whoever inspects the HTML"
  // is not the same as "cannot ship". This makes it the latter.
  const isProductionDeploy = process.env.VERCEL_ENV === "production";
  if (isProductionDeploy && !process.env.NEXT_PUBLIC_SITE_URL) {
    console.error(
      "\n✗ Refusing to build for production with no NEXT_PUBLIC_SITE_URL.\n"
      + "  Canonical URLs and the sitemap would resolve against the reserved .invalid\n"
      + "  placeholder. Set it in the Vercel project environment (owner decision Q1).\n",
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(`\n✗ Data validation failed: ${failures.length} file(s) did not match schema\n`);
    for (const failure of failures) {
      console.error(`  ${failure.file}`);
      console.error(`${failure.message}\n`);
    }
    process.exit(1);
  }

  console.log(`✓ Data validation passed — ${filesChecked} files checked against schema.ts`);
}

main();
