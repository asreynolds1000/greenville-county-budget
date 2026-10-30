"""Source-page invariants for generated audited General Fund observations."""

from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from scripts.curation import gen_audited_observations as generator


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "data" / "production" / "observations" / "general-fund-audited-series-extension.csv"
OFFSETS = ROOT / "research" / "fy2025-budget-actual" / "printed-page-offsets.csv"
SUMMARY = ROOT / "research" / "fy2025-budget-actual" / "basic-statement-totals.csv"
SERIES = ROOT / "data" / "production" / "general_fund_audited_series.csv"

POSITION_LABELS = {
    "Fund balance, beginning of year",
    "Net change in fund balances",
    "Fund balance, end of year",
    "Adjustment: Budget to GAAP basis (Note 1-D)",
}
CLOSING_FLOW_LABELS = {"Total expenditures", "Transfers in", "Transfers out"}
LABEL_TO_MEASURE = {
    "Fund balance, beginning of year": "fund_balance_beginning",
    "Net change in fund balances": "net_change",
    "Fund balance, end of year": "fund_balance_ending",
    "Adjustment: Budget to GAAP basis (Note 1-D)": "budget_to_gaap_adjustment",
    "Total revenues": "total_revenues",
    "Total expenditures": "total_expenditures",
    "Transfers in": "transfers_in",
    "Transfers out": "transfers_out",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


class AuditedCitationPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.offsets = {row["fiscal_year"]: row for row in read_csv(OFFSETS)}
        cls.summary = {
            row["fiscal_year"]: row
            for row in read_csv(SUMMARY)
            if row["measure"] == "total_revenues"
        }
        cls.series = {
            (row["fiscal_year"], row["measure"]): row["actual"]
            for row in read_csv(SERIES)
        }

    def assert_source_pages(self, rows: list[dict[str, str]]):
        self.assertEqual({row["fiscal_year"] for row in rows}, {str(year) for year in range(2011, 2025)})
        for row in rows:
            year = row["fiscal_year"]
            label = row["original_label"]
            self.assertEqual(row["value"], self.series[(year, LABEL_TO_MEASURE[label])], f"FY{year} {label} value")
            if label in POSITION_LABELS:
                expected = self.summary[year]
                expected_pdf, expected_printed = expected["pdf_page"], expected["printed_page"]
            else:
                pages = self.offsets[year]
                if label == "Total revenues":
                    expected_pdf = pages["first_pdf_page"]
                else:
                    self.assertIn(label, CLOSING_FLOW_LABELS)
                    expected_pdf = pages["section_last_pdf_page"]
                expected_printed = str(int(expected_pdf) - int(pages["offset"]))

            self.assertEqual((row["pdf_page"], row["printed_page"]), (expected_pdf, expected_printed), f"FY{year} {label}")

    def test_checked_in_extension_uses_verified_statement_and_schedule_pages(self):
        """Revenue remains on the opening page; closing flows and position bridge do not."""
        self.assert_source_pages(read_csv(EXTENSION))

    def test_generator_preserves_the_verified_page_classes(self):
        """Exercise the generator in a temp directory so a future regeneration cannot revert cites."""
        original_dir, original_out = generator.OUT_DIR, generator.OUT
        with tempfile.TemporaryDirectory() as directory:
            generator.OUT_DIR = Path(directory)
            generator.OUT = generator.OUT_DIR / "extension.csv"
            try:
                self.assertEqual(generator.main(), 0)
                self.assert_source_pages(read_csv(generator.OUT))
            finally:
                generator.OUT_DIR, generator.OUT = original_dir, original_out

    def test_generator_refuses_to_emit_a_bridge_without_statement_metadata(self):
        original_read = generator._read

        def read_without_fy2011_summary(path: Path):
            rows = original_read(path)
            if path == generator._RESEARCH / "basic-statement-totals.csv":
                return [row for row in rows if row["fiscal_year"] != "2011"]
            return rows

        generator._read = read_without_fy2011_summary
        try:
            with self.assertRaisesRegex(ValueError, "FY2011 lacks verified budget-and-actual statement"):
                generator.main()
        finally:
            generator._read = original_read


if __name__ == "__main__":
    unittest.main()
