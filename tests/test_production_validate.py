import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.production.schema import create_schema
from tests._build import full_build as shared_build
from scripts.production.ingest import ingest_observations
from scripts.production.dimensions import load_sources, load_coverage, load_dimensions
from scripts.production.canonical import build_canonical, build_rollups
from scripts.production.validate import validate

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


def full_build():
    return shared_build()


class ValidateTests(unittest.TestCase):
    def test_clean_real_data_passes(self):
        conn = full_build()
        self.addCleanup(conn.close)
        result = validate(conn)
        self.assertTrue(result.ok, msg=f"unexpected errors: {result.errors}")
        self.assertFalse(
            any("no confirmed entity mapping" in w for w in result.warnings),
            msg=f"reviewed unmapped rows should be silent: {result.warnings}",
        )
        # the FY2022-23 gap must surface as a warning, not fabricated data
        # The FY2022-23 department detail gap is filled by the recovered image tables, so
        # the real pipeline emits no gap warning. The old assertion held only because this
        # test built without the recovery datasets, which is exactly the divergence
        # tests/_build.py now prevents.
        self.assertFalse(
            any("2022" in w and "gap" in w for w in result.warnings),
            msg=f"unexpected FY2022 gap warning: {result.warnings}",
        )

    def test_ninth_unmapped_observation_is_an_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "INSERT INTO observation("
            "observation_id,fiscal_year,value,measure_type,status,status_class,"
            "original_label,source_code,source_url,pdf_page,source_dataset,source_row_ordinal"
            ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "synthetic-ninth-unmapped",
                2026,
                1,
                "dollars",
                "ADOPTED BUDGET",
                "adopted",
                "Synthetic unmapped component",
                "FY2026",
                "https://example.invalid/source.pdf",
                1,
                "synthetic-unmapped-gate-test",
                0,
            ),
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any(
                "1 unreviewed observations have no confirmed entity mapping" in error
                and "synthetic-ninth-unmapped" in error
                for error in result.errors
            ),
            msg=f"errors were: {result.errors}",
        )

    def test_unclassified_zero_observation_is_error_and_names_observation(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "INSERT INTO observation("
            "observation_id,fiscal_year,value,measure_type,status,status_class,"
            "original_label,source_code,source_url,pdf_page,source_dataset,source_row_ordinal"
            ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "synthetic-unclassified-zero",
                2026,
                0,
                "dollars",
                "ADOPTED BUDGET",
                "adopted",
                "Synthetic zero",
                "FY2026",
                "https://example.invalid/source.pdf",
                1,
                "synthetic-zero-gate-test",
                0,
            ),
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any(
                "zero-valued observations lack a reviewed printed-form classification" in error
                and "synthetic-unclassified-zero" in error
                for error in result.errors
            ),
            msg=f"errors were: {result.errors}",
        )

    def test_nonzero_observation_cannot_inherit_zero_cell_classification(self):
        conn = full_build()
        self.addCleanup(conn.close)
        observation_id = conn.execute(
            "SELECT observation_id FROM observation WHERE value<>0 ORDER BY observation_id LIMIT 1"
        ).fetchone()[0]
        conn.execute(
            "UPDATE observation SET printed_form='-', "
            "printed_form_review_status='machine_classified' WHERE observation_id=?",
            (observation_id,),
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("nonzero observations have zero-cell printed-form classifications" in error
                and observation_id in error for error in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_canonical_zero_must_retain_chosen_observation_printed_form(self):
        conn = full_build()
        self.addCleanup(conn.close)
        observation_id = conn.execute(
            "SELECT chosen_observation_id FROM canonical_value "
            "WHERE value=0 AND chosen_observation_id IS NOT NULL "
            "ORDER BY chosen_observation_id LIMIT 1"
        ).fetchone()[0]
        conn.execute(
            "UPDATE canonical_value SET printed_form=NULL WHERE chosen_observation_id=?",
            (observation_id,),
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("canonical zero values lost" in error and observation_id in error
                for error in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_broken_reconciliation_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        # alter one included fund total for FY2010 -> whole-budget no longer reconciles
        conn.execute(
            "UPDATE observation SET value=value+1 "
            "WHERE source_dataset='whole-budget-major-funds' "
            "AND fiscal_year=2010 AND raw_fund_type='Enterprise Fund'")
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("reconciliation FY2010" in e for e in result.errors))

    def test_adopted_hierarchy_mismatch_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE hierarchy_rollup SET reconciles=0, reconciliation_note='test mismatch' "
            "WHERE entity_id='budget.total' AND fiscal_year=2026 AND status_class='adopted'")
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("adopted hierarchy rollups" in e for e in result.errors))

    def test_missing_gap_marker_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute("DELETE FROM coverage WHERE fiscal_year=2022 "
                     "AND dataset='general-fund-department-appropriations'")
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("FY2022 department coverage marker is missing" in e for e in result.errors))

    def test_ambiguous_label_map_is_error(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        create_schema(conn)
        conn.executescript(
            "INSERT INTO source(source_code,publication_order) VALUES('FY2004-05',2004);"
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES('a','opcat','A'),('b','department','B');"
            "INSERT INTO label_map(original_label,match_scope,entity_id,review_status) VALUES('HR','label','a','human_confirmed');"
            "INSERT INTO label_map(original_label,match_scope,table_section,entity_id,review_status) VALUES('HR','label+section','Sec','b','human_confirmed');"
            "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,status,status_class,"
            "original_label,table_section,source_code,source_url,pdf_page,source_dataset,source_row_ordinal) "
            "VALUES('o',2010,5,'dollars','ADOPTED BUDGET','adopted','HR','Sec','FY2004-05','http://x',1,'d',0);"
        )
        result = validate(conn)
        self.assertTrue(any("ambiguous" in e for e in result.errors), msg=result.errors)

    def test_status_class_table_populated(self):
        conn = full_build()
        self.addCleanup(conn.close)
        self.assertEqual(
            conn.execute("SELECT COUNT(*) FROM status_class").fetchone()[0], 6)

    def test_isf_included_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE observation SET included_in_reported_total_budget='yes' "
            "WHERE observation_id IN (SELECT observation_id FROM observation "
            "WHERE raw_fund_type='Internal Service Fund' LIMIT 1)")
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("Internal Service Fund" in e for e in result.errors))

    def test_missing_entity_accounting_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute("DELETE FROM entity_accounting WHERE entity_id='fund.general'")
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("controlled accounting semantics" in e for e in result.errors))

    def test_additive_stock_relationship_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE entity_accounting SET value_semantics='stock' "
            "WHERE entity_id='fund.general'"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("stock entities" in e for e in result.errors))

    def test_coverage_claiming_absence_that_exists_is_error(self):
        """The subtler direction, and the one this site has already shipped once.

        A page printed "not published" over four General Fund revenue components the same
        build was serving two clicks away. A gate that only caught overclaiming would have
        passed that page.
        """
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE scope_coverage SET coverage_level='unavailable' "
            "WHERE scope_entity_id='fund.general' AND domain='outflow' AND fiscal_year=2020"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("claim 'unavailable'" in e and "fund.general/outflow/FY2020" in e
                for e in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_coverage_claiming_data_we_lack_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE scope_coverage SET coverage_level='complete' "
            "WHERE scope_entity_id='fund.enterprise' AND domain='position' AND fiscal_year=2002"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("claim coverage nothing backs" in e and "fund.enterprise/position/FY2002" in e
                for e in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_missing_coverage_state_is_error(self):
        """An overview region with no coverage row would render empty, which is the one
        thing Step 6 exists to prevent."""
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "DELETE FROM scope_coverage "
            "WHERE scope_entity_id='fund.debt-service' AND domain='position' AND fiscal_year=2013"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("coverage states are missing" in e and "fund.debt-service/position/FY2013" in e
                for e in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_coverage_state_without_words_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE scope_coverage SET gap_note=NULL "
            "WHERE scope_entity_id='fund.enterprise' AND domain='inflow' AND fiscal_year=2011"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(
            any("no note saying what is and is not there" in e for e in result.errors),
            msg=f"errors were: {result.errors}",
        )

    def test_coverage_backing_reaches_statement_members(self):
        """Regression on the membership closure.

        General Fund revenue hangs off an accounting statement, not the containment tree —
        `rev.total-estimated-financial-sources` has no parent edge to `fund.general`. Walk
        only hierarchy edges and every inflow claim in the file looks unbacked, so the gate
        would fail the build for the wrong reason and the fix would be to weaken the gate.
        """
        from scripts.production.validate import scope_domain_backing

        conn = full_build()
        self.addCleanup(conn.close)
        backing = scope_domain_backing(conn)

        gf_inflow = backing.get(("fund.general", "inflow", 2014), [])
        self.assertIn("rev.property-taxes", {v.entity_id for v in gf_inflow})

        # The county scope must see the General Fund's revenue through two hops
        # (budget.total -> fund.general -> statement member), or the home page cannot
        # honestly say county money in is only partly covered.
        county_inflow = backing.get(("budget.total", "inflow", 2014), [])
        self.assertIn("rev.property-taxes", {v.entity_id for v in county_inflow})

        # Special Revenue now has reconciled summary coverage from FY2010 forward,
        # but must remain empty before the first extracted statement.
        for fiscal_year in range(2002, 2010):
            self.assertEqual(
                backing.get(("fund.special-revenue", "inflow", fiscal_year), []),
                [],
            )
        for fiscal_year in range(2010, 2027):
            self.assertIn(
                "rev.sr.property-taxes",
                {v.entity_id for v in backing[("fund.special-revenue", "inflow", fiscal_year)]},
            )

        # Debt Service follows the same FY2010 research boundary.
        for fiscal_year in range(2002, 2010):
            self.assertEqual(backing.get(("fund.debt-service", "inflow", fiscal_year), []), [])
        for fiscal_year in range(2010, 2027):
            self.assertIn(
                "rev.debt.property-taxes",
                {v.entity_id for v in backing[("fund.debt-service", "inflow", fiscal_year)]},
            )

        # Enterprise operating revenue is available across the site's full range.
        for fiscal_year in range(2002, 2027):
            self.assertIn(
                "rev.enterprise.property-taxes",
                {v.entity_id for v in backing[("fund.enterprise", "inflow", fiscal_year)]},
            )
        # The earliest page has no fund-balance line; later pages provide usage or
        # contribution only, not a complete beginning-to-ending position statement.
        self.assertEqual(backing.get(("fund.enterprise", "position", 2002), []), [])
        for fiscal_year in range(2003, 2027):
            self.assertTrue(
                {v.entity_id for v in backing[("fund.enterprise", "position", fiscal_year)]}
                & {
                    "balance.enterprise.solid-waste-usage",
                    "balance.enterprise.stormwater-usage",
                }
            )

    def test_broken_accounting_statement_is_error(self):
        conn = full_build()
        self.addCleanup(conn.close)
        conn.execute(
            "UPDATE canonical_value SET value=value+1 "
            "WHERE entity_id='balance.gf.ending' AND fiscal_year=2026 "
            "AND status_class='estimated'"
        )
        result = validate(conn)
        self.assertFalse(result.ok)
        self.assertTrue(any("gf.position FY2026" in e for e in result.errors))


if __name__ == "__main__":
    unittest.main()
