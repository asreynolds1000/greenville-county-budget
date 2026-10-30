import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.production.schema import create_schema, TABLES
from tests._build import full_build as shared_build
from scripts.production.ingest import ingest_observations
from scripts.production.dimensions import load_sources, load_coverage, load_dimensions
from scripts.production.canonical import build_canonical, build_rollups
from scripts.production.materialize import materialize

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


def full_build():
    return shared_build()


class MaterializeTests(unittest.TestCase):
    def test_artifacts_written_and_bundle_reconciles(self):
        conn = full_build()
        self.addCleanup(conn.close)
        with tempfile.TemporaryDirectory() as tmp:
            dist = Path(tmp)
            materialize(conn, dist)

            db = dist / "gc_budget.sqlite"
            self.assertTrue(db.exists())
            out = sqlite3.connect(db)
            self.addCleanup(out.close)
            self.assertGreater(out.execute("SELECT COUNT(*) FROM canonical_value").fetchone()[0], 0)

            bundle = dist / "bundles" / "whole-budget-2026.json"
            self.assertTrue(bundle.exists())
            tree = json.loads(bundle.read_text())
            root_value = tree["root"]["value"]
            children_sum = sum(c["value"] for c in tree["root"]["children"])
            self.assertEqual(root_value, children_sum)  # four funds sum to TOTAL BUDGET
            reported_total = conn.execute(
                "SELECT value FROM observation WHERE source_dataset='whole-budget-major-funds' "
                "AND raw_fund_type='Whole Budget' AND fiscal_year=2026").fetchone()[0]
            self.assertEqual(root_value, reported_total)
            general = next(c for c in tree["root"]["children"]
                           if c["entity_id"] == "fund.general")
            self.assertEqual(general["children"], [])  # not an additive child hierarchy
            detail = general["related_views"]
            self.assertEqual(len(detail), 1)
            self.assertEqual(detail[0]["relationship"], "detail_view")
            self.assertEqual(detail[0]["root"]["entity_id"], "gf.expenditures")
            self.assertGreater(len(detail[0]["root"]["children"]), 0)

            dd = (dist / "data-dictionary.md").read_text()
            for table in TABLES:
                self.assertIn(f"`{table}`", dd)
            self.assertTrue((dist / "corrections-log.md").exists())


if __name__ == "__main__":
    unittest.main()
