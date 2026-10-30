import unittest

from scripts.production.statusclass import status_class_for, distinct_classes


class StatusClassTests(unittest.TestCase):
    def test_enacted_variants_all_adopted(self):
        for s in ("BUDGET", "ADOPTED BUDGET", "APPROVED BUDGET"):
            self.assertEqual(status_class_for(s), "adopted")

    def test_distinct_classes(self):
        self.assertEqual(status_class_for("ACTUAL"), "actual")
        self.assertEqual(status_class_for("PROPOSED BUDGET"), "proposed")
        self.assertEqual(status_class_for("ESTIMATED"), "estimated")
        self.assertEqual(status_class_for("BUDGETED FINANCING"), "financing")
        self.assertEqual(status_class_for("PROJECTION"), "projected")

    def test_unknown_raises(self):
        with self.assertRaises(KeyError):
            status_class_for("MYSTERY")

    def test_distinct_classes_dedup(self):
        classes = {c["status_class"] for c in distinct_classes()}
        self.assertEqual(classes, {"actual", "projected", "adopted", "proposed", "estimated", "financing"})


if __name__ == "__main__":
    unittest.main()
