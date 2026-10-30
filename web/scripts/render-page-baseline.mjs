/**
 * Render the reviewed pages in a real browser so the page-baseline gate can still fail.
 *
 * Why this exists. Commit a5f4045 consolidated `e/<id>/<fy>/` into one route with a client
 * year selector, so the per-year URL is now an 883-byte meta-refresh stub. Seven of the
 * twelve reviewed fixtures are non-latest years, and the consolidated page server-renders
 * only the latest year's panel — reading static HTML cannot recover them at all. The old
 * gate did not break because a fixture was wrong; it broke because the artifact it read
 * stopped being the page.
 *
 * What it refuses to do. It does not reconstruct amounts or markup from JSON, it does not
 * invent a <main>, and it does not synthesise a title. It serializes the document's own
 * title and the panel's own <main> elements, which is exactly the envelope the extractor in
 * scripts/curation/capture_page_baseline.py already reads. Anything else would be a fixture
 * agreeing with itself.
 *
 * What it refuses to accept. FundYearPanel.tsx renders <main> in its loading state AND in
 * its error state, and both already contain the shared history chart. So "a <main> exists",
 * "the year attribute is right", and even "there are dollar figures on the page" are all
 * true of a page whose accounting content never arrived. Every readiness condition below
 * exists because one of those weaker checks would have passed without it.
 *
 *   node scripts/render-page-baseline.mjs                 # the whole manifest
 *   node scripts/render-page-baseline.mjs e/fund.general/2025
 *
 * The static server is spawned on an OS-assigned port and must present a per-run identity
 * token before any page is captured, so a stale server from an earlier build can never be
 * the one the browser reads (round-3 review, P1). Its fault modes are exercised by
 * tests/export/render-page-baseline.test.mjs.
 *
 * Output goes to web/.baselines/ — deliberately OUTSIDE web/out/, so the packaging step
 * (prepare-vercel-output.mjs copies the whole export) cannot ship it no matter what any
 * prune list says. The directory is wiped on every run: a capture that survives a skipped
 * renderer is the failure mode this script is replacing.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Node 24 changed Intl compact-currency formatting. A baseline captured under it has wrong
// dollar strings and looks completely successful. Assert it HERE, in the process that does
// the capturing — a neighbouring shell's node is not this process's node.
if (!process.version.startsWith("v22.")) {
  console.error(`render-page-baseline: refusing to run on ${process.version}. This project pins Node 22 (web/.nvmrc); Node 24 changes Intl compact-currency output, so a baseline captured under it would carry wrong dollar strings and still look green.`);
  process.exit(2);
}

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const OUT = path.join(WEB, "out");
// BASELINE_STAGE_DIR exists for the renderer's own tests, which must be able to run without
// wiping the staging directory the Python comparison reads.
const STAGE = process.env.BASELINE_STAGE_DIR ? path.resolve(process.env.BASELINE_STAGE_DIR) : path.join(WEB, ".baselines");
const MANIFEST = path.join(STAGE, "manifest.json");
const ROUTES_FILE = path.join(ROOT, "scripts", "curation", "page_baseline_routes.json");
// Port 0 asks the OS for a free port, so a stale server from an earlier build cannot already
// be listening on it. BASELINE_PORT pins one for the negative test; a conflict then refuses.
const PORT = process.env.BASELINE_PORT === undefined ? 0 : Number(process.env.BASELINE_PORT);
const NAV_TIMEOUT = Number(process.env.BASELINE_TIMEOUT_MS ?? 45_000);

/** Fault injection, for the negative tests. Never set in a real capture run. */
const FAULT = process.env.BASELINE_FAULT ?? "";

