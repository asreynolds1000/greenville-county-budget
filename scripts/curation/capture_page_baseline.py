"""Snapshot what a built page actually renders, so a refactor can be proved harmless.

Run BEFORE refactoring, never after. A fixture captured from the refactored output proves
only that the code agrees with itself.

TWO STEPS, in this order, and the second one fails closed without the first:

    cd web && node scripts/render-page-baseline.mjs          # render the routes in a browser
    python3 -m scripts.curation.capture_page_baseline e/fund.general/2025

Since commit a5f4045 the per-year URL `e/<id>/<fy>/` is an 883-byte meta-refresh stub and the
real page is one consolidated route whose year is chosen after hydration. Reading that stub
produces an empty extraction, which is what turned the whole gate red. So the routes listed in
`scripts/curation/page_baseline_routes.json` are read from the browser renderer's staging
directory (`web/.baselines/`), never from `web/out/`.

There is deliberately NO fallback from a browser route to the static export. A fallback has no
freshness proof: it lets a skipped or failed renderer be silently satisfied by yesterday's
capture, or by the redirect stub, and the gate then certifies whatever the refactor produced.
Every way that can go wrong gets its own named refusal below.

The snapshot is deliberately not the raw HTML. Markup churns for reasons that do not change
what a reader sees (class names, whitespace, attribute order), and a fixture that fails on
those gets deleted the first time it cries wolf. What it captures instead is the things a
reader would notice changing: every dollar figure, every percentage, every heading, and the
visible text of every table cell, each in document order.

The FY2025 General Fund page is the one page in this project that has passed owner review, so
it is the page whose output must survive the generalisation to fifteen years unchanged.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = _ROOT / "tests" / "fixtures" / "page-baselines"
EXPORT_DIR = _ROOT / "web" / "out"
STAGE_DIR = _ROOT / "web" / ".baselines"
MANIFEST_PATH = STAGE_DIR / "manifest.json"
ROUTES_PATH = _ROOT / "scripts" / "curation" / "page_baseline_routes.json"

RENDER_COMMAND = "cd web && node scripts/render-page-baseline.mjs"


class BaselineSourceError(RuntimeError):
    """The page a baseline should be compared against could not be trusted.

    Raised instead of returning something plausible. Every message names which of the
    possible causes fired, because "missing", "stale", "partial" and "wrong year" need
    different fixes and a generic failure sends the reader to the wrong one.
    """


def declared_routes() -> dict:
    """The one route manifest both the renderer and this module read."""
    return {entry["route"]: entry for entry in json.loads(ROUTES_PATH.read_text(encoding="utf-8"))["routes"]}


def export_digest(directory: Path | None = None) -> str:
    """Digest every byte the static server can serve.

    Must stay byte-compatible with exportDigest() in web/scripts/render-page-baseline.mjs:
    files sorted by their relative POSIX path, each contributing `path\0<sha256 hex>\n`.
    Binding a capture to this is the freshness proof. A rebuild changes it, and so does any
    edit to the export afterwards, so a capture taken against a different export cannot be
    mistaken for a current one.
    """
    # Resolved at call time, not bound as a default: a default argument would capture the
    # module-level path once at import and quietly ignore any test that repoints it, which
    # would make the gate's own negative tests pass against the real export.
    directory = EXPORT_DIR if directory is None else directory
    hasher = hashlib.sha256()
    files = sorted(
        (path for path in directory.rglob("*") if path.is_file()),
        key=lambda path: path.relative_to(directory).as_posix(),
    )
    for path in files:
        hasher.update(path.relative_to(directory).as_posix().encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(hashlib.sha256(path.read_bytes()).hexdigest().encode("ascii"))
        hasher.update(b"\n")
    return hasher.hexdigest()


def _staged_html(route: str) -> str:
    """Return the rendered DOM for a browser route, or refuse and say exactly why."""
    if not EXPORT_DIR.exists():
        raise BaselineSourceError(f"no export at {EXPORT_DIR}. Run `npm run build` in web/ first.")
    if not MANIFEST_PATH.exists():
        raise BaselineSourceError(
            f"no render manifest at {MANIFEST_PATH}. The reviewed pages only exist as rendered "
            f"DOM since the route consolidation. Run `{RENDER_COMMAND}` after the build."
        )
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    current = export_digest()
    if manifest.get("export_digest") != current:
        raise BaselineSourceError(
            f"the captures in {STAGE_DIR} are STALE: they were rendered against export "
            f"{str(manifest.get('export_digest'))[:12]}… and web/out is now {current[:12]}…. "
            f"Re-run `{RENDER_COMMAND}`. (A stale capture is the failure this check exists for: "
            "it would otherwise pass against a page that no longer exists.)"
        )

    node_version = str(manifest.get("node_version", ""))
    if not node_version.startswith("v22."):
        raise BaselineSourceError(
            f"the captures were rendered on Node {node_version}, not Node 22. Node 24 changes "
            "Intl compact-currency output, so those dollar strings are wrong even though they "
            "look fine. Re-run the renderer under Node 22."
        )

    entry = manifest.get("routes", {}).get(route)
    if entry is None:
        captured = ", ".join(sorted(manifest.get("routes", {}))) or "none"
        raise BaselineSourceError(
            f"{route} was not rendered. The manifest covers: {captured}. "
            + ("This was a PARTIAL run. " if manifest.get("partial_run") else "")
            + f"Run `{RENDER_COMMAND}` with no arguments to render the complete route manifest."
        )

    # Both years, present and equal to the year the ROUTE names. `None != None` is False, so an
    # entry that recorded neither year used to pass this check as though the years had matched;
    # and comparing the two recorded years only to each other let a FY2026 capture filed under
    # the FY2025 route through as long as both fields agreed (round-3 review, P2).
    route_year = _route_year(route)
    if entry.get("selected_year") is None or entry.get("requested_year") is None:
        raise BaselineSourceError(
            f"{route}'s manifest entry does not record both the requested and the selected year, "
            "so the capture cannot be shown to be of the requested page. Re-render it."
        )
    if entry.get("selected_year") != entry.get("requested_year"):
        raise BaselineSourceError(
            f"{route} was captured showing FY{entry.get('selected_year')} while FY{entry.get('requested_year')} "
            "was requested. The capture is of the wrong page and must not be compared."
        )
    if entry.get("requested_year") != route_year:
        raise BaselineSourceError(
            f"{route}'s manifest entry records FY{entry.get('requested_year')}, but the route names "
            f"FY{route_year}. The capture is filed under the wrong route and must not be compared."
        )

    if not entry.get("file"):
        raise BaselineSourceError(f"{route}'s manifest entry names no capture file. Re-render it.")
    path = STAGE_DIR / entry["file"]
    if not path.exists():
        raise BaselineSourceError(f"{route} is in the manifest but its capture {path} is missing.")
    html = path.read_text(encoding="utf-8")
    actual = hashlib.sha256(html.encode("utf-8")).hexdigest()
    if actual != entry.get("sha256"):
        raise BaselineSourceError(
            f"{route}'s capture has changed since it was rendered "
            f"(manifest {str(entry.get('sha256'))[:12]}…, file {actual[:12]}…). Re-render it."
        )
    # The manifest's own claims are not completion evidence. Re-check the capture itself for
    # the states FundYearPanel.tsx renders before the accounting content arrives: a correctly
    # hashed loading or error panel with matching years used to be accepted here.
    reasons = completion_reasons(html, route_year)
    if reasons:
        raise BaselineSourceError(
            f"{route}'s capture is not of a completed page: " + "; ".join(reasons) + ". Re-render it."
        )
    return html


def _route_year(route: str) -> int:
    match = re.fullmatch(r"e/.+/(\d{4})", route.strip("/"))
    if not match:
        raise BaselineSourceError(f"{route} is not of the form e/<entityId>/<fiscalYear>, so no year can be checked against it")
    return int(match.group(1))


_LOADING = re.compile(r"Loading FY\d+ figures and sources")
_ERROR = re.compile(r"figures could not be loaded")


def completion_reasons(html: str, year: int) -> list[str]:
    """Why this capture is NOT a completed page, mirroring the renderer's readiness probe.

    Every condition is one that a loading or error panel satisfies without the accounting
    content having rendered, so an empty list is the only acceptable answer.
    """
    parser = Extractor()
    parser.feed(html)
    text = " ".join(parser.text)
    reasons = []
    if parser.main_count == 0:
        reasons.append("no <main> element")
    if _LOADING.search(text):
        reasons.append("the panel is still in its loading state")
    if _ERROR.search(text):
        reasons.append("the panel is in its error state")
    if parser.live_regions:
        reasons.append("a live-region status or alert is still present inside <main>")
    if not parser.h1s:
        reasons.append("the completed panel's <h1> is absent")
    money = _MONEY.findall(text)
    if len(money) < 3:
        reasons.append(f"only {len(money)} dollar figures inside <main>; the accounting content did not render")
    if f"FY{year}" not in text:
        reasons.append(f"the requested FY{year} does not appear anywhere in <main>")
    return reasons

_SKIP_TAGS = {"script", "style", "template"}
_MONEY = re.compile(r"\$[\d,]+(?:\.\d+)?[MBK]?|\b\d[\d,]*(?:\.\d+)?[MBK]\b|\b\d{1,3}(?:,\d{3})+\b")
_PERCENT = re.compile(r"\b\d+(?:\.\d+)?%")


class Extractor(HTMLParser):
    """Captures the page's own content only: everything inside <main>.

    The site chrome -- header, footer -- is one component rendered identically on all 4,166
    pages, and it carries the data-version stamp. Including it would mean every data change
    failed every baseline with an identical diff about the version string, which is exactly
    how a fixture earns a reputation for crying wolf and gets deleted. The chrome is guarded
    once, on its own, not nine times by accident.
    """

    def __init__(self) -> None:
        super().__init__()
        self.skip_depth = 0
        self.main_depth = 0
        self.main_count = 0
        self.h1s: list[str] = []
        self.live_regions = 0
        self.title = ""
        self._in_head = False
        self._in_title = False
        self.text: list[str] = []
        self.headings: list[str] = []
        self._heading_depth = 0
        self._heading_buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "head":
            self._in_head = True
        if tag == "title" and self._in_head:
            self._in_title = True
        if tag == "main":
            self.main_depth += 1
            self.main_count += 1
        if self.main_depth and dict(attrs).get("role") in {"status", "alert"}:
            self.live_regions += 1
        if tag in _SKIP_TAGS:
            self.skip_depth += 1
        if tag in {"h1", "h2", "h3", "h4"}:
            self._heading_depth += 1
            self._heading_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "head":
            self._in_head = False
        if tag == "main" and self.main_depth:
            self.main_depth -= 1
        if tag in _SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
        if tag in {"h1", "h2", "h3", "h4"} and self._heading_depth:
            self._heading_depth -= 1
            heading = " ".join("".join(self._heading_buf).split())
            if heading and self.main_depth:
                self.headings.append(heading)
                if tag == "h1":
                    self.h1s.append(heading)

    def handle_data(self, data):
        # The <title> lives outside <main> but is the one piece of chrome that is per-page,
        # so it is captured as its own field rather than left unguarded.
        if self._in_title:
            self.title += data
        if self.skip_depth or not self.main_depth:
            return
        cleaned = " ".join(data.split())
        if not cleaned:
            return
        self.text.append(cleaned)
        if self._heading_depth:
            self._heading_buf.append(data)


def capture(route: str) -> dict:
    declared = declared_routes()
    entry = declared.get(route)
    if entry is None:
        raise BaselineSourceError(
            f"{route} is not declared in {ROUTES_PATH.relative_to(_ROOT)}. A route with a "
            "fixture but no manifest entry would never be rendered, and would compare against "
            "whatever happened to be on disk."
        )

    if entry["render"] == "browser":
        html = _staged_html(route)
    else:
        path = EXPORT_DIR / route / "index.html"
        if not path.exists():
            raise BaselineSourceError(f"not built: {path}\nRun `npm run build` in web/ first.")
        html = path.read_text(encoding="utf-8")

    parser = Extractor()
    parser.feed(html)
    joined = " ".join(parser.text)

    return {
        "route": route,
        "title": " ".join(parser.title.split()),
        "headings": parser.headings,
        "money": _MONEY.findall(joined),
        "percentages": _PERCENT.findall(joined),
        "text": parser.text,
    }


def main(argv: list[str]) -> int:
    if not argv:
        raise SystemExit(
            "usage: capture_page_baseline <route> [<route> ...]\n"
            f"Render first: {RENDER_COMMAND}"
        )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for route in argv:
        try:
            snapshot = capture(route)
        except BaselineSourceError as error:
            raise SystemExit(f"refusing to write a fixture for {route}: {error}") from error
        name = route.strip("/").replace("/", "__") + ".json"
        target = OUT_DIR / name
        target.write_text(
            json.dumps(snapshot, indent=1, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(
            f"{route}: {len(snapshot['money'])} figures, "
            f"{len(snapshot['headings'])} headings, "
            f"{len(snapshot['text'])} text nodes -> {target.relative_to(_ROOT)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
