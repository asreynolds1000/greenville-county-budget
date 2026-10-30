import unittest

from scripts.production.labels import normalize_label, cluster_labels


class LabelTests(unittest.TestCase):
    def test_repairs_ocr_letter_splits(self):
        self.assertEqual(normalize_label("COUNTY A DMINISTRA TOR"),
                         normalize_label("County Administrator"))

    def test_distinct_stay_distinct(self):
        self.assertNotEqual(normalize_label("County Attorney"),
                            normalize_label("County Auditor"))

    def test_strips_asterisk(self):
        self.assertEqual(normalize_label("Infrastructure Bank*"),
                         normalize_label("Infrastructure Bank"))


class ClusterTests(unittest.TestCase):
    def test_ocr_variants_cluster_together(self):
        rows = [
            {"source_dataset": "general-fund-department-appropriations", "original_label": "COUNTY A DMINISTRA TOR"},
            {"source_dataset": "general-fund-department-appropriations", "original_label": "County Administrator"},
            {"source_dataset": "general-fund-department-appropriations", "original_label": "County Attorney"},
        ]
        entities, label_maps = cluster_labels(rows)
        # two distinct entities: administrator (2 label variants) and attorney
        self.assertEqual(len(entities), 2)
        admin = [lm for lm in label_maps if "DMINISTRA" in lm["original_label"] or lm["original_label"] == "County Administrator"]
        self.assertEqual(len({lm["entity_id"] for lm in admin}), 1)
        self.assertTrue(all(lm["review_status"] == "machine_candidate" for lm in label_maps))


if __name__ == "__main__":
    unittest.main()
