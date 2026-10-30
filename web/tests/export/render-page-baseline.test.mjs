import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { before, describe, it } from "node:test";

/**
 * The page-baseline renderer must REFUSE, by name, every way its capture can be quietly wrong.
 *
 * Run after `npm run build`, under Node 22, with Playwright Chromium installed:
 *     node --test tests/export/render-page-baseline.test.mjs
 *
 * Every renderer run here stages into a temporary directory (BASELINE_STAGE_DIR), so this
 * suite never wipes the real `web/.baselines/` that the Python comparison reads.
 *
 * The first case is the round-3 review's P1: a stale server from an earlier build already
 * listening on the port answers the readiness poll, the new server dies on EADDRINUSE, and
 * the browser captures the OLD pages while the manifest records the NEW export's digest.
 * The Python side recomputes that digest, it matches, and a broken build passes. So the
 * stale listener here is the real serve-out.mjs serving the real export: exactly the input
 * that produced a green capture before the fix.
 */
const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const RENDERER = path.join(WEB, "scripts", "render-page-baseline.mjs");
const SERVER = path.join(WEB, "scripts", "serve-out.mjs");
const ROUTE = "e/fund.general/2025"; // deferred fund, non-latest year: needs panels.json

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

/** Start the real static server on a fixed port and wait until it reports listening. */
function startStaleServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { cwd: WEB, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; if (/Serving .* on http:/.test(out)) resolve(child); });
    child.on("exit", (code) => reject(new Error(`stale server exited ${code}`)));
  });
}

function runRenderer(args, env, stage) {
  const result = spawnSync(process.execPath, [RENDERER, ...args], {
    cwd: WEB, encoding: "utf8", timeout: 180_000,
    env: { ...process.env, BASELINE_STAGE_DIR: stage, ...env },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tempStage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "baseline-stage-"));
}

describe("page-baseline renderer refusals", { timeout: 600_000 }, () => {
  before(() => {
    assert.ok(fs.existsSync(path.join(WEB, "out", "index.html")), "run `npm run build` first: these tests render the real export");
    assert.ok(process.version.startsWith("v22."), `these tests must run under Node 22, not ${process.version}`);
  });

  it("refuses an occupied port by name instead of capturing from the stale server on it", async () => {
    const port = await freePort();
    const stale = await startStaleServer(port);
    const stage = tempStage();
    try {
      const run = runRenderer([ROUTE], { BASELINE_PORT: String(port) }, stage);
      assert.notEqual(run.status, 0, `renderer exited 0 with a stale server on the port:\n${run.stdout}\n${run.stderr}`);
      assert.match(run.stderr, /EADDRINUSE|already in use/, `the refusal did not name the port conflict:\n${run.stderr}`);
      assert.match(run.stderr, new RegExp(String(port)), "the refusal did not name the port");
      assert.equal(fs.existsSync(path.join(stage, "manifest.json")), false, "a manifest was written despite the refusal");
      assert.equal(fs.existsSync(path.join(stage, ...ROUTE.split("/"), "index.html")), false, "a capture was written despite the refusal");
    } finally {
      stale.kill();
    }
  });

  it("captures the route when the port is free, and records which server it captured from", async () => {
    const stage = tempStage();
    const run = runRenderer([ROUTE], {}, stage);
    assert.equal(run.status, 0, `renderer failed:\n${run.stdout}\n${run.stderr}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(stage, "manifest.json"), "utf8"));
    assert.ok(manifest.routes[ROUTE], "the route was not captured");
    assert.equal(manifest.routes[ROUTE].requested_year, 2025);
    assert.equal(manifest.routes[ROUTE].selected_year, 2025);
    assert.equal(typeof manifest.server?.instance, "string", "the manifest does not record the server instance it captured from");
    assert.ok(manifest.server.instance.length >= 16);
    assert.equal(typeof manifest.server?.port, "number");
    assert.ok(manifest.routes[ROUTE].panel_requests.some((r) => r.status === 200), "the deferred panel was never fetched with 200");
  });
});

describe("page-baseline renderer fault modes", { timeout: 600_000 }, () => {
  before(() => {
    assert.ok(fs.existsSync(path.join(WEB, "out", "index.html")), "run `npm run build` first");
  });

  for (const [fault, fragment, env] of [
    ["navigate-wrong-year", "the page has FY2026 selected, not the requested FY2025", {}],
    ["panels-500", "the fund panel request never succeeded (500)", {}],
    ["panels-hang", "the panel is still in its loading state", { BASELINE_TIMEOUT_MS: "8000" }],
  ]) {
    it(`BASELINE_FAULT=${fault} is refused with "${fragment}"`, () => {
      const stage = tempStage();
      const run = runRenderer([ROUTE], { BASELINE_FAULT: fault, ...env }, stage);
      assert.notEqual(run.status, 0, `renderer exited 0 under fault ${fault}:\n${run.stdout}`);
      assert.match(run.stderr, new RegExp(`REFUSED ${ROUTE.replace(/[./]/g, "\\$&")}`), run.stderr);
      assert.ok(run.stderr.includes(fragment), `refusal did not name the reason:\n${run.stderr}`);
      assert.equal(fs.existsSync(path.join(stage, "manifest.json")), false, "a manifest was written despite the refusal");
    });
  }
});
