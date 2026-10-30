import sqlite3
import unittest

from scripts.production.schema import create_schema, TABLES


class SchemaTests(unittest.TestCase):
    def test_creates_all_tables(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        names = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        for t in TABLES:
            self.assertIn(t, names)

    def test_observation_pk_enforced(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        conn.execute(
            "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,"
            "status,status_class,original_label,source_code,source_dataset,source_row_ordinal) "
            "VALUES('a',2026,1,'dollars','BUDGET','adopted','x','FY','wb',0)")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,"
                "status,status_class,original_label,source_code,source_dataset,source_row_ordinal) "
                "VALUES('a',2026,2,'dollars','BUDGET','adopted','x','FY','wb',1)")

    def test_printed_form_is_controlled_on_observations_and_canonical_values(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        observation_columns = {row[1] for row in conn.execute("PRAGMA table_info(observation)")}
        canonical_columns = {row[1] for row in conn.execute("PRAGMA table_info(canonical_value)")}
        self.assertIn("printed_form", observation_columns)
        self.assertIn("printed_form_review_status", observation_columns)
        self.assertIn("printed_form", canonical_columns)

    def test_label_map_supports_category_scope(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(label_map)")}
        self.assertIn("raw_operating_category", columns)

    def test_statement_instance_can_select_source_status(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(statement_instance)")}
        self.assertIn("status_class", columns)

    def test_interpretation_foreign_keys_are_enforced(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO label_map(original_label,match_scope,entity_id,review_status) "
                "VALUES('missing','label','no-such-entity','human_confirmed')")

    def test_relationship_contract_rejects_unproven_exact_flow(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        conn.executescript(
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES"
            "('a','revenue_source','A'),('b','fund','B');"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO entity_relationship"
                "(relationship_id,from_entity_id,to_entity_id,relationship_type,"
                "traceability_level,is_additive) VALUES(?,?,?,?,?,?)",
                ("r", "a", "b", "inflow_to", "exact", 0),
            )

    def test_non_contains_relationship_cannot_be_additive(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        conn.executescript(
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES"
            "('a','revenue_source','A'),('b','fund','B');"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO entity_relationship"
                "(relationship_id,from_entity_id,to_entity_id,relationship_type,"
                "traceability_level,is_additive) VALUES(?,?,?,?,?,?)",
                ("r", "a", "b", "inflow_to", "structural", 1),
            )


if __name__ == "__main__":
    unittest.main()
