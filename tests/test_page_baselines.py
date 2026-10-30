"""Guard the pages that have already been reviewed against silent change.

The FY2025 General Fund page passed owner review. Generalising the interface from one
hand-written year to fifteen touches the component that renders it, and the failure mode
that matters is not a crash: it is the page quietly rendering a different number, or dropping
a caveat, while every test still passes.

FY2026 and FY2014 are captured too because they exercise the other two shapes: adopted-budget
only with no audited actual, and a pre-2018 year whose printed sources statement does not
exist.

These fixtures are the *current* output, not the desired output. Where the plan intends a
page to change (FY2014's false "not published", for one), the expected fix is to update the
fixture in the same commit as the change, with the diff visible in review. A fixture that is
regenerated silently is worse than no fixture.

TWO STEPS since the route consolidation. `e/<id>/<fy>/` is now an 883-byte meta-refresh stub
and the consolidated route server-renders the latest year only, so these pages have to be
rendered in a browser before they can be compared:

    cd web && npm run build && npm run baselines:render
    REQUIRE_PAGE_BASELINES=1 python3 -m unittest tests.test_page_baselines

Skipping the render does not weaken the comparison; it fails it. Every way a rendered capture
can be quietly wrong — missing, stale, partial, tampered with, wrong year, wrong Node — has a
named refusal and a test in tests/test_page_baseline_gate.py.
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path

from scripts.curation.capture_page_baseline import Extractor, capture

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures" / "page-baselines"
BUILD = ROOT / "web" / "out"


class BaselineExtractorTests(unittest.TestCase):
    def test_chart_tooltips_do_not_change_the_document_title(self):
        parser = Extractor()
        parser.feed('<head><title>County budget</title></head><main><svg>'
                    '<circle><title>FY2026: $100</title></circle></svg></main>')
        self.assertEqual(parser.title, "County budget")
        self.assertIn("FY2026: $100", parser.text)


class PageBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if BUILD.exists():
            return
        # Skipping is a convenience for a local run with no build. In CI it is a hole: the
        # Python job has no `web/out`, so these fixtures — the ones guarding the
        # owner-reviewed page from silent change — were skipping in the only pipeline that
        # gates a merge. REQUIRE_PAGE_BASELINES makes the absence of a build a failure, and
        # CI sets it on the job that has actually built the site.
        if os.environ.get("REQUIRE_PAGE_BASELINES"):
            raise AssertionError(
                f"{BUILD} does not exist, but REQUIRE_PAGE_BASELINES is set. These fixtures "
                "must run here; a skip means the page baselines are not being checked."
            )
        raise unittest.SkipTest("run `npm run build` in web/ first")

    def _compare(self, route: str):
        fixture_path = FIXTURES / (route.strip("/").replace("/", "__") + ".json")
        self.assertTrue(fixture_path.exists(), f"missing baseline for {route}")
        expected = json.loads(fixture_path.read_text(encoding="utf-8"))
        actual = capture(route)

        # Compare the reader-visible things individually, so a failure names what moved
        # rather than dumping two documents.
        self.assertEqual(
            expected["money"], actual["money"],
            f"{route}: the dollar figures rendered on this page changed",
        )
        self.assertEqual(
            expected["percentages"], actual["percentages"],
            f"{route}: the percentages rendered on this page changed",
        )
        self.assertEqual(
            expected["headings"], actual["headings"],
            f"{route}: the headings on this page changed",
        )
        self.assertEqual(
            expected.get("title"), actual["title"],
            f"{route}: the page title changed",
        )
        self.assertEqual(
            expected["text"], actual["text"],
            f"{route}: the visible text of this page changed",
        )

    def test_fy2025_general_fund_page_is_unchanged(self):
        """The owner-reviewed page. Its output is the contract."""
        self._compare("e/fund.general/2025")

    def test_fy2026_general_fund_page_is_unchanged(self):
        """Adopted budget only; no audited actual exists for this year yet."""
        self._compare("e/fund.general/2026")

    def test_fy2014_general_fund_page_is_unchanged(self):
        """A pre-2018 year, where the county printed no reconciled sources statement."""
        self._compare("e/fund.general/2014")

    def test_special_revenue_fund_page_is_unchanged(self):
        """The FY2026 Special Revenue accounting loop, with source-backed money in,
        position, money out, and the existing named-sub-fund composition."""
        self._compare("e/fund.special-revenue/2026")

    def test_debt_service_fund_page_is_unchanged(self):
        """The FY2014 Debt Service accounting loop, sourced from a later biennial book
        whose actual column reaches back to that year."""
        self._compare("e/fund.debt-service/2014")

    def test_enterprise_fund_page_is_unchanged(self):
        """The latest Enterprise operating statement, where funding and position changes
        remain distinct and beginning/ending fund balance is not manufactured."""
        self._compare("e/fund.enterprise/2026")

    def test_department_page_is_unchanged(self):
        """The honesty minimum on a department: per-row citations across six books, the
        FY2006 benefits break, and the status-change markers at FY2003/FY2004."""
        self._compare("e/dept.sheriff/2026")

    def test_published_zero_page_is_unchanged(self):
        """The page that proves the two absences are different things: FY2004 and FY2005
        render a real published $0, FY2006 and FY2007 render "Not published"."""
        self._compare("e/dept.indigentdefense/2005")

    def test_affordable_housing_dash_note_is_unchanged(self):
        """A printed dash rendered as $0 is marked with the ordinance evidence beside it."""
        self._compare("e/fund.sr.affordable-housing/2023")

    def test_natural_resources_dash_note_is_unchanged(self):
        """The Trust appropriation outside this fund table stays attached to the dash cells."""
        self._compare("e/fund.sr.natural-resources/2023")

    def test_operating_category_page_is_unchanged(self):
        """A category with children and a ten-year hole in the middle of its series."""
        self._compare("e/opcat.public-works/2026")

    def test_two_status_year_page_is_unchanged(self):
        """A year shared by actual and adopted rows has one year link and two labelled values."""
        self._compare("e/rev.sr.fees/2025")

    def test_budget_total_page_is_unchanged(self):
        """The whole-budget page: the county-published total, its four children, the transfer
        note and the continuous five-year line.

        Captured before any transfer-clarity copy lands, so that every later edit to this
        page's wording arrives as a visible fixture diff rather than as an absorbed change.
        """
        self._compare("e/budget.total/2026")


if __name__ == "__main__":
    unittest.main()