function fail(message) {
  console.error(`render-page-baseline: ${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * A digest over every byte the server can serve. Binding captures to this is what makes a
 * stale capture detectable: any rebuild, and any edit to the export afterwards, changes it,
 * so a capture from a previous build can never be mistaken for a current one.
 */
function exportDigest(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(dir);
  files.sort();
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(dir, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(sha256(fs.readFileSync(file)));
    hash.update("\n");
  }
  return { digest: hash.digest("hex"), fileCount: files.length };
}

function parseRoute(route) {
  const match = /^e\/(.+)\/(\d{4})$/.exec(route);
  if (!match) fail(`route ${route} is not of the form e/<entityId>/<fiscalYear>`);
  return { entityId: match[1], year: Number(match[2]) };
}

function loadRoutes(argv) {
  const declared = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf8")).routes;
  const byRoute = new Map(declared.map((entry) => [entry.route, entry]));
  const wanted = argv.length ? argv : declared.map((entry) => entry.route);
  return wanted.map((route) => {
    const entry = byRoute.get(route);
    if (!entry) fail(`route ${route} is not in ${path.relative(ROOT, ROUTES_FILE)}. Add it there first; an undeclared route would be captured but never compared.`);
    if (entry.render !== "browser") fail(`route ${route} is declared render=${entry.render}; this renderer only handles browser routes.`);
    const parsed = parseRoute(route);
    // Read from the export, not declared: whether this entity defers its historical panels to
    // a panels.json, and which year the static HTML already renders.
    const staticHtml = path.join(OUT, "e", parsed.entityId, "index.html");
    const ssrYear = fs.existsSync(staticHtml) ? Number(/data-entity-year="(\d{4})"/.exec(fs.readFileSync(staticHtml, "utf8"))?.[1] ?? NaN) : NaN;
    const deferred = fs.existsSync(path.join(OUT, "e", parsed.entityId, "panels.json"));
    return { ...entry, ...parsed, ssrYear, deferred };
  });
}

/**
 * Prove the server answering `origin` is this run's child, not a stale process on the port.
 *
 * Round-3 review, P1: the previous startup treated ANY HTTP response on the port as
 * readiness. A server left over from an earlier build answered the poll, the freshly spawned
 * child died on EADDRINUSE after the promise had already resolved, and the browser captured
 * the old pages while the manifest recorded the new export's digest. Python recomputed that
 * digest, it matched, and a broken build passed. The identity header closes that: only the
 * child spawned with this run's token can present it.
 */
export function verifyIdentity(origin, token) {
  return new Promise((resolve, reject) => {
    http.get(`${origin}/index.html`, (response) => {
      response.resume();
      const presented = response.headers["x-serve-out-instance"];
      if (response.statusCode !== 200) {
        reject(new Error(`the server at ${origin} answered /index.html with HTTP ${response.statusCode}; it is not serving this export`));
      } else if (presented !== token) {
        reject(new Error(`the server at ${origin} did not present this run's identity token (got ${presented ?? "none"}); another process is answering on that port, so its pages cannot be attributed to this build`));
      } else {
        resolve();
      }
    }).on("error", (error) => reject(new Error(`the server at ${origin} could not be reached: ${error.message}`)));
  });
}

/**
 * Spawn serve-out.mjs and resolve only when THAT child reports listening and presents this
 * run's identity token. A bind failure, or any exit before the listening line, rejects with
 * the child's own stderr so the refusal names EADDRINUSE and the port.
 */
export function startServer({ port = PORT, token = crypto.randomBytes(16).toString("hex") } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(WEB, "scripts", "serve-out.mjs")], {
      cwd: WEB, env: { ...process.env, PORT: String(port), SERVE_OUT_INSTANCE: token }, stdio: ["ignore", "pipe", "pipe"],
    });
    const server = { child, token, port: null, origin: null, exitCode: null };
    let stdout = "";
    let stderr = "";
    let listening = false;
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.on("exit", (code) => {
      server.exitCode = code;
      if (!listening) {
        reject(new Error(`serve-out.mjs exited with code ${code} on port ${port} before it reported listening; no server from this run is answering. Its stderr: ${stderr.trim() || "(empty)"}`));
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = /Serving .* on http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout);
      if (!match || listening) return;
      listening = true;
      server.port = Number(match[1]);
      server.origin = `http://127.0.0.1:${server.port}`;
      verifyIdentity(server.origin, token).then(() => resolve(server), (error) => { child.kill(); reject(error); });
    });
    setTimeout(() => {
      if (!listening) { child.kill(); reject(new Error("serve-out.mjs never reported listening within 20s")); }
    }, 20_000).unref();
  });
}

/**
 * Readiness, evaluated in the page. Returns a list of reasons rather than a boolean, so a
 * refusal names what was missing instead of timing out anonymously.
 */
