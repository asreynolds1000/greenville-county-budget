"""The audited General Fund position statement across every audited year.

Before this, the statement existed for FY2019, FY2021 and FY2023-FY2025 only, so twelve of
fifteen years would have rendered comparison bars with no headline plan-versus-result
equation above them.
"""

from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "dist" / "gc_budget.sqlite"

AUDITED_YEARS = tuple(range(2011, 2026))
# FY2011-FY2017 print an explicit budget-to-GAAP adjustment; from FY2018 it is zero every
# year and no line is printed, so those years carry one member fewer.
ADJUSTMENT_YEARS = tuple(range(2011, 2018))


class AuditedPositionSeriesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DB.exists():
            raise unittest.SkipTest("run scripts.production.pipeline first")
        cls.conn = sqlite3.connect(DB)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_every_audited_year_has_a_position_statement(self):
        years = [
            row[0] for row in self.conn.execute(
                "SELECT fiscal_year FROM statement_instance "
                "WHERE statement_id='gf.actual-position' ORDER BY fiscal_year"
            )
        ]
        self.assertEqual(tuple(years), AUDITED_YEARS)

    def test_every_year_reconciles_to_zero(self):
        """Re-derive the signed delta from canonical values rather than trusting the flag."""
        rows = self.conn.execute("""
            SELECT si.fiscal_year, SUM(cv.value * sm.arithmetic_sign)
            FROM statement_instance si
            JOIN statement_member sm ON sm.statement_id = si.statement_id
              AND si.fiscal_year BETWEEN sm.effective_from_fy AND sm.effective_to_fy
            JOIN canonical_value cv ON cv.entity_id = sm.entity_id
              AND cv.fiscal_year = si.fiscal_year AND cv.status_class = sm.status_class
            WHERE si.statement_id = 'gf.actual-position'
            GROUP BY 1 ORDER BY 1
        """).fetchall()
        self.assertEqual(len(rows), len(AUDITED_YEARS))
        for fiscal_year, delta in rows:
            self.assertEqual(delta, 0, f"FY{fiscal_year} position does not reconcile")

    def test_the_adjustment_term_applies_only_to_its_era(self):
        """Without it FY2011-FY2017 do not balance; asserting it as a zero after FY2017
        would claim the county printed a nil line it never printed."""
        rows = dict(self.conn.execute("""
            SELECT si.fiscal_year, COUNT(*)
            FROM statement_instance si
            JOIN statement_member sm ON sm.statement_id = si.statement_id
              AND si.fiscal_year BETWEEN sm.effective_from_fy AND sm.effective_to_fy
            WHERE si.statement_id = 'gf.actual-position'
            GROUP BY 1
        """).fetchall())
        for year in AUDITED_YEARS:
            expected = 4 if year in ADJUSTMENT_YEARS else 3
            self.assertEqual(rows[year], expected, f"FY{year} member count")

    def test_the_frozen_blind_extraction_was_not_edited(self):
        """New years are ingested from their own dataset, never merged into the frozen files."""
        datasets = {
            row[0] for row in self.conn.execute(
                "SELECT DISTINCT source_dataset FROM observation "
                "WHERE original_label LIKE 'Fund balance%'"
            )
        }
        self.assertIn("general-fund-audited-results", datasets)
        self.assertIn("general-fund-audited-series-extension", datasets)


if __name__ == "__main__":
    unittest.main()
