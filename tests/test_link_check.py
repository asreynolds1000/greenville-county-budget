"""Negative tests keep the publication link gate from silently passing a broken export."""

import tempfile
import unittest
from pathlib import Path

from scripts.check_links import check


class LinkCheckTests(unittest.TestCase):
    def test_missing_export_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "No exported HTML"):
                check(Path(directory), "https://example.test")

    def test_pages_downloads_fragments_and_encoded_attributes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "detail").mkdir()
            (root / "detail/index.html").write_text('<h1 id="budget&amp;actual">Budget</h1>')
            (root / "data.csv").write_text("year,value\n2026,1\n")
            (root / "index.html").write_text(
                '<a href="/detail/#budget%26actual">Detail</a>'
                '<a href="/data.csv?download=1">CSV</a>'
                '<a href="mailto:a@example.test">Contact</a>'
                '<a href="https://county.example/source.pdf">Source</a>'
            )
            self.assertEqual(check(root, "https://example.test"), (2, 2, []))
            (root / "data.csv").unlink()
            self.assertIn("missing file for /data.csv", check(root, "https://example.test")[2][0])
            (root / "detail/index.html").write_text('<h1 id="different">Budget</h1>')
            self.assertEqual(len(check(root, "https://example.test")[2]), 2)
            (root / "detail/index.html").unlink()
            self.assertEqual(len(check(root, "https://example.test")[2]), 2)


if __name__ == "__main__":
    unittest.main()