function readinessProbe(year) {
  const reasons = [];
  const holder = document.querySelector("[data-entity-year]");
  const selected = holder?.getAttribute("data-entity-year") ?? null;
  if (selected === null) reasons.push("no [data-entity-year] element: the year explorer never mounted");
  else if (selected !== String(year)) reasons.push(`the page has FY${selected} selected, not the requested FY${year}`);

  const select = document.querySelector('select[aria-label="Explore fiscal year"]');
  if (!select) reasons.push("the fiscal-year select is absent");
  else if (select.value !== String(year)) reasons.push(`the select reads FY${select.value}, not FY${year}`);

  const mains = Array.from(document.querySelectorAll("main"));
  if (mains.length === 0) reasons.push("no <main> element");

  const mainText = mains.map((node) => node.innerText ?? "").join("\n");
  // FundYearPanel.tsx:30-49 renders <main> in both of these states, and both contain the
  // shared history chart, so neither is distinguishable by structure or by money alone.
  if (/Loading FY\d+ figures and sources/.test(mainText)) reasons.push("the panel is still in its loading state");
  if (/figures could not be loaded/.test(mainText)) reasons.push("the panel is in its error state");
  if (mains.some((node) => node.querySelector('[role="status"], [role="alert"]'))) reasons.push("a live-region status or alert is still present inside <main>");

  const headings = mains.flatMap((node) => Array.from(node.querySelectorAll("h1")))
    .map((node) => (node.textContent ?? "").trim()).filter(Boolean);
  if (headings.length === 0) reasons.push("the completed panel's <h1> is absent");

  // Representative annual evidence. An accounting panel that rendered has many amounts; the
  // loading and error panels have only whatever the shared chart contributes.
  const money = mainText.match(/\$[\d,]+(?:\.\d+)?[MBK]?/g) ?? [];
  if (money.length < 3) reasons.push(`only ${money.length} dollar figures inside <main>; the accounting content did not render`);
  if (!mainText.includes(`FY${year}`)) reasons.push(`the requested FY${year} does not appear anywhere in <main>`);

  return { reasons, headings, selected, mainCount: mains.length, moneyCount: money.length };
}

function serialize() {
  const escape = (value) => value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
  const mains = Array.from(document.querySelectorAll("main")).map((node) => node.outerHTML).join("\n");
  return `<!doctype html><html lang="${document.documentElement.lang || "en"}"><head><title>${escape(document.title)}</title></head><body>${mains}</body></html>`;
}

