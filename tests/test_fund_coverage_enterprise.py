import copy
import unittest

from scripts.fund_coverage.extract_enterprise import SOURCES, extract_all, validate
from tests._sources import require_source_corpus


class EnterpriseExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_source_corpus([source.relative_pdf for source in SOURCES])
        cls.rows = extract_all()

    def test_every_source_column_is_extracted_and_reconciled(self):
        validate(self.rows)
        expected = sum(len(source.columns) for source in SOURCES)
        actual = {
            (row["source_code"], row["fiscal_year"], row["status"])
            for row in self.rows
        }
        self.assertEqual(expected, len(actual))
        self.assertEqual({2002, 2026}, {min(row["fiscal_year"] for row in self.rows), max(row["fiscal_year"] for row in self.rows)})

    def test_fund_balance_usage_is_not_classified_as_outside_revenue(self):
        rows = [
            row for row in self.rows
            if row["original_label"].upper().endswith(("USAGE (CONTRIBUTION)", "F/B CONTRIBUTION"))
            and row["statement_section"].startswith("position_change_")
        ]
        self.assertGreater(len(rows), 0)
        self.assertFalse(any(row["statement_section"].startswith("inflow_") for row in rows))

    def test_every_observation_has_page_level_provenance(self):
        for row in self.rows:
            with self.subTest(source=row["source_code"], year=row["fiscal_year"], label=row["original_label"]):
                self.assertTrue(row["source_url"].startswith("https://www.greenvillecounty.org/"))
                self.assertGreater(row["pdf_page"], 0)
                self.assertGreater(row["printed_page"], 0)
                self.assertIn(row["status"], {"ACTUAL", "PROJECTED", "BUDGET"})

    def test_mutated_total_fails_closed(self):
        mutated = copy.deepcopy(self.rows)
        row = next(
            row for row in mutated
            if row["source_code"] == "FY2026"
            and row["fiscal_year"] == 2026
            and row["statement_section"] == "total_enterprise_expense"
        )
        row["value"] += 1
        with self.assertRaisesRegex(ValueError, "Enterprise expenses do not reconcile"):
            validate(mutated)

    def test_fy2004_source_exception_is_exact(self):
        mutated = copy.deepcopy(self.rows)
        row = next(
            row for row in mutated
            if row["source_code"] == "FY2006-07"
            and row["fiscal_year"] == 2004
            and row["status"] == "ACTUAL"
            and row["original_label"] == "TOTAL FUNDS"
        )
        row["value"] += 1
        with self.assertRaisesRegex(ValueError, r"expected delta \+6013793"):
            validate(mutated)


if __name__ == "__main__":
    unittest.main()
