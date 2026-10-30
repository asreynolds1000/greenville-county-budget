"""How much of the General Fund balance is actually available.

"How much money does the county have?" is one of the questions this project exists to
answer, and fund balance is the number people reach for. Most of it is not spendable. These
tests hold the decomposition honest.
"""

from __future__ import annotations

import csv
import sqlite3
import unittest
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "dist" / "gc_budget.sqlite"
DATA = ROOT / "data" / "production"

AUDITED_YEARS = tuple(range(2011, 2026))
# The county stops reporting an Assigned General Fund balance after FY2017.
ASSIGNED_YEARS = tuple(range(2011, 2018))


class BalanceCompositionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DB.exists():
            raise unittest.SkipTest("run scripts.production.pipeline first")
        cls.conn = sqlite3.connect(DB)

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def test_every_audited_year_has_a_composition_statement(self):
        years = [
            row[0] for row in self.conn.execute(
                "SELECT fiscal_year FROM statement_instance "
                "WHERE statement_id='gf.balance-composition' ORDER BY fiscal_year"
            )
        ]
        self.assertEqual(tuple(years), AUDITED_YEARS)

    def test_classifications_sum_to_the_audited_ending_balance(self):
        """Re-derived from canonical values, not trusted from the reconciled flag."""
        rows = self.conn.execute("""
            SELECT si.fiscal_year, SUM(cv.value * sm.arithmetic_sign)
            FROM statement_instance si
            JOIN statement_member sm ON sm.statement_id = si.statement_id
              AND si.fiscal_year BETWEEN sm.effective_from_fy AND sm.effective_to_fy
            JOIN canonical_value cv ON cv.entity_id = sm.entity_id
              AND cv.fiscal_year = si.fiscal_year AND cv.status_class = sm.status_class
            WHERE si.statement_id = 'gf.balance-composition'
            GROUP BY 1 ORDER BY 1
        """).fetchall()
        self.assertEqual(len(rows), len(AUDITED_YEARS))
        for fiscal_year, delta in rows:
            self.assertEqual(delta, 0, f"FY{fiscal_year} classifications do not sum to the balance")

    def test_the_general_fund_is_never_restricted(self):
        """Restricted is nil in all fifteen years.

        No observation is emitted for it. A printed zero and an absent classification are
        different claims, and asserting a restricted balance the county never reported would
        be the more damaging of the two.
        """
        with (DATA / "general_fund_balance_classifications.csv").open(
            newline="", encoding="utf-8-sig"
        ) as fh:
            rows = list(csv.DictReader(fh))
        restricted = [r for r in rows if r["classification"].strip() == "Restricted"]
        self.assertTrue(restricted, "the source should still carry the Restricted line")
        self.assertTrue(all(int(r["amount"]) == 0 for r in restricted))

        emitted = self.conn.execute(
            "SELECT COUNT(*) FROM observation WHERE original_label='Fund balance - Restricted'"
        ).fetchone()[0]
        self.assertEqual(emitted, 0)

    def test_assigned_is_scoped_to_its_era(self):
        years = {
            row[0] for row in self.conn.execute(
                "SELECT DISTINCT fiscal_year FROM canonical_value "
                "WHERE entity_id='balance.gf.assigned'"
            )
        }
        self.assertEqual(tuple(sorted(years)), ASSIGNED_YEARS)

    def test_unassigned_is_a_minority_of_the_headline_balance(self):
        """The point of the whole decomposition, asserted on a known year.

        FY2025: $65,438,641 unassigned out of an $81,545,344 ending balance. If these ever
        become equal, the decomposition has silently stopped decomposing.
        """
        unassigned = self.conn.execute(
            "SELECT value FROM canonical_value "
            "WHERE entity_id='balance.gf.unassigned' AND fiscal_year=2025"
        ).fetchone()[0]
        ending = self.conn.execute(
            "SELECT value FROM canonical_value "
            "WHERE entity_id='balance.gf.ending' AND fiscal_year=2025 AND status_class='actual'"
        ).fetchone()[0]
        self.assertEqual(unassigned, 65_438_641)
        self.assertEqual(ending, 81_545_344)
        self.assertLess(unassigned, ending)

    def test_every_classification_observation_cites_a_page(self):
        """A figure a reader cannot check on the printed page has no business being published."""
        missing = self.conn.execute("""
            SELECT COUNT(*) FROM observation
            WHERE original_label LIKE 'Fund balance - %'
              AND (source_url IS NULL OR pdf_page IS NULL)
        """).fetchone()[0]
        self.assertEqual(missing, 0)


if __name__ == "__main__":
    unittest.main()
