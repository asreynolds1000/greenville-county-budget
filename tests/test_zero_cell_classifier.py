import tempfile
import unittest
from pathlib import Path

from scripts.curation.classify_zero_cells import (
    FIELDNAMES,
    fixed_width_forms,
    merge_rows,
    reviewed_forms,
    write_rows,
    zero_observations,
)
from tests._sources import require_source_corpus


class ZeroCellClassifierTests(unittest.TestCase):
    def test_inventory_is_the_exact_ingested_zero_set(self):
        rows = zero_observations()
        self.assertEqual(804, len(rows))
        self.assertEqual(len(rows), len({row["observation_id"] for row in rows}))
        self.assertEqual({0}, {row["value"] for row in rows})

    def test_ordinal_echo_rejects_a_shifted_sidecar(self):
        observation = zero_observations()[0]
        existing = {
            str(observation["observation_id"]): {
                **{field: "" for field in FIELDNAMES},
                "observation_id": str(observation["observation_id"]),
                "source_dataset": str(observation["source_dataset"]),
                "source_row_ordinal": str(int(observation["source_row_ordinal"]) + 1),
                "echo_fiscal_year": str(observation["fiscal_year"]),
                "echo_original_label": str(observation["original_label"]),
                "echo_value": "0",
            }
        }
        with self.assertRaisesRegex(ValueError, "sidecar echo mismatch"):
            merge_rows([observation], {}, existing)

    def test_writer_is_deterministic(self):
        observation = zero_observations()[0]
        rows = merge_rows([observation], {}, {})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "forms.csv"
            write_rows(path, rows)
            first = path.read_bytes()
            write_rows(path, rows)
            self.assertEqual(first, path.read_bytes())

    def test_human_review_rules_are_exact_set_gates(self):
        observations = zero_observations()
        forms = reviewed_forms(observations)
        self.assertEqual(239, len(forms))
        self.assertEqual(
            {"-": 237, "--": 2},
            {
                form: sum(review[0] == form for review in forms.values())
                for form in {review[0] for review in forms.values()}
            },
        )


class ZeroCellSourceClassifierTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        require_source_corpus([
            "data/raw/gc-fy2012-2013/budget_combined2012.pdf",
            "data/raw/gc-fy2026/BudgetCombined.pdf",
            "data/raw/gc-fy2027/BudgetCombined.pdf",
        ])

    def test_fixed_width_route_classifies_every_text_backed_summary_zero(self):
        observations = zero_observations()
        forms = fixed_width_forms()
        self.assertEqual(656, len(forms))
        rows = merge_rows(observations, forms, {}, reviewed_forms(observations))
        classified = [row for row in rows if row["classification_method"] == "fixed_width_token"]
        self.assertEqual(565, len(classified))
        self.assertEqual({"-"}, {row["printed_form"] for row in classified})
        self.assertTrue(all(row["review_status"] for row in rows))


if __name__ == "__main__":
    unittest.main()
