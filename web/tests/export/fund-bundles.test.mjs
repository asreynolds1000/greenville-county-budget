import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Run after npm run build: node --test tests/export/fund-bundles.test.mjs
// Keep built-artifact checks separate so ordinary Vitest tests do not require out/.
describe("exported fund renderer isolation", () => {
  const root = path.resolve(process.cwd(), "out");
  const scripts = entityId => {
    const html = fs.readFileSync(path.join(root, "e", entityId, "index.html"), "utf8");
    const references = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+\.js)"/g)];
    assert.ok(references.length > 0, `${entityId} must include hydration script references`);
    return references
      .map(match => fs.readFileSync(path.join(root, match[1]), "utf8"));
  };
  // Turbopack's module export table identifies the renderer independently of copy
  // and local symbol minification. Require a positive witness, so a changed bundle
  // format fails this test instead of making all exclusion checks vacuously pass.
  const exportsGeneralRenderer = text => /\[\s*["']GeneralFundYearPanel["']\s*,\s*0\s*,/.test(text);
  it("finds the General Fund renderer's actual module export in its initial scripts", () => {
    assert.ok(scripts("fund.general").some(exportsGeneralRenderer));
  });
  const exportsGroupRenderer = text => /\[\s*["']FundGroupYearPanel["']\s*,\s*0\s*,/.test(text);
  for (const entityId of ["fund.debt-service", "fund.special-revenue", "fund.enterprise", "fund.internal-service"]) {
    // The emitted model set follows the build-time budget, not a fixed ID policy.
    const deferred = fs.existsSync(path.join(root, "e", entityId, "panels.json"));
    it(`${entityId} loads the browser group renderer exactly when its model is deferred`, () => {
      assert.equal(scripts(entityId).some(exportsGroupRenderer), deferred);
    });
  }
  for (const entityId of ["dept.sheriff", "balance.debt.beginning", "fund.debt-service"]) {
    it(`${entityId} does not eagerly download the General Fund renderer`, () => {
      assert.equal(scripts(entityId).some(exportsGeneralRenderer), false);
    });
  }
});
