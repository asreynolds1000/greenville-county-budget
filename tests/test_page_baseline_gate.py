"""Prove the page-baseline gate can FAIL, and fail for the right reason each time.

The old gate broke silently: after the route consolidation it read an 883-byte redirect stub,
extracted nothing, and reported twelve fixtures' worth of "the dollar figures changed". The
repair replaces that with a rendered capture, and a rendered capture brings its own ways to be
quietly wrong — missing, stale, partial, tampered with, or of the wrong year. A gate whose
failure modes are untested is a gate that certifies whatever the refactor produced.

So every refusal below is exercised, and each assertion names the reason rather than just
"it raised". A test that only checks `raises` would pass if every path collapsed into one
generic error, which is exactly the outcome that sends a reader to the wrong fix.

These tests never touch a committed fixture and never need a build: the export and the staging
directory are both temporary fakes, so they run in the Python job as well as the web one.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.curation import capture_page_baseline as module
from scripts.curation.capture_page_baseline import BaselineSourceError, capture, declared_routes

ROUTE = "e/fund.general/2025"
PAGE_HTML = (
    "<!doctype html><html><head><title>General Fund — FY2025 · Greenville County Budget Explorer"
    "</title></head><body><main><h1>How the General Fund moves through one year</h1>"
    "<p>Total revenues $251,432,463 in FY2025 against spending of $246,001,002 and transfers in of $15,403,265.</p>"
    "</main></body></html>"
)
# What FundYearPanel.tsx renders while the deferred panel is still loading, and when it fails.
# Both carry the shared history chart, so both have a <main>, a year and dollar figures.
LOADING_HTML = (
    "<!doctype html><html><head><title>General Fund — FY2025 · Greenville County Budget Explorer"
    "</title></head><body><main><p role=\"status\">Loading FY2025 figures and sources…</p>"
    "<h1>History</h1><p>$251,432,463 $246,001,002 $15,403,265 FY2025</p></main></body></html>"
)
ERROR_HTML = LOADING_HTML.replace(
    '<p role="status">Loading FY2025 figures and sources…</p>',
    '<p role="alert">FY2025 figures could not be loaded. Retry, or reload the page to get its current data.</p>',
)
# What the consolidated per-year URL actually serves now. If any refusal below ever became a
# fallback, this is the page the gate would compare against: no <main>, no figures.
STUB_HTML = '<!doctype html><html><head><title>General Fund — FY2025</title></head><body><p><a href="/e/fund.general/?fy=2025">Continue</a></p></body></html>'


class GateHarness(unittest.TestCase):
    """A fake export plus a fake staging directory, wired into the module's own globals."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

        self.export = root / "out"
        (self.export / "e" / "fund.general" / "2025").mkdir(parents=True)
        (self.export / "index.html").write_text("<html></html>", encoding="utf-8")
        (self.export / "e" / "fund.general" / "2025" / "index.html").write_text(STUB_HTML, encoding="utf-8")

        self.stage = root / ".baselines"
        capture_path = self.stage / "e" / "fund.general" / "2025" / "index.html"
        capture_path.parent.mkdir(parents=True)
        capture_path.write_text(PAGE_HTML, encoding="utf-8")
        self.capture_path = capture_path
        self.manifest_path = self.stage / "manifest.json"

        patches = {
            "EXPORT_DIR": self.export,
            "STAGE_DIR": self.stage,
            "MANIFEST_PATH": self.manifest_path,
        }
        for name, value in patches.items():
            patcher = mock.patch.object(module, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.write_manifest()

    def write_manifest(self, **overrides):
        entry = {
            "file": "e/fund.general/2025/index.html",
            "sha256": hashlib.sha256(self.capture_path.read_bytes()).hexdigest(),
            "requested_year": 2025,
            "selected_year": 2025,
        }
        entry.update(overrides.pop("entry", {}))
        manifest = {
            "node_version": "v22.23.2",
            "export_digest": module.export_digest(self.export),
            "partial_run": False,
            "routes": {ROUTE: entry},
        }
        manifest.update(overrides)
        if manifest["routes"] is None:
            manifest["routes"] = {}
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    def assertRefused(self, fragment: str, route: str = ROUTE):
        with self.assertRaises(BaselineSourceError) as caught:
            capture(route)
        self.assertIn(fragment, str(caught.exception).lower(), f"the refusal did not name {fragment!r}: {caught.exception}")


class BaselineGateRefusals(GateHarness):
    def test_a_valid_capture_is_read_from_the_staging_directory(self):
        """The positive control. Without it, every refusal below could be vacuous."""
        snapshot = capture(ROUTE)
        self.assertEqual(snapshot["title"], "General Fund — FY2025 · Greenville County Budget Explorer")
        self.assertEqual(snapshot["money"], ["$251,432,463", "$246,001,002", "$15,403,265"])
        self.assertIn("How the General Fund moves through one year", snapshot["headings"])

    def test_a_missing_manifest_is_refused_rather_than_read_from_the_export(self):
        self.manifest_path.unlink()
        self.assertRefused("no render manifest")

    def test_a_route_absent_from_the_manifest_never_falls_back_to_the_redirect_stub(self):
        # The whole reason the gate went red. The stub exists on disk at the same route, so a
        # fallback would find it, extract an empty page, and report it as a content change.
        self.write_manifest(routes={})
        self.assertRefused("was not rendered")

    def test_a_capture_from_an_earlier_build_is_refused_as_stale(self):
        self.write_manifest(export_digest="0" * 64)
        self.assertRefused("stale")

    def test_a_capture_rendered_on_the_wrong_node_is_refused(self):
        # Node 24 changes Intl compact-currency output. Those captures look perfect.
        self.write_manifest(node_version="v24.12.0")
        self.assertRefused("node 22")

    def test_a_capture_edited_after_rendering_is_refused(self):
        self.capture_path.write_text(PAGE_HTML.replace("$251,432,463", "$999,999,999"), encoding="utf-8")
        self.assertRefused("has changed since it was rendered")

    def test_a_capture_of_the_wrong_year_is_refused(self):
        self.write_manifest(entry={"selected_year": 2026})
        self.assertRefused("wrong page")

    def test_a_manifest_entry_whose_file_vanished_is_refused(self):
        self.capture_path.unlink()
        self.assertRefused("is missing")

    def test_a_manifest_entry_that_records_no_year_is_refused(self):
        # `selected_year != requested_year` is False when both are None, so an entry that
        # recorded neither year sailed through the wrong-page check as though it had matched.
        self.write_manifest(entry={"requested_year": None, "selected_year": None})
        self.assertRefused("does not record")

    def test_a_manifest_entry_that_names_no_file_is_refused_by_name(self):
        # A malformed entry must fail with the gate's own named refusal, not a KeyError or
        # TypeError that a caller catching BaselineSourceError never sees.
        self.write_manifest(entry={"file": None})
        self.assertRefused("names no capture file")

    def test_a_capture_whose_years_agree_with_each_other_but_not_the_route_is_refused(self):
        # Round-3 review, P2: the check compared the two recorded years to each other only, so
        # a FY2026 capture filed under the FY2025 route passed as long as both fields said 2026.
        self.write_manifest(entry={"requested_year": 2026, "selected_year": 2026})
        self.assertRefused("route")

    def _stage(self, html: str):
        """Replace the staged capture with `html`, correctly hashed, so only content can refuse it."""
        self.capture_path.write_text(html, encoding="utf-8")
        self.write_manifest()

    def test_a_correctly_hashed_loading_state_capture_is_refused(self):
        # The manifest's own claims are not evidence: a loading panel with a matching sha256
        # and matching years used to be accepted. Completion is re-checked on the capture.
        self._stage(LOADING_HTML)
        self.assertRefused("loading state")

    def test_a_correctly_hashed_error_state_capture_is_refused(self):
        self._stage(ERROR_HTML)
        self.assertRefused("error state")

    def test_a_capture_without_the_panel_heading_is_refused(self):
        self._stage(PAGE_HTML.replace("<h1>How the General Fund moves through one year</h1>", ""))
        self.assertRefused("<h1>")

    def test_a_capture_with_too_few_dollar_figures_is_refused(self):
        self._stage(PAGE_HTML.replace(" against spending of $246,001,002 and transfers in of $15,403,265", ""))
        self.assertRefused("dollar figures")

    def test_a_capture_that_never_mentions_the_requested_year_is_refused(self):
        self._stage(PAGE_HTML.replace("in FY2025", "in that year"))
        self.assertRefused("fy2025")

    def test_a_route_with_no_manifest_entry_in_the_route_list_is_refused(self):
        with self.assertRaises(BaselineSourceError) as caught:
            capture("e/not.a.real.entity/2026")
        self.assertIn("not declared", str(caught.exception))


class RouteManifestCoverage(unittest.TestCase):
    """The route list and the committed fixtures must be the same set, both ways.

    A fixture with no route entry would never be rendered; a route entry with no fixture would
    render something nothing compares. Either one shrinks coverage without failing anything,
    which is how a gate stops gating.
    """

    def test_every_declared_route_has_a_committed_fixture(self):
        missing = [route for route in declared_routes()
                   if not (module.OUT_DIR / (route.replace("/", "__") + ".json")).exists()]
        self.assertEqual(missing, [], "declared routes with no committed fixture")

    def test_every_committed_fixture_has_a_declared_route(self):
        declared = set(declared_routes())
        orphans = sorted(path.stem.replace("__", "/") for path in module.OUT_DIR.glob("*.json")
                         if path.stem.replace("__", "/") not in declared)
        self.assertEqual(orphans, [], "committed fixtures with no route-manifest entry")

    def test_browser_routes_are_not_quietly_declared_static(self):
        # A route flipped to render=static would read the redirect stub and compare an empty
        # page, which is precisely the failure this repair exists to remove.
        static = [route for route, entry in declared_routes().items() if entry["render"] != "browser"]
        self.assertEqual(static, [], "entity-year routes cannot be captured from static HTML since a5f4045")


if __name__ == "__main__":
    unittest.main()
