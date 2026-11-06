"""The final FY2027 book can publish a new year without importing comparisons."""

import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.production.pipeline import run_pipeline
from tests._sources import require_source_corpus

ROOT = Path(__file__).resolve().parents[1]


class FY2027AdoptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        result = run_pipeline(
            ROOT / "audit/blind-extraction", ROOT / "data/production",
            root / "build", root / "dist",
        )
        assert result.ok, result.errors
        cls.conn = sqlite3.connect(root / "dist/gc_budget.sqlite")

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        cls.tmp.cleanup()

    def test_final_book_adds_only_fy2027(self):
        years = self.conn.execute(
            "SELECT DISTINCT fiscal_year FROM observation WHERE source_code='FY2027'"
        ).fetchall()
        self.assertEqual(years, [(2027,)])

    def test_adopted_fund_totals_and_amendment_category(self):
        expected = {
            "fund.general": 288494094,
            "fund.special-revenue": 118256009,
            "fund.debt-service": 33861514,
            "fund.enterprise": 35296480,
            "fund.internal-service": 58943086,
            "budget.total": 475908097,
            "overview.gf.other-services": 17006528,
        }
        for entity, value in expected.items():
            with self.subTest(entity=entity):
                row = self.conn.execute(
                    "SELECT value FROM canonical_value WHERE entity_id=? "
                    "AND fiscal_year=2027 AND status_class='adopted'", (entity,),
                ).fetchone()
                self.assertEqual(row, (value,))

    def test_blank_tax_sale_cell_stays_absent(self):
        rows = self.conn.execute(
            "SELECT fiscal_year,value FROM canonical_value "
            "WHERE entity_id='rev.other.tax-sale' AND fiscal_year>=2026"
        ).fetchall()
        self.assertEqual(rows, [(2026, 0)])
        self.assertGreater(self.conn.execute(
            "SELECT COUNT(*) FROM observation WHERE source_code='FY2027' "
            "AND value=0 AND printed_form='-'"
        ).fetchone()[0], 0)


class FY2027SourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_source_corpus(["data/raw/gc-fy2027/BudgetCombined.pdf"])

    def test_curated_observations_reextract_from_the_verified_book(self):
        from scripts.fund_coverage.extract_fy2027 import FIELDS, OUTPUT, extract

        with OUTPUT.open(newline="") as handle:
            stored = list(csv.DictReader(handle))
        actual = [
            {key: str(row.get(key, "")) for key in FIELDS}
            for row in extract()
        ]
        self.assertEqual(stored, actual)


if __name__ == "__main__":
    unittest.main()
