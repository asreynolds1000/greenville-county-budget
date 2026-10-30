"""restore_sources keeps only bytes that match the committed manifest, and never edits it."""
import hashlib
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path

from scripts import restore_sources

GOOD = b"%PDF-1.4 the county's document"
BAD = b"%PDF-1.4 a revised document"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class RestoreSourcesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.manifest_path = self.tmp / "manifest.json"
        self.manifest_bytes = json.dumps({"files": [
            {"filename": "a.pdf", "sha256": sha(GOOD), "official_url": "https://county.example/a.pdf"},
        ]}).encode()
        self.manifest_path.write_bytes(self.manifest_bytes)
        self.manifests = [{"name": "ACFRs", "path": self.manifest_path, "local_root": self.tmp / "raw",
                           "path_key": "filename", "url_key": "official_url"}]
        self.archive = {("ACFRs", "a.pdf"): "https://web.archive.org/web/2024id_/https://county.example/a.pdf"}

    def fetcher(self, responses):
        calls = []

        def fetch(url, dest):
            calls.append(url)
            body = responses[url]
            if isinstance(body, Exception):
                raise body
            dest.write_bytes(body)
        return fetch, calls

    def test_restores_a_missing_file_whose_hash_matches(self):
        fetch, _ = self.fetcher({"https://county.example/a.pdf": GOOD})
        report = restore_sources.restore(self.manifests, {}, fetch)
        self.assertEqual(report["restored"], ["a.pdf"])
        self.assertEqual((self.tmp / "raw" / "a.pdf").read_bytes(), GOOD)

    def test_rejects_bytes_that_differ_from_the_manifest(self):
        fetch, _ = self.fetcher({"https://county.example/a.pdf": BAD})
        report = restore_sources.restore(self.manifests, {}, fetch)
        self.assertEqual([f["file"] for f in report["failed"]], ["a.pdf"])
        self.assertFalse((self.tmp / "raw" / "a.pdf").exists())
        self.assertFalse((self.tmp / "raw" / "a.pdf.part").exists())

    def test_falls_back_to_the_archive_capture(self):
        fetch, calls = self.fetcher({
            "https://county.example/a.pdf": urllib.error.URLError("404"),
            self.archive[("ACFRs", "a.pdf")]: GOOD,
        })
        report = restore_sources.restore(self.manifests, self.archive, fetch)
        self.assertEqual(report["restored"], ["a.pdf"])
        self.assertEqual(len(calls), 2)

    def test_prefers_a_changed_official_copy_never(self):
        fetch, _ = self.fetcher({
            "https://county.example/a.pdf": BAD,
            self.archive[("ACFRs", "a.pdf")]: GOOD,
        })
        report = restore_sources.restore(self.manifests, self.archive, fetch)
        self.assertEqual(report["restored"], ["a.pdf"])
        self.assertEqual((self.tmp / "raw" / "a.pdf").read_bytes(), GOOD)

    def test_check_mode_fails_on_absence_without_network(self):
        def no_network(url, dest):
            raise AssertionError("check mode must not fetch")
        report = restore_sources.restore(self.manifests, self.archive, no_network, check_only=True)
        self.assertEqual(report["failed"][0]["reasons"], ["absent"])

    def test_never_writes_the_manifest(self):
        fetch, _ = self.fetcher({"https://county.example/a.pdf": BAD,
                                 self.archive[("ACFRs", "a.pdf")]: BAD})
        restore_sources.restore(self.manifests, self.archive, fetch)
        self.assertEqual(self.manifest_path.read_bytes(), self.manifest_bytes)


if __name__ == "__main__":
    unittest.main()
