/**
 * Minimal static server for the exported site (`out/`), used by the Playwright harness.
 *
 * Written rather than pulled in as a dependency for two reasons. The repository keeps its
 * dependency surface deliberately small (the Python side is stdlib-only), and a static host
 * serving this build has exactly one interesting behaviour — how it resolves a
 * `trailingSlash: true` URL onto `index.html`. Owning those ~20 lines means the test
 * harness cannot drift from the real routing because some server package changed its
 * default.
 *
 * Deliberately NOT a SPA fallback: an unknown path must 404, because "every route is
 * reachable" is one of the things the suite asserts. A catch-all would make that assertion
 * vacuous — the failure mode this repository keeps producing (napkin: a check written
 * narrower than the thing it is meant to catch).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import propertyRecordHandler from "../server/propertyRecordHandler.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = Number(process.env.PORT ?? 4321);
// A per-run identity, set by the page-baseline renderer. When present it is echoed on every
// response, so the renderer can prove the server answering its port is the one it spawned
// and not a stale process from an earlier build that happened to be listening there.
const INSTANCE = process.env.SERVE_OUT_INSTANCE ?? null;

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".png", "image/png"],
  [".woff2", "font/woff2"],
  [".csv", "text/csv; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

/** Resolve a URL path to a file inside `out/`, or null. Never escapes the root. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const target = path.join(ROOT, decoded);
  const normalised = path.normalize(target);
  if (!normalised.startsWith(ROOT)) return null;

  const candidates = decoded.endsWith("/")
    ? [path.join(normalised, "index.html")]
    : [normalised, `${normalised}.html`, path.join(normalised, "index.html")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (INSTANCE !== null) res.setHeader("x-serve-out-instance", INSTANCE);
  if ((req.url ?? "").split("?")[0] === "/api/property-record") {
    void propertyRecordHandler(req, res);
    return;
  }
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    const notFound = path.join(ROOT, "404.html");
    const body = fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found";
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
    return;
  }
  res.writeHead(200, { "content-type": TYPES.get(path.extname(file)) ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

if (!fs.existsSync(ROOT)) {
  console.error(`No export found at ${ROOT}. Run \`npm run build\` first.`);
  process.exit(1);
}

// A bind failure must be a loud, non-zero exit, not an unhandled throw that races whoever is
// polling the port. The renderer treats an exit before the "Serving" line as a refusal.
server.on("error", (error) => {
  console.error(`serve-out.mjs: could not listen on 127.0.0.1:${PORT} (${error.code ?? "error"}): ${error.message}`);
  process.exit(1);
});

// PORT=0 asks the OS for a free port; the line below reports the port actually bound, which
// is the only one a caller may trust.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} on http://127.0.0.1:${server.address().port}`);
});
