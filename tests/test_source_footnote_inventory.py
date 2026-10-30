import unittest

from scripts.curation.inventory_source_footnotes import (
    assert_settled_counts,
    inventory,
    markers_in_label,
)


class SourceFootnoteInventoryTests(unittest.TestCase):
    def test_production_inventory_matches_the_settled_complete_read_set(self):
        rows, occurrence_count = inventory()
        assert_settled_counts(rows)

        self.assertEqual(occurrence_count, 105)
        self.assertEqual({row["marker"] for row in rows}, {"*", "**"})
        self.assertEqual(len(rows), 39)

    def test_marker_detection_does_not_only_know_about_single_stars(self):
        self.assertEqual(markers_in_label("Human Resources **"), ("**",))
        self.assertEqual(markers_in_label("A future label †"), ("†",))
        self.assertEqual(markers_in_label("Another future label ‡²"), ("‡", "²"))


if __name__ == "__main__":
    unittest.main()
