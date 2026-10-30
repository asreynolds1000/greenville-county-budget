import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.production.schema import create_schema
from scripts.production.ingest import ingest_observations
from scripts.production.dimensions import (
    load_sources, load_coverage, load_dimensions, _load_entity_presentation,
)
from scripts.production.dimensions import CONFIRMED_MATCH_SQL

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


class DimensionTests(unittest.TestCase):
    def test_sources_grouped_and_ordered(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        total, distinct = conn.execute(
            "SELECT COUNT(*), COUNT(DISTINCT source_code) FROM source").fetchone()
        self.assertEqual(total, distinct)
        # 12 budget-book codes, 5 ACFR sources in the frozen registry, and 10 more ACFR
        # sources for the audited years modelled after the registry was frozen.
        self.assertEqual(total, 27)
        codes = {r[0] for r in conn.execute("SELECT source_code FROM source")}
        self.assertNotIn("INDEX", codes)
        self.assertEqual(
            conn.execute("SELECT publication_order FROM source WHERE source_code='FY2004-05'").fetchone()[0],
            2004)
        self.assertEqual(
            conn.execute("SELECT publication_order FROM source WHERE source_code='FY2026'").fetchone()[0],
            2026)
        self.assertEqual(
            conn.execute("SELECT publication_order FROM source WHERE source_code='FY2025-ACFR'").fetchone()[0],
            2025)

    def test_coverage_marks_fy2022_23_gap(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        load_coverage(conn, BLIND / "coverage-by-fiscal-year.csv")
        gap = conn.execute(
            "SELECT has_detail, gap_note FROM coverage WHERE fiscal_year=2022 "
            "AND dataset='general-fund-department-appropriations'").fetchone()
        self.assertEqual(gap[0], 0)
        self.assertIsNotNone(gap[1])
        # a year with detail is marked present
        ok = conn.execute(
            "SELECT has_detail FROM coverage WHERE fiscal_year=2020 "
            "AND dataset='general-fund-department-appropriations'").fetchone()[0]
        self.assertEqual(ok, 1)

    def test_confirmed_load_and_unmapped_reported(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            rep = load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
            self.assertTrue((Path(tmp) / "reports" / "unmapped-labels.csv").exists())
        self.assertGreater(len(rep.confirmed_label_maps), 0)
        self.assertGreater(rep.unmapped_count, 0)  # full-depth curation still incomplete
        dangling = conn.execute(
            "SELECT COUNT(*) FROM label_map lm LEFT JOIN entity e ON lm.entity_id=e.entity_id "
            "WHERE e.entity_id IS NULL").fetchone()[0]
        self.assertEqual(dangling, 0)
        # the fund-type totals are mapped, so every year's TOTAL GENERAL FUND BUDGET resolves
        gf_mapped = conn.execute("""
            SELECT COUNT(*) FROM observation o JOIN label_map lm
            ON lm.original_label=o.original_label AND lm.match_scope='label'
            WHERE lm.entity_id='fund.general'
        """).fetchone()[0]
        self.assertGreaterEqual(gf_mapped, 25)

    def test_department_mapping_does_not_capture_parallel_overview(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
        mapped = conn.execute("""
            SELECT DISTINCT o.source_dataset
            FROM observation o JOIN label_map lm ON lm.original_label=o.original_label
            WHERE lm.entity_id='dept.humanresources'
              AND (lm.match_scope='label'
                   OR (lm.match_scope='label+section' AND lm.table_section IS o.table_section)
                   OR (lm.match_scope='label+section+category'
                       AND lm.table_section IS o.table_section
                       AND lm.raw_operating_category IS o.raw_operating_category))
        """).fetchall()
        self.assertEqual(mapped, [("general-fund-department-appropriations",)])

    def test_every_entity_gets_controlled_accounting_semantics(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
        entities = conn.execute("SELECT COUNT(*) FROM entity").fetchone()[0]
        classified = conn.execute("SELECT COUNT(*) FROM entity_accounting").fetchone()[0]
        self.assertEqual(classified, entities)
        self.assertEqual(
            conn.execute(
                "SELECT included_in_scope_total FROM entity_accounting "
                "WHERE entity_id='fund.internal-service'"
            ).fetchone()[0],
            "no",
        )
        self.assertEqual(
            conn.execute(
                "SELECT accounting_role,value_semantics FROM entity_accounting "
                "WHERE entity_id='rev.property-taxes'"
            ).fetchone(),
            ("revenue", "flow"),
        )

    def test_legacy_hierarchy_is_losslessly_migrated(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
        legacy = conn.execute("SELECT COUNT(*) FROM hierarchy_edge").fetchone()[0]
        migrated = conn.execute(
            "SELECT COUNT(*) FROM entity_relationship WHERE relationship_id LIKE 'hierarchy.%'"
        ).fetchone()[0]
        self.assertEqual(migrated, legacy)
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM entity_relationship "
                "WHERE relationship_id LIKE 'hierarchy.%' "
                "AND relationship_type='contains' AND "
                "(traceability_level<>'structural' OR is_additive<>1)"
            ).fetchone()[0],
            0,
        )

    def test_general_fund_balance_and_financing_rows_all_map_once(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
        unmapped = conn.execute(
            f"SELECT COUNT(*) FROM observation o "
            f"WHERE o.source_dataset='general-fund-balances-and-financing' "
            f"AND NOT EXISTS (SELECT 1 FROM label_map lm WHERE {CONFIRMED_MATCH_SQL})"
        ).fetchone()[0]
        ambiguous = conn.execute(
            f"SELECT COUNT(*) FROM (SELECT o.observation_id FROM observation o "
            f"JOIN label_map lm ON {CONFIRMED_MATCH_SQL} "
            f"WHERE o.source_dataset='general-fund-balances-and-financing' "
            f"GROUP BY o.observation_id HAVING COUNT(DISTINCT lm.entity_id) <> 1)"
        ).fetchone()[0]
        self.assertEqual(unmapped, 0)
        self.assertEqual(ambiguous, 0)
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM statement_instance").fetchone()[0],
            # 117 before the audited position statement was extended from 5 modelled years
            # to all 15 (+10), gf.balance-composition added 15, and the five Special
            # Revenue statements added 74 instances, the four Debt Service statements
            # another 68, and Enterprise funding/outflow add 50 source-and-status-
            # controlled instances. Source exceptions retain exact printed deltas.
            334,
        )
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM entity_relationship "
                "WHERE relationship_type='detail_view' AND is_additive<>0"
            ).fetchone()[0],
            0,
        )

    def test_recent_fund_summary_rows_all_map_once(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(
            conn,
            BLIND,
            recovery_dir=DATA.parent / "recovered",
            extended_dir=DATA / "observations",
        )
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")
        for dataset in (
            "special-revenue-summary", "debt-service-summary", "enterprise-summary",
        ):
            unmapped = conn.execute(
                f"SELECT COUNT(*) FROM observation o "
                f"WHERE o.source_dataset=? "
                f"AND NOT EXISTS (SELECT 1 FROM label_map lm WHERE {CONFIRMED_MATCH_SQL})",
                (dataset,),
            ).fetchone()[0]
            ambiguous = conn.execute(
                f"SELECT COUNT(*) FROM (SELECT o.observation_id FROM observation o "
                f"JOIN label_map lm ON {CONFIRMED_MATCH_SQL} "
                f"WHERE o.source_dataset=? "
                f"GROUP BY o.observation_id HAVING COUNT(DISTINCT lm.entity_id) <> 1)",
                (dataset,),
            ).fetchone()[0]
            self.assertEqual(unmapped, 0, dataset)
            self.assertEqual(ambiguous, 0, dataset)

    def test_general_fund_operating_overview_maps_as_separate_statement(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")

        unmapped = conn.execute(
            f"SELECT COUNT(*) FROM observation o "
            f"WHERE o.source_dataset='general-fund-operating-categories-and-transfers' "
            f"AND NOT EXISTS (SELECT 1 FROM label_map lm WHERE {CONFIRMED_MATCH_SQL})"
        ).fetchone()[0]
        ambiguous = conn.execute(
            f"SELECT COUNT(*) FROM (SELECT o.observation_id FROM observation o "
            f"JOIN label_map lm ON {CONFIRMED_MATCH_SQL} "
            f"WHERE o.source_dataset='general-fund-operating-categories-and-transfers' "
            f"GROUP BY o.observation_id HAVING COUNT(DISTINCT lm.entity_id) <> 1)"
        ).fetchone()[0]
        self.assertEqual(unmapped, 0)
        self.assertEqual(ambiguous, 0)
        self.assertEqual(
            conn.execute(
                "SELECT COUNT(*) FROM statement_instance "
                "WHERE statement_id='gf.operating-overview'"
            ).fetchone()[0],
            25,
        )

    def test_reorganization_edges_follow_printed_department_sections(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        ingest_observations(conn, BLIND)
        load_sources(
            conn,
            BLIND / "official-source-registry.csv",
            extension_path=DATA / "source_registry_extension.csv",
        )
        with tempfile.TemporaryDirectory() as tmp:
            load_dimensions(conn, DATA, BLIND, Path(tmp) / "reports")

        for department in ("dept.propertymanagement", "dept.animalcareservices"):
            for fiscal_year, expected_parent in (
                (2013, "opcat.public-works"),
                (2014, "opcat.community-development-planning"),
                (2024, "opcat.public-works"),
            ):
                parents = conn.execute(
                    "SELECT parent_entity_id FROM hierarchy_edge "
                    "WHERE child_entity_id=? "
                    "AND (effective_from_fy IS NULL OR effective_from_fy<=?) "
                    "AND (effective_to_fy IS NULL OR effective_to_fy>=?)",
                    (department, fiscal_year, fiscal_year),
                ).fetchall()
                self.assertEqual(parents, [(expected_parent,)], msg=(department, fiscal_year))


if __name__ == "__main__":
    unittest.main()


class EntityPresentationTests(unittest.TestCase):
    """The curated display-name layer (plan Step 6, cold review finding R5).

    The county prints most department labels in full capitals, two carry OCR damage
    ("SOIL A ND WA TER"), and one carries a typo ("ENG,-PAVING/DRAINAGE"). None of that is
    how a resident should be asked to read them, and none of it can be fixed in the app: a
    title-case function cannot know which words are acronyms, and a TypeScript-side map
    would never reach the Python-generated search index.

    So the layer is data, and these are the properties that keep it from rotting.
    """

    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        create_schema(self.conn)
        self.conn.execute(
            "INSERT INTO entity(entity_id, entity_type, canonical_name) "
            "VALUES ('dept.sheriff', 'department', 'SHERIFF')"
        )

    def tearDown(self):
        self.conn.close()

    def _write(self, tmp: Path, rows: str) -> Path:
        path = tmp / "entity_presentation.csv"
        path.write_text("entity_id,display_name\n" + rows, encoding="utf-8")
        return path

    def test_loads_a_display_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "dept.sheriff,Sheriff\n")
            _load_entity_presentation(self.conn, path)
        self.assertEqual(
            self.conn.execute(
                "SELECT display_name FROM entity_presentation WHERE entity_id='dept.sheriff'"
            ).fetchone()[0],
            "Sheriff",
        )

    def test_rejects_an_unknown_entity(self):
        # A display name for an entity that does not exist means a rename went unnoticed
        # and some department is silently still showing its old label.
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "dept.ghost,Ghost\n")
            with self.assertRaisesRegex(ValueError, "not an entity"):
                _load_entity_presentation(self.conn, path)

    def test_rejects_a_duplicate_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "dept.sheriff,Sheriff\ndept.sheriff,Sheriff's Office\n")
            with self.assertRaisesRegex(ValueError, "more than once"):
                _load_entity_presentation(self.conn, path)

    def test_rejects_an_empty_display_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(Path(tmp), "dept.sheriff,\n")
            with self.assertRaisesRegex(ValueError, "empty display_name"):
                _load_entity_presentation(self.conn, path)

    def test_allows_two_entities_to_share_a_display_name(self):
        # Greenville printed two distinct departments under the identical label
        # "PLANNING AND CODE COMPLIANCE" in FY2014-15. Forcing them apart would mean
        # inventing a distinction the source does not make.
        self.conn.execute(
            "INSERT INTO entity(entity_id, entity_type, canonical_name) "
            "VALUES ('dept.other', 'department', 'PLANNING AND CODE COMPLIANCE')"
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(
                Path(tmp),
                "dept.sheriff,Planning and Code Compliance\n"
                "dept.other,Planning and Code Compliance\n",
            )
            _load_entity_presentation(self.conn, path)
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM entity_presentation").fetchone()[0], 2
        )

    def test_the_real_table_never_shadows_a_name_with_itself(self):
        # A row whose display name equals the canonical name is dead weight that reads as a
        # deliberate curation decision. The generator skips them; this keeps it that way.
        rows = list(csv.DictReader(
            (ROOT / "data" / "production" / "entity_presentation.csv").open(encoding="utf-8")
        ))
        self.assertGreater(len(rows), 50)
        names = {
            row["entity_id"]: row["canonical_name"]
            for row in csv.DictReader(
                (ROOT / "data" / "production" / "entity.csv").open(encoding="utf-8")
            )
        }
        for row in rows:
            self.assertNotEqual(
                row["display_name"], names.get(row["entity_id"]), row["entity_id"]
            )

    def test_the_real_table_leaves_acronyms_and_mixed_case_alone(self):
        # E-911 is already correct and must not be "corrected" into E-911 -> "E-911" or
        # title-cased into something else. Only ALL-CAPS labels get a display name.
        ids = {
            row["entity_id"] for row in csv.DictReader(
                (ROOT / "data" / "production" / "entity_presentation.csv").open(encoding="utf-8")
            )
        }
        self.assertNotIn("fund.sr.e911", ids)
        self.assertNotIn("fund.general", ids)
