"""The new levy dataset must reconcile independently of budget appropriations."""
import csv
import json
import tempfile
import unittest
from pathlib import Path
from scripts.property_tax import INPUT, ROOT, build_data, export_property_tax


class PropertyTaxDataTests(unittest.TestCase):
    def test_official_totals_and_ambiguous_recipient_names(self):
        data = build_data()
        rows = {row["code"]: row for row in data["districts"]}
        self.assertEqual(len(rows), 120)
        self.assertEqual(rows["153"]["totalMills"], 346.1)
        self.assertEqual(rows["500"]["cityMills"], 81.4)
        self.assertEqual(rows["696"]["fireName"], "Fountain Inn")
        self.assertEqual(rows["696"]["cityName"], "")
        self.assertEqual(rows["699"]["fireName"], "")
        self.assertEqual(rows["699"]["cityName"], "Fountain Inn")
        self.assertEqual(rows["025"]["schoolName"], "Anderson")
        self.assertEqual(rows["437"]["schoolName"], "Spartanburg")

    def test_bad_total_or_count_fails_before_publishing(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            for path in INPUT.iterdir():
                if path.suffix in (".json", ".csv"):
                    (target / path.name).write_bytes(path.read_bytes())
            path = target / "millage-2025.csv"
            original = path.read_text()
            path.write_text(original.replace("286.4,1", "286.5,1", 1))
            with self.assertRaisesRegex(ValueError, "Printed total"):
                build_data(target)
            path.write_text("\n".join(original.splitlines()[:-1]) + "\n")
            with self.assertRaisesRegex(ValueError, "count"):
                build_data(target)

    def test_committed_export_matches_curated_source_and_download(self):
        with tempfile.TemporaryDirectory() as temp:
            for output in export_property_tax(Path(temp)):
                committed = ROOT / "web" / output.relative_to(temp)
                self.assertEqual(committed.read_bytes(), output.read_bytes(), str(committed))
            download = Path(temp) / "public/downloads/property-tax/millage-2025.csv"
            with download.open(newline="") as handle:
                rows = {r["code"]: r for r in csv.DictReader(handle)}
            self.assertEqual(rows["025"]["schoolOperationsMills"], "")
            self.assertEqual(rows["500"]["schoolOperationsMills"], "141.2")
            self.assertEqual(rows["500"]["componentSourcePage"], "4")
            self.assertEqual(rows["500"]["countyOperationsMills"], "47.3")
            self.assertTrue(rows["005"]["sourceUrl"].endswith("millage_2025.pdf"))


if __name__ == "__main__":
    unittest.main()
