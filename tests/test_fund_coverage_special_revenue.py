import copy
import unittest

from scripts.fund_coverage.extract_special_revenue import (
    SOURCES,
    extract_all,
    validate,
)
from tests._sources import require_source_corpus


class SpecialRevenueExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_source_corpus([source.relative_pdf for source in SOURCES])
        cls.rows = extract_all()

    def test_all_source_years_reconcile(self):
        validate(self.rows)
        expected_years = sum(len(source.years) for source in SOURCES)
        actual_years = {(row["source_code"], row["fiscal_year"]) for row in self.rows}
        self.assertEqual(expected_years, len(actual_years))

    def test_every_observation_has_page_level_provenance(self):
        for row in self.rows:
            with self.subTest(source=row["source_code"], year=row["fiscal_year"], label=row["original_label"]):
                self.assertTrue(row["source_url"].startswith("https://www.greenvillecounty.org/"))
                self.assertGreater(row["pdf_page"], 0)
                self.assertGreater(row["printed_page"], 0)
                self.assertIn(row["status"], {"ACTUAL", "BUDGET"})

    def test_raster_recovery_keeps_printed_adjustment_unsigned(self):
        row = next(
            row
            for row in self.rows
            if row["source_code"] == "FY2022-23"
            and row["fiscal_year"] == 2022
            and row["original_label"] == "Reserved for Encumbrances"
        )
        self.assertEqual(1_141_125, row["value"])
        self.assertEqual("position_adjustment", row["statement_section"])

    def test_mutated_source_total_fails_closed(self):
        mutated = copy.deepcopy(self.rows)
        row = next(
            row
            for row in mutated
            if row["source_code"] == "FY2026"
            and row["fiscal_year"] == 2026
            and row["original_label"] == "Total Estimated Financial Sources"
        )
        row["value"] += 1
        with self.assertRaisesRegex(ValueError, "financial sources do not reconcile"):
            validate(mutated)

    def test_registered_one_dollar_source_anomaly_is_exact(self):
        mutated = copy.deepcopy(self.rows)
        row = next(
            row
            for row in mutated
            if row["source_code"] == "FY2014-15"
            and row["fiscal_year"] == 2012
            and row["original_label"] == "Excess(deficiency) of revenues over(under) expenditures"
        )
        row["value"] += 1
        with self.assertRaisesRegex(ValueError, "registered source delta"):
            validate(mutated)


if __name__ == "__main__":
    unittest.main()
