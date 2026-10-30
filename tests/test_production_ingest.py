import sqlite3
import unittest
from pathlib import Path

from scripts.production.schema import create_schema
from scripts.production.ingest import observation_id, normalize_row, ingest_observations

BLIND = Path(__file__).resolve().parents[1] / "audit" / "blind-extraction"
DATA = Path(__file__).resolve().parents[1] / "data" / "production"
RECOVERED = Path(__file__).resolve().parents[1] / "data" / "recovered"

RAW = {
    "source_code": "FY2004-05", "pdf_page": "1",
    "table_section": "Budget Expenditure Overview",
    "original_label": "TOTAL GENERAL FUND BUDGET", "fiscal_year": "2002",
    "status": "BUDGET", "value": "97324492", "source_url": "http://x",
    "printed_page": "21",
}


class IngestIdTests(unittest.TestCase):
    def test_id_deterministic_by_dataset_and_ordinal(self):
        self.assertEqual(observation_id("wb", 5), observation_id("wb", 5))
        self.assertNotEqual(observation_id("wb", 5), observation_id("wb", 6))
        self.assertNotEqual(observation_id("wb", 5), observation_id("gf", 5))

    def test_normalize(self):
        row = normalize_row(RAW, "whole-budget-major-funds", 0)
        self.assertEqual(row["value"], 97324492)
        self.assertEqual(row["status_class"], "adopted")
        self.assertEqual(row["measure_type"], "dollars")
        self.assertEqual(row["source_dataset"], "whole-budget-major-funds")
        self.assertEqual(row["source_row_ordinal"], 0)
        self.assertEqual(row["pdf_page"], 1)
        self.assertEqual(row["observation_id"], observation_id("whole-budget-major-funds", 0))


class FullIngestTests(unittest.TestCase):
    def test_printed_form_sidecar_attaches_to_exact_zero_observations(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(
            conn,
            BLIND,
            recovery_dir=RECOVERED,
            extended_dir=DATA / "observations",
            printed_forms_path=DATA / "printed_cell_forms.csv",
        )
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM observation WHERE value=0 AND printed_form IS NOT NULL "
                "AND printed_form_review_status IS NOT NULL"
            ).fetchone()[0],
            773,
        )
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM observation WHERE value<>0 AND printed_form IS NOT NULL"
            ).fetchone()[0],
            0,
        )

    def test_all_primary_rows_kept_and_conflicts_added(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        rep = ingest_observations(conn, BLIND)
        self.assertEqual(rep.primary_count, 2393)
        self.assertGreater(rep.conflict_added, 0)
        self.assertEqual(rep.duplicate_ids, [])
        # the earlier-book Fleet Management alternate value must be present somewhere
        got = conn.execute(
            "SELECT COUNT(*) FROM observation WHERE original_label LIKE '%Fleet Management%' AND value=4464282"
        ).fetchone()[0]
        self.assertGreaterEqual(got, 1)

    def test_idempotent(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        total1 = conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0]
        ingest_observations(conn, BLIND)
        total2 = conn.execute("SELECT COUNT(*) FROM observation").fetchone()[0]
        self.assertEqual(total1, total2)

    def test_provenance_complete(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        missing = conn.execute(
            "SELECT COUNT(*) FROM observation WHERE source_url IS NULL OR pdf_page IS NULL"
        ).fetchone()[0]
        self.assertEqual(missing, 0)


if __name__ == "__main__":
    unittest.main()