async function main() {
  const argv = process.argv.slice(2);
  if (!fs.existsSync(OUT)) fail(`no export at ${OUT}. Run \`npm run build\` first.`);
  const routes = loadRoutes(argv);
  const partial = argv.length > 0 && argv.length < JSON.parse(fs.readFileSync(ROUTES_FILE, "utf8")).routes.length;

  const { chromium } = await import("@playwright/test");
  const { digest, fileCount } = exportDigest(OUT);

  // A clean staging directory, every run. Keeping yesterday's captures around is precisely
  // how a skipped renderer goes unnoticed.
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  let server;
  try {
    server = await startServer();
  } catch (error) {
    fail(`could not start the static server for this export: ${error.message}`);
  }
  const ORIGIN = server.origin;
  const results = {};
  let failures = 0;
  let browser = null;
  try {
    browser = await chromium.launch();
    for (const route of routes) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const problems = [];
      const panelResponses = [];
      page.on("console", (message) => { if (message.type() === "error") problems.push(`console error: ${message.text()}`); });
      page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
      page.on("requestfailed", (request) => {
        const reason = request.failure()?.errorText ?? "unknown";
        // Next prefetches the sibling nav routes and the browser aborts those the moment the
        // page settles. Refusing a capture for that would refuse every capture, which is a
        // gate that cannot pass rather than one that can fail. An abort of something the
        // panel actually needs is still a problem: the fund payload by URL, and scripts,
        // stylesheets and documents by resource type.
        const load_bearing = request.url().includes("/panels.json")
          || ["script", "stylesheet", "document"].includes(request.resourceType());
        if (!reason.includes("ERR_ABORTED") || load_bearing) {
          problems.push(`request failed [${request.resourceType()}]: ${request.url()} (${reason})`);
        }
      });
      page.on("response", (response) => {
        if (response.url().includes("/panels.json")) panelResponses.push({ url: response.url(), status: response.status() });
        if (response.status() >= 400 && new URL(response.url()).origin === ORIGIN) problems.push(`HTTP ${response.status()} for ${response.url()}`);
      });
      // Fault injection for the negative tests: make the deferred panel request fail, and
      // prove the renderer refuses to write rather than capturing the error panel.
      if (FAULT === "panels-500") await page.route("**/panels.json*", (r) => r.fulfill({ status: 500, body: "injected" }));
      if (FAULT === "panels-hang") await page.route("**/panels.json*", () => {});

      // navigate-wrong-year asks for a different year than the manifest entry claims, to
      // prove the readiness probe refuses a right-looking page showing the wrong year.
      const navigateYear = FAULT === "navigate-wrong-year" ? (route.year === 2026 ? 2025 : 2026) : route.year;
      const url = `${ORIGIN}/e/${encodeURIComponent(route.entityId)}/?fy=${navigateYear}`;
      let probe = null;
      try {
        await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT });
        await page.waitForFunction(
          ([year, source]) => new Function("year", `return (${source})(year)`)(year).reasons.length === 0,
          [route.year, readinessProbe.toString()], { timeout: NAV_TIMEOUT, polling: 150 },
        );
        probe = await page.evaluate(([year, source]) => new Function("year", `return (${source})(year)`)(year), [route.year, readinessProbe.toString()]);
      } catch {
        probe = await page.evaluate(([year, source]) => new Function("year", `return (${source})(year)`)(year), [route.year, readinessProbe.toString()]).catch(() => null);
      }

      const reasons = probe ? [...probe.reasons] : ["the readiness probe could not run at all"];
      // A route whose entity ships a deferred panels.json and whose year is not the one the
      // server rendered can only be complete if that file was fetched with 200. Requiring it
      // only "when a response was observed" made a request that was never issued vacuous.
      const deferredHistorical = route.deferred && route.year !== route.ssrYear;
      if (deferredHistorical && !panelResponses.some((r) => r.status === 200)) {
        reasons.push(`the fund panel request never succeeded (${panelResponses.length ? panelResponses.map((r) => r.status).join(", ") : "never issued"})`);
      }
      if (server.exitCode !== null) reasons.push(`serve-out.mjs exited with code ${server.exitCode} during the run; this capture cannot be attributed to this build`);
      reasons.push(...problems);

      if (reasons.length) {
        failures += 1;
        console.error(`REFUSED ${route.route}`);
        for (const reason of reasons) console.error(`    - ${reason}`);
      } else {
        const html = await page.evaluate(serialize);
        const file = path.join(STAGE, ...route.route.split("/"), "index.html");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html, "utf8");
        results[route.route] = {
          file: path.relative(STAGE, file).split(path.sep).join("/"),
          sha256: sha256(Buffer.from(html, "utf8")),
          requested_year: route.year,
          selected_year: Number(probe.selected),
          headings: probe.headings.slice(0, 2),
          money_count: probe.moneyCount,
          main_count: probe.mainCount,
          panel_requests: panelResponses,
        };
        console.log(`captured ${route.route}  (${probe.moneyCount} figures, h1 "${probe.headings[0]}")`);
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.child.kill();
  }

  if (failures) fail(`${failures} of ${routes.length} routes were refused. No manifest was written, so the comparison will fail closed rather than read a stale capture.`);

  fs.writeFileSync(MANIFEST, JSON.stringify({
    generated_by: "web/scripts/render-page-baseline.mjs",
    node_version: process.version,
    build_id: fs.existsSync(path.join(WEB, ".next", "BUILD_ID")) ? fs.readFileSync(path.join(WEB, ".next", "BUILD_ID"), "utf8").trim() : null,
    export_digest: digest,
    export_file_count: fileCount,
    partial_run: partial,
    server: { port: server.port, instance: server.token },
    routes: results,
  }, null, 2) + "\n", "utf8");
  console.log(`\nmanifest -> ${path.relative(ROOT, MANIFEST)}  (export digest ${digest.slice(0, 12)}…, ${fileCount} files${partial ? ", PARTIAL RUN" : ""})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
