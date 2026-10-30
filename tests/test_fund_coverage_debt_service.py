import copy
import unittest

from scripts.fund_coverage.extract_debt_service import SOURCES, extract_all, validate
from tests._sources import require_source_corpus


class DebtServiceExtractionTests(unittest.TestCase):
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

    def test_cross_book_difference_is_retained(self):
        starts = {
            (row["source_code"], row["status"]): row["value"]
            for row in self.rows
            if row["fiscal_year"] == 2020 and row["original_label"] == "Fund Balance July 1"
        }
        self.assertEqual(starts[("FY2020-21", "BUDGET")], 5_674_809)
        self.assertEqual(starts[("FY2022-23", "ACTUAL")], 5_674_876)

    def test_mutated_financing_total_fails_closed(self):
        mutated = copy.deepcopy(self.rows)
        row = next(
            row
            for row in mutated
            if row["source_code"] == "FY2022-23"
            and row["fiscal_year"] == 2021
            and row["original_label"] == "Total Other Sources (Uses)"
        )
        row["value"] += 1
        with self.assertRaisesRegex(ValueError, "financing does not reconcile"):
            validate(mutated)

    def test_unlabelled_old_expenditure_total_is_recovered(self):
        row = next(
            row
            for row in self.rows
            if row["source_code"] == "FY2012-13"
            and row["fiscal_year"] == 2010
            and row["original_label"] == "Total Expenditures"
        )
        self.assertEqual(row["value"], 19_955_758)


if __name__ == "__main__":
    unittest.main()
