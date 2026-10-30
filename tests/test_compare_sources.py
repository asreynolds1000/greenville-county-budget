import unittest

from scripts.compare_sources import compare_observation, normalized_label, normalized_status


class CompareSourcesTests(unittest.TestCase):
    def test_label_normalization_handles_source_variants(self):
        self.assertEqual(normalized_label("Road Paving *"), normalized_label("Road Program"))
        self.assertEqual(normalized_label("Elected & Appointed Offices/ Jucicial"), normalized_label("Elected & Appointed Offices/Judicial"))
        self.assertEqual(normalized_label("Elected & Appointed Offices/Law Enforcemen"), normalized_label("Elected & Appointed Offices/Law Enforcement"))
        self.assertEqual(normalized_label("Department of Planning and Development"), "planningdevelopment")

    def test_canonical_match_takes_precedence(self):
        canonical = [{"value": 10, "status": "ADOPTED BUDGET"}]
        alternate = [{"value": 9, "status": "PROPOSED BUDGET"}]
        row = compare_observation(dataset="x", row_key="2026", fiscal_year=2026, field="amount", stored_value=10, canonical=canonical, alternates=alternate)
        self.assertEqual(row["classification"], "verified_canonical")

    def test_official_alternate_is_not_treated_as_canonical(self):
        canonical = [{"value": 10, "status": "ADOPTED BUDGET"}]
        alternate = [{"value": 9, "status": "PROPOSED BUDGET"}]
        row = compare_observation(dataset="x", row_key="2026", fiscal_year=2026, field="amount", stored_value=9, canonical=canonical, alternates=alternate)
        self.assertEqual(row["classification"], "official_alternate_only")

    def test_status_normalization_matches_budget_forms(self):
        self.assertEqual(normalized_status("BUDGET"), normalized_status("budget"))
        self.assertEqual(normalized_status("PROJECTED"), normalized_status("projected"))


if __name__ == "__main__":
    unittest.main()
