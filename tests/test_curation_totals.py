"""Regression guard for the FY2002-05 category-total double-count.

Printed "TOTAL <category>" rows in the earliest books are OCR-mangled
("TO TAL PUBLIC SAFETY"). The curation generator used to gate total detection on
a raw ``startswith("TOTAL")``, so the spaced variants fell through and became
phantom ``dept.total*`` children of their own category, doubling that category's
rollup (e.g. opcat.administrative FY2004 rolled to 3,101,068 against a printed
1,550,534). The pipeline's reconciliation gate did NOT catch it: the phantom left
the rollup with no printed direct total to compare against. Hence this test.
"""

import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.curation.gen_departments import _is_total_label, TOTAL_MAP
from scripts.production.labels import normalize_label as n
from scripts.production.schema import create_schema
from tests._build import full_build as shared_build
from scripts.production.ingest import ingest_observations
from scripts.production.dimensions import load_sources, load_coverage, load_dimensions
from scripts.production.canonical import build_canonical, build_rollups

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


class TotalLabelDetectionTests(unittest.TestCase):
    def test_detects_ocr_spaced_totals(self):
        for lbl in ("TOTAL PUBLIC SAFETY", "TO TAL PUBLIC SAFETY",
                    "TO TAL ADM INISTRATIV E", "TO TAL LAW EN FO RCEM ENT SERV ICES",
                    "TO TAL GENERAL FUND EXPENDITURES"):
            self.assertTrue(_is_total_label(lbl), lbl)

    def test_does_not_flag_real_departments(self):
        for lbl in ("Sheriff", "County Administrator", "County Council", "Detention Center"):
            self.assertFalse(_is_total_label(lbl), lbl)

    def test_law_enforcement_services_variant_is_mapped(self):
        # the one total whose normalized key differs from the clean "TOTAL LAW
        # ENFORCEMENT" and so needed an explicit map entry
        self.assertEqual(TOTAL_MAP[n("TOTAL LAW ENFORCEMENT SERVICES")], "opcat.law-enforcement")


class NoPhantomTotalEntityTests(unittest.TestCase):
    def test_committed_entity_csv_has_no_dept_total(self):
        with (DATA / "entity.csv").open(newline="", encoding="utf-8") as f:
            ids = [r["entity_id"] for r in csv.DictReader(f)]
        phantoms = [e for e in ids if e.startswith("dept.total")]
        self.assertEqual(phantoms, [], f"phantom total-as-department entities present: {phantoms}")


class CategoryRollupReconciliationTests(unittest.TestCase):
    def _build(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        shared_build(conn)
        return conn

    def test_admin_category_reconciles_not_doubled(self):
        conn = self._build()
        row = conn.execute(
            "SELECT rolled_up_value, direct_value, reconciles FROM hierarchy_rollup "
            "WHERE entity_id='opcat.administrative' AND fiscal_year=2004 AND status_class='adopted'"
        ).fetchone()
        self.assertIsNotNone(row)
        rolled, direct, reconciles = row
        self.assertEqual(direct, 1550534)
        self.assertEqual(rolled, 1550534)  # was 3,101,068 under the phantom double-count
        self.assertEqual(reconciles, 1)

    def test_all_ten_opcats_reconcile_fy2004_and_fy2005(self):
        conn = self._build()
        opcats = ["administrative", "fiscal", "general-services", "human-resources",
                  "judicial", "law-enforcement", "operating-transfers", "other-services",
                  "public-safety", "public-works"]
        for fy in (2004, 2005):
            for oc in opcats:
                row = conn.execute(
                    "SELECT rolled_up_value, direct_value, reconciles FROM hierarchy_rollup "
                    "WHERE entity_id=? AND fiscal_year=? AND status_class='adopted'",
                    (f"opcat.{oc}", fy)).fetchone()
                self.assertIsNotNone(row, f"opcat.{oc} FY{fy} missing rollup")
                rolled, direct, reconciles = row
                self.assertEqual(reconciles, 1, f"opcat.{oc} FY{fy} does not reconcile")
                self.assertEqual(rolled, direct, f"opcat.{oc} FY{fy} rolled != direct")

    def test_gf_expenditures_new_rollup_tier(self):
        conn = self._build()
        for fy, expected in ((2004, 106182092), (2005, 118463012)):
            rolled = conn.execute(
                "SELECT rolled_up_value FROM hierarchy_rollup "
                "WHERE entity_id='gf.expenditures' AND fiscal_year=? AND status_class='adopted'",
                (fy,)).fetchone()[0]
            self.assertEqual(rolled, expected, f"gf.expenditures FY{fy}")

    def test_no_phantom_total_entities_in_build(self):
        conn = self._build()
        phantoms = conn.execute(
            "SELECT entity_id FROM entity WHERE entity_id LIKE 'dept.total%'").fetchall()
        self.assertEqual(phantoms, [])


if __name__ == "__main__":
    unittest.main()
