"""Exported headline comparison totals must remain independently source-backed."""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.production.export_app import _data_version, _export_general_fund_budget_actual_comparison


ROOT = Path(__file__).resolve().parents[1]
SERIES = ROOT / "data" / "production" / "general_fund_audited_series.csv"
STATEMENT_TOTALS = ROOT / "research" / "fy2025-budget-actual" / "basic-statement-totals.csv"
DATA_NOTES = ROOT / "data" / "production" / "data_notes.csv"
PRINTED_FORMS = ROOT / "data" / "production" / "comparison_total_printed_forms.csv"
COMPARISON_SOURCE = ROOT / "data" / "production" / "general_fund_budget_actual_comparison.csv"
RESIDUALS = ROOT / "data" / "production" / "general_fund_flow_residuals.csv"
REQUIRED_TOTALS = {
    "total_revenues",
    "total_expenditures",
    "transfers_in",
    "transfers_out",
    "net_change",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


class GeneralFundComparisonTotalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audited = {
            (int(row["fiscal_year"]), row["measure"]): row
            for row in read_csv(SERIES)
            if row["measure"] in REQUIRED_TOTALS
        }
        cls.statement_pages = {
            int(row["fiscal_year"]): (int(row["printed_page"]), int(row["pdf_page"]))
            for row in read_csv(STATEMENT_TOTALS)
            if row["measure"] == "total_revenues"
        }
        cls.notes = read_csv(DATA_NOTES)
        cls.printed_forms = {
            (int(row["fiscal_year"]), row["measure"], row["column"]): row
            for row in read_csv(PRINTED_FORMS)
        }
        cls.residuals: dict[int, list[dict]] = {}
        for row in read_csv(RESIDUALS):
            cls.residuals.setdefault(int(row["fiscal_year"]), []).append(row)

    @classmethod
    def expected_total_note_ids(cls, year: int) -> list[str]:
        """Re-derive the declared dataset/year reach without exporter helpers."""
        applicable = []
        for note in cls.notes:
            start, end = note["fiscal_year_start"], note["fiscal_year_end"]
            if start and year < int(start) or end and year > int(end):
                continue
            if note["scope_type"] == "fiscal_year" or (
                note["scope_type"] == "dataset"
                and note["scope_value"] == "general_fund_budget_actual_comparison"
            ):
                applicable.append(note["note_id"])
        return sorted(applicable)

    def test_exported_totals_use_the_audited_final_budget_and_basic_statement_page(self):
        """Catch an adopted-budget substitution or a detailed-schedule page cite."""
        with tempfile.TemporaryDirectory() as directory:
            out_dir = Path(directory)
            written = _export_general_fund_budget_actual_comparison(out_dir, notes=self.notes)
            comparisons = sorted(
                (out_dir / "data" / "v2" / "comparisons").glob("general-fund-fy*-budget-actual.json")
            )

            self.assertEqual(len(comparisons), 15)
            for path in comparisons:
                payload = json.loads(path.read_text(encoding="utf-8"))
                year = payload["fiscal_year"]
                self.assertEqual(
                    set(payload["totals"]) - {"residual_components"}, REQUIRED_TOTALS, f"FY{year}"
                )
                self.assertIn("residual_components", payload["totals"], f"FY{year}")
                self.assertIn(year, self.statement_pages, f"FY{year} basic statement page")

                # The residual is what closes the gap between the four flow measures and
                # the audited net change (transfers_out is stored negative, so it is added,
                # not subtracted). Independently re-derive that identity per column, rather
                # than trusting the exporter's own arithmetic, and cross-check every exported
                # component against the source CSV row it came from.
                components = payload["totals"]["residual_components"]
                source_rows = self.residuals.get(year, [])
                self.assertEqual(len(components), len(source_rows), f"FY{year} residual count")
                by_label = {(c["column"], c["label"]): c for c in components}
                sums: dict[str, int] = {}
                for row in source_rows:
                    key = (row["column"], row["component"])
                    self.assertIn(key, by_label, f"FY{year} {key}")
                    exported = by_label[key]
                    self.assertEqual(exported["amount"], int(row["amount"]), f"FY{year} {key}")
                    self.assertEqual(
                        exported["source_page"], self.statement_pages[year][0], f"FY{year} {key}"
                    )
                    self.assertEqual(exported["source_code"], payload["source"]["source_code"])
                    sums[row["column"]] = sums.get(row["column"], 0) + int(row["amount"])

                totals_measure_key = {"actual": "actual", "final_budget": "budget"}
                for column, component_sum in sums.items():
                    measure_key = totals_measure_key[column]
                    t = payload["totals"]
                    identity_residual = t["net_change"][measure_key] - (
                        t["total_revenues"][measure_key]
                        - t["total_expenditures"][measure_key]
                        + t["transfers_in"][measure_key]
                        + t["transfers_out"][measure_key]
                    )
                    self.assertEqual(
                        component_sum, identity_residual, f"FY{year} {column} residual identity"
                    )

                for measure, total in payload["totals"].items():
                    if measure == "residual_components":
                        continue
                    source = self.audited[(year, measure)]
                    self.assertEqual(total["budget"], int(source["final_budget"]), f"FY{year} {measure} budget")
                    self.assertEqual(total["actual"], int(source["actual"]), f"FY{year} {measure} actual")
                    self.assertEqual(
                        (total["printed_page"], total["pdf_page"]),
                        self.statement_pages[year],
                        f"FY{year} {measure} statement page",
                    )
                    for column, amount_key, form_key in (
                        ("budget", "budget", "budget_printed_form"),
                        ("actual", "actual", "actual_printed_form"),
                    ):
                        override = self.printed_forms.get((year, measure, column))
                        if total[amount_key] == 0:
                            self.assertIsNotNone(override, f"FY{year} {measure} {column} zero")
                            self.assertEqual(total[form_key], override["printed_form"])
                        else:
                            self.assertIsNone(total[form_key], f"FY{year} {measure} {column}")

            fy2011 = json.loads(
                (out_dir / "data" / "v2" / "comparisons" / "general-fund-fy2011-budget-actual.json")
                .read_text(encoding="utf-8")
            )["totals"]
            self.assertEqual(fy2011["total_expenditures"]["budget"], 126_719_519)
            self.assertEqual(fy2011["transfers_in"]["budget"], 7_248_480)
            self.assertLess(fy2011["transfers_out"]["budget"], 0)
            self.assertEqual(fy2011["net_change"]["budget_printed_form"], "-")
            fy2011_dash = self.printed_forms[(2011, "net_change", "budget")]
            self.assertEqual((fy2011_dash["pdf_page"], fy2011_dash["printed_page"]), ("42", "28"))
            self.assertIn("Final Budget column prints a dash", fy2011_dash["source_note"])

            totals_path = (
                out_dir / "public" / "downloads" / "comparisons"
                / "general-fund-totals-budget-actual.csv"
            )
            self.assertIn(totals_path, written)
            with totals_path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                self.assertEqual(
                    reader.fieldnames,
                    [
                        "fiscal_year", "measure", "budget", "budget_printed_form", "actual",
                        "actual_printed_form", "basis", "source_code", "source_url", "pdf_page",
                        "printed_page", "note_ids",
                    ],
                )
                total_rows = list(reader)

            self.assertEqual(len(total_rows), 75)
            downloaded = {(int(row["fiscal_year"]), row["measure"]): row for row in total_rows}
            self.assertEqual(len(downloaded), 75)
            for path in comparisons:
                payload = json.loads(path.read_text(encoding="utf-8"))
                year = payload["fiscal_year"]
                for measure, total in payload["totals"].items():
                    if measure == "residual_components":
                        continue
                    row = downloaded[(year, measure)]
                    self.assertEqual(int(row["budget"]), total["budget"])
                    self.assertEqual(row["budget_printed_form"], total["budget_printed_form"] or "")
                    self.assertEqual(int(row["actual"]), total["actual"])
                    self.assertEqual(row["actual_printed_form"], total["actual_printed_form"] or "")
                    self.assertEqual(row["source_code"], payload["source"]["source_code"])
                    self.assertEqual(row["source_url"], payload["source"]["source_url"])
                    self.assertEqual(int(row["pdf_page"]), total["pdf_page"])
                    self.assertEqual(int(row["printed_page"]), total["printed_page"])
                    expected_note_ids = self.expected_total_note_ids(year)
                    if total["budget_printed_form"] or total["actual_printed_form"]:
                        expected_note_ids = sorted([*expected_note_ids, "note.printed-dash"])
                    self.assertEqual(row["note_ids"].split(";") if row["note_ids"] else [], expected_note_ids)
                    self.assertEqual(
                        row["basis"],
                        "ACFR final amended budget vs budget-basis actual",
                    )

            version_before = _data_version(out_dir)
            with totals_path.open("a", encoding="utf-8") as handle:
                handle.write("# data-version probe\n")
            self.assertNotEqual(_data_version(out_dir), version_before)

    def test_export_refuses_an_unclassified_zero_total_operand(self):
        """A numeric zero cannot discard the county's original printed mark."""
        with tempfile.TemporaryDirectory() as directory:
            fixture_root = Path(directory)
            production = fixture_root / "data" / "production"
            statement_dir = fixture_root / "research" / "fy2025-budget-actual"
            production.mkdir(parents=True)
            statement_dir.mkdir(parents=True)

            comparison_rows = [row for row in read_csv(COMPARISON_SOURCE) if row["fiscal_year"] == "2011"]
            with (production / "general_fund_budget_actual_comparison.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=comparison_rows[0].keys())
                writer.writeheader()
                writer.writerows(comparison_rows)

            audited_rows = [
                row for row in read_csv(SERIES)
                if row["fiscal_year"] == "2011" and row["measure"] in REQUIRED_TOTALS
            ]
            with (production / "general_fund_audited_series.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=audited_rows[0].keys())
                writer.writeheader()
                writer.writerows(audited_rows)

            statement_rows = [
                row for row in read_csv(STATEMENT_TOTALS)
                if row["fiscal_year"] == "2011" and row["measure"] == "total_revenues"
            ]
            with (statement_dir / "basic-statement-totals.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=statement_rows[0].keys())
                writer.writeheader()
                writer.writerows(statement_rows)

            with (production / "comparison_total_printed_forms.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "fiscal_year", "measure", "column", "printed_form", "pdf_page",
                        "printed_page", "source_note",
                    ],
                )
                writer.writeheader()

            # Not exercised by this path (the zero-operand error fires while building
            # net_change, before the residual step runs) but the file must exist.
            with (production / "general_fund_flow_residuals.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["fiscal_year", "residual_total", "component", "amount", "column", "source"],
                )
                writer.writeheader()

            with patch("scripts.production.export_app._ROOT", fixture_root):
                with self.assertRaisesRegex(ValueError, "FY2011 net_change budget zero lacks"):
                    _export_general_fund_budget_actual_comparison(fixture_root / "web", notes=[])

    def test_export_refuses_residual_components_that_dont_sum_to_the_identity(self):
        """A wrong residual amount must fail loudly, not ship a comparison that doesn't foot."""
        with tempfile.TemporaryDirectory() as directory:
            fixture_root = Path(directory)
            production = fixture_root / "data" / "production"
            statement_dir = fixture_root / "research" / "fy2025-budget-actual"
            production.mkdir(parents=True)
            statement_dir.mkdir(parents=True)

            comparison_rows = [row for row in read_csv(COMPARISON_SOURCE) if row["fiscal_year"] == "2023"]
            with (production / "general_fund_budget_actual_comparison.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=comparison_rows[0].keys())
                writer.writeheader()
                writer.writerows(comparison_rows)

            audited_rows = [
                row for row in read_csv(SERIES)
                if row["fiscal_year"] == "2023" and row["measure"] in REQUIRED_TOTALS
            ]
            with (production / "general_fund_audited_series.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=audited_rows[0].keys())
                writer.writeheader()
                writer.writerows(audited_rows)

            statement_rows = [
                row for row in read_csv(STATEMENT_TOTALS)
                if row["fiscal_year"] == "2023" and row["measure"] == "total_revenues"
            ]
            with (statement_dir / "basic-statement-totals.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=statement_rows[0].keys())
                writer.writeheader()
                writer.writerows(statement_rows)

            # FY2023's four flow measures are all nonzero, so no printed-form override is
            # needed to pass that gate.
            with (production / "comparison_total_printed_forms.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=[
                        "fiscal_year", "measure", "column", "printed_form", "pdf_page",
                        "printed_page", "source_note",
                    ],
                )
                writer.writeheader()

            # The real FY2023 residual is "Issuance of leases" $3,164,209. Corrupt the
            # amount by one dollar so it no longer closes the identity.
            with (production / "general_fund_flow_residuals.csv").open(
                "w", newline="", encoding="utf-8"
            ) as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["fiscal_year", "residual_total", "component", "amount", "column", "source"],
                )
                writer.writeheader()
                writer.writerow({
                    "fiscal_year": "2023",
                    "residual_total": "3164209",
                    "component": "Issuance of leases",
                    "amount": "3164210",
                    "column": "actual",
                    "source": "deliberately wrong for this test",
                })

            with patch("scripts.production.export_app._ROOT", fixture_root):
                with self.assertRaisesRegex(
                    ValueError, "FY2023 actual residual components sum to"
                ):
                    _export_general_fund_budget_actual_comparison(fixture_root / "web", notes=[])


if __name__ == "__main__":
    unittest.main()
