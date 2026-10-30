import sqlite3
import unittest

from scripts.production.schema import create_schema
from scripts.production.canonical import build_canonical, build_rollups


def seed(conn):
    create_schema(conn)
    conn.executescript(
        "INSERT INTO source(source_code,publication_order) VALUES('EARLY',1),('LATE',2),('TIE_A',3),('TIE_B',3);"
        "INSERT INTO status_class(status_class) VALUES('adopted');"
        "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES('e','department','E');"
        "INSERT INTO label_map(original_label,match_scope,entity_id,review_status) VALUES('E','label','e','human_confirmed');"
        "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,status,status_class,original_label,source_code,source_dataset,source_row_ordinal) VALUES"
        "('o1',2010,100,'dollars','ADOPTED BUDGET','adopted','E','EARLY','d',0),"
        "('o2',2010,150,'dollars','ADOPTED BUDGET','adopted','E','LATE','d',1),"
        "('c1',2012,300,'dollars','ADOPTED BUDGET','adopted','E','EARLY','d',2),"
        "('c2',2012,300,'dollars','ADOPTED BUDGET','adopted','E','LATE','d',3),"
        "('t1',2011,200,'dollars','ADOPTED BUDGET','adopted','E','TIE_A','d',4),"
        "('t2',2011,210,'dollars','ADOPTED BUDGET','adopted','E','TIE_B','d',5);"
    )


class CanonicalTests(unittest.TestCase):
    def test_chosen_observation_carries_its_printed_form(self):
        conn = sqlite3.connect(":memory:")
        create_schema(conn)
        self.addCleanup(conn.close)
        conn.executescript(
            "INSERT INTO source(source_code,publication_order) VALUES('B1',1);"
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES('e','department','E');"
            "INSERT INTO label_map(original_label,match_scope,entity_id,review_status) "
            "VALUES('E','label','e','human_confirmed');"
            "INSERT INTO observation(observation_id,fiscal_year,value,printed_form,"
            "printed_form_review_status,measure_type,status,status_class,original_label,"
            "source_code,source_dataset,source_row_ordinal) VALUES"
            "('z',2020,0,'-','human_confirmed','dollars','BUDGET','adopted','E','B1','d',0);"
        )
        build_canonical(conn)
        self.assertEqual(
            conn.execute(
                "SELECT value,printed_form,chosen_observation_id FROM canonical_value"
            ).fetchone(),
            (0, "-", "z"),
        )

    def test_resolved_latest_wins(self):
        conn = sqlite3.connect(":memory:"); seed(conn); build_canonical(conn)
        self.addCleanup(conn.close)
        self.assertEqual(
            conn.execute("SELECT value,canonical_status,chosen_observation_id FROM canonical_value WHERE fiscal_year=2010").fetchone(),
            (150, "resolved", "o2"))
        self.assertIn(("o1",),
            conn.execute("SELECT observation_id FROM canonical_alternative WHERE fiscal_year=2010").fetchall())

    def test_corroboration_not_alternative(self):
        conn = sqlite3.connect(":memory:"); seed(conn); build_canonical(conn)
        self.addCleanup(conn.close)
        row = conn.execute("SELECT value,canonical_status,corroborating_source_codes FROM canonical_value WHERE fiscal_year=2012").fetchone()
        self.assertEqual(row[0], 300)
        self.assertEqual(row[1], "single")
        self.assertEqual(row[2], "EARLY")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM canonical_alternative WHERE fiscal_year=2012").fetchone()[0], 0)

    def test_tie_disputed_null(self):
        conn = sqlite3.connect(":memory:"); seed(conn); build_canonical(conn)
        self.addCleanup(conn.close)
        row = conn.execute("SELECT value,canonical_status FROM canonical_value WHERE fiscal_year=2011").fetchone()
        self.assertEqual(row[1], "disputed")
        self.assertIsNone(row[0])
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM canonical_alternative WHERE fiscal_year=2011").fetchone()[0], 2)

    def test_same_source_corroboration_is_none(self):
        conn = sqlite3.connect(":memory:"); create_schema(conn)
        self.addCleanup(conn.close)
        conn.executescript(
            "INSERT INTO source(source_code,publication_order) VALUES('B1',1);"
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES('e','fund_type','E');"
            "INSERT INTO label_map(original_label,match_scope,entity_id,review_status) VALUES('X','label','e','human_confirmed');"
            "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,status,status_class,original_label,source_code,source_dataset,source_row_ordinal) VALUES"
            "('a',2010,50,'dollars','ADOPTED BUDGET','adopted','X','B1','d1',0),"
            "('b',2010,50,'dollars','ADOPTED BUDGET','adopted','X','B1','d2',0);"
        )
        build_canonical(conn)
        row = conn.execute("SELECT value,canonical_status,corroborating_source_codes FROM canonical_value WHERE fiscal_year=2010").fetchone()
        self.assertEqual(row[0], 50)
        self.assertEqual(row[1], "single")
        self.assertIsNone(row[2])  # same source book is not cross-source corroboration


def seed_rollup(conn, parent_total):
    create_schema(conn)
    conn.executescript(
        "INSERT INTO status_class(status_class) VALUES('adopted');"
        "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES"
        "('P','fund_type','P'),('A','department','A'),('B','department','B');"
        "INSERT INTO hierarchy_edge(parent_entity_id,child_entity_id,relationship) VALUES"
        "('P','A','contains'),('P','B','contains');"
        "INSERT INTO canonical_value(entity_id,fiscal_year,status_class,measure_type,value,canonical_status) VALUES"
        "('A',2020,'adopted','dollars',100,'single'),"
        "('B',2020,'adopted','dollars',150,'single'),"
        f"('P',2020,'adopted','dollars',{parent_total},'single');"
    )


class RollupTests(unittest.TestCase):
    def test_rollup_reconciles(self):
        conn = sqlite3.connect(":memory:"); seed_rollup(conn, 250); build_rollups(conn)
        self.addCleanup(conn.close)
        row = conn.execute("SELECT rolled_up_value,direct_value,reconciles FROM hierarchy_rollup WHERE entity_id='P'").fetchone()
        self.assertEqual(row, (250, 250, 1))

    def test_rollup_mismatch_noted(self):
        conn = sqlite3.connect(":memory:"); seed_rollup(conn, 240); build_rollups(conn)
        self.addCleanup(conn.close)
        row = conn.execute("SELECT rolled_up_value,reconciles,reconciliation_note FROM hierarchy_rollup WHERE entity_id='P'").fetchone()
        self.assertEqual(row[0], 250)
        self.assertEqual(row[1], 0)
        self.assertIn("!= reported", row[2])

    def test_partial_rollup_noted(self):
        conn = sqlite3.connect(":memory:"); create_schema(conn)
        self.addCleanup(conn.close)
        conn.executescript(
            "INSERT INTO status_class(status_class) VALUES('adopted');"
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES"
            "('P','fund_type','P'),('A','department','A'),('B','department','B');"
            "INSERT INTO hierarchy_edge(parent_entity_id,child_entity_id,relationship) VALUES"
            "('P','A','contains'),('P','B','contains');"
            "INSERT INTO canonical_value(entity_id,fiscal_year,status_class,measure_type,value,canonical_status) VALUES"
            "('A',2020,'adopted','dollars',100,'single'),"
            "('P',2020,'adopted','dollars',250,'single');"
        )
        build_rollups(conn)
        note = conn.execute("SELECT reconciliation_note FROM hierarchy_rollup WHERE entity_id='P'").fetchone()[0]
        self.assertIn("partial coverage", note)


if __name__ == "__main__":
    unittest.main()
