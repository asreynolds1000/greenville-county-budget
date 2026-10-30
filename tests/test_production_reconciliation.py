import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.production.pipeline import run_pipeline
from scripts.production.validate import _statement_total

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


class ReconciliationTests(unittest.TestCase):
    def test_pipeline_ok_reconciles_and_resolves_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            build = Path(tmp) / "build"
            dist = Path(tmp) / "dist"
            result = run_pipeline(BLIND, DATA, build, dist)
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")

            db = dist / "gc_budget.sqlite"
            self.assertTrue(db.exists())
            conn = sqlite3.connect(db)
            self.addCleanup(conn.close)

            # every FY2002-2026: four included funds sum to the reported TOTAL BUDGET
            for fy in range(2002, 2027):
                funds = conn.execute(
                    "SELECT COALESCE(SUM(value),0) FROM observation "
                    "WHERE source_dataset='whole-budget-major-funds' "
                    "AND included_in_reported_total_budget='yes' "
                    "AND raw_fund_type<>'Whole Budget' AND fiscal_year=?", (fy,)
                ).fetchone()[0]
                total = conn.execute(
                    "SELECT value FROM observation WHERE source_dataset='whole-budget-major-funds' "
                    "AND raw_fund_type='Whole Budget' AND fiscal_year=?", (fy,)
                ).fetchone()[0]
                self.assertEqual(funds, total, msg=f"FY{fy}: {funds} != {total}")

            # R1 proof: the Fleet Management cross-book conflict resolves to the later
            # book with the earlier value retained as an alternative
            resolved = conn.execute(
                "SELECT value, canonical_status FROM canonical_value "
                "WHERE entity_id='isf.fleet-management' AND fiscal_year=2004").fetchone()
            self.assertEqual(resolved, (4048678, "resolved"))
            alts = conn.execute(
                "SELECT value FROM canonical_alternative "
                "WHERE entity_id='isf.fleet-management' AND fiscal_year=2004").fetchall()
            self.assertIn((4464282,), alts)

    def test_fy2022_23_department_detail_recovered(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_pipeline(BLIND, DATA, Path(tmp) / "build", Path(tmp) / "dist")
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")
            conn = sqlite3.connect(Path(tmp) / "dist" / "gc_budget.sqlite")
            self.addCleanup(conn.close)
            # recovered grand totals match the printed figures exactly
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='gf.expenditures' AND fiscal_year=2022").fetchone()[0],
                205859228)
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='gf.expenditures' AND fiscal_year=2023").fetchone()[0],
                213676673)
            # department detail is now present for the previously-blank years
            self.assertGreaterEqual(conn.execute(
                "SELECT COUNT(*) FROM canonical_value WHERE entity_id LIKE 'dept.%' AND fiscal_year=2022").fetchone()[0], 40)
            # coverage marker flipped from gap to recovered
            self.assertEqual(conn.execute(
                "SELECT has_detail FROM coverage WHERE fiscal_year=2022 "
                "AND dataset='general-fund-department-appropriations'").fetchone()[0], 1)

    def test_fy2026_general_fund_cycle_reconciles(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_pipeline(BLIND, DATA, Path(tmp) / "build", Path(tmp) / "dist")
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")
            conn = sqlite3.connect(Path(tmp) / "dist" / "gc_budget.sqlite")
            self.addCleanup(conn.close)
            for statement_id in (
                "gf.position", "gf.financing", "gf.budget-sources", "gf.outflow",
                "gf.operating-overview",
            ):
                total, errors = _statement_total(conn, statement_id, 2026)
                self.assertEqual(errors, [], msg=f"{statement_id}: {errors}")
                self.assertEqual(total, 0, msg=statement_id)

            # Canonical signs and source statuses remain intact; presentation is
            # responsible for displaying the magnitude of the financing use.
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='fin.gf.transfers-out' "
                "AND fiscal_year=2026 AND status_class='financing'"
            ).fetchone()[0], -8502046)
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='fin.gf.transfers-out' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], 8502046)
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='balance.gf.ending' "
                "AND fiscal_year=2026 AND status_class='estimated'"
            ).fetchone()[0], 75496072)

    def test_special_revenue_cycle_reconciles_and_uses_latest_book(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_pipeline(BLIND, DATA, Path(tmp) / "build", Path(tmp) / "dist")
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")
            conn = sqlite3.connect(Path(tmp) / "dist" / "gc_budget.sqlite")
            self.addCleanup(conn.close)

            for fiscal_year in range(2010, 2027):
                for statement_id in ("sr.inflow", "sr.outflow", "sr.financing", "sr.position"):
                    total, errors = _statement_total(conn, statement_id, fiscal_year)
                    self.assertEqual(errors, [], msg=f"{statement_id} FY{fiscal_year}: {errors}")
                    # The FY2014-15 source prints a one-dollar position discrepancy for
                    # FY2012. Preserve it exactly and register it as a source exception.
                    expected = -1 if (statement_id, fiscal_year) == ("sr.position", 2012) else 0
                    self.assertEqual(total, expected, msg=f"{statement_id} FY{fiscal_year}")

            self.assertEqual(conn.execute(
                "SELECT cv.value,o.source_code FROM canonical_value cv "
                "JOIN observation o ON o.observation_id=cv.chosen_observation_id "
                "WHERE cv.entity_id='rev.sr.total' AND cv.fiscal_year=2010 "
                "AND cv.status_class='actual'"
            ).fetchone(), (27365464, "FY2012-13"))
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='balance.sr.ending' "
                "AND fiscal_year=2010 AND status_class='actual'"
            ).fetchone()[0], 19934155)

            # FY2024 appears as a budget in the FY2024-25 book and as an actual in FY2026.
            # Both survive, while the source-controlled statement selects the later actual.
            values = conn.execute(
                "SELECT cv.status_class,cv.value,o.source_code FROM canonical_value cv "
                "JOIN observation o ON o.observation_id=cv.chosen_observation_id "
                "WHERE cv.entity_id='rev.sr.total' AND cv.fiscal_year=2024 "
                "ORDER BY cv.status_class"
            ).fetchall()
            self.assertEqual(values, [
                ("actual", 92975770, "FY2026"),
                ("adopted", 82601625, "FY2024-25"),
            ])
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='balance.sr.ending' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], 44564844)

    def test_debt_service_cycle_reconciles_and_uses_latest_book(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_pipeline(BLIND, DATA, Path(tmp) / "build", Path(tmp) / "dist")
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")
            conn = sqlite3.connect(Path(tmp) / "dist" / "gc_budget.sqlite")
            self.addCleanup(conn.close)

            for fiscal_year in range(2010, 2027):
                for statement_id in ("debt.inflow", "debt.outflow", "debt.financing", "debt.position"):
                    total, errors = _statement_total(conn, statement_id, fiscal_year)
                    self.assertEqual(errors, [], msg=f"{statement_id} FY{fiscal_year}: {errors}")
                    # The FY2014-15 source's FY2012 inflow components are one dollar
                    # below its printed total; retain the source exception verbatim.
                    expected = -1 if (statement_id, fiscal_year) == ("debt.inflow", 2012) else 0
                    self.assertEqual(total, expected, msg=f"{statement_id} FY{fiscal_year}")

            self.assertEqual(conn.execute(
                "SELECT cv.value,o.source_code FROM canonical_value cv "
                "JOIN observation o ON o.observation_id=cv.chosen_observation_id "
                "WHERE cv.entity_id='rev.debt.total' AND cv.fiscal_year=2010 "
                "AND cv.status_class='actual'"
            ).fetchone(), (11168252, "FY2012-13"))
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='balance.debt.ending' "
                "AND fiscal_year=2010 AND status_class='actual'"
            ).fetchone()[0], 5852692)

            values = conn.execute(
                "SELECT cv.status_class,cv.value,o.source_code FROM canonical_value cv "
                "JOIN observation o ON o.observation_id=cv.chosen_observation_id "
                "WHERE cv.entity_id='rev.debt.total' AND cv.fiscal_year=2024 "
                "ORDER BY cv.status_class"
            ).fetchall()
            self.assertEqual(values, [
                ("actual", 6774706, "FY2026"),
                ("adopted", 4828438, "FY2024-25"),
            ])
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='balance.debt.ending' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], 20200204)

    def test_enterprise_statements_select_source_and_status_without_calling_balance_revenue(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run_pipeline(BLIND, DATA, Path(tmp) / "build", Path(tmp) / "dist")
            self.assertTrue(result.ok, msg=f"errors: {result.errors}")
            conn = sqlite3.connect(Path(tmp) / "dist" / "gc_budget.sqlite")
            self.addCleanup(conn.close)

            exceptions = {
                ("enterprise.funding", 2004): 6_013_793,
                ("enterprise.funding", 2014): -1,
                ("enterprise.outflow", 2015): 1,
            }
            for fiscal_year in range(2002, 2027):
                for statement_id in ("enterprise.funding", "enterprise.outflow"):
                    total, errors = _statement_total(conn, statement_id, fiscal_year)
                    self.assertEqual(errors, [], msg=f"{statement_id} FY{fiscal_year}: {errors}")
                    self.assertEqual(
                        total,
                        exceptions.get((statement_id, fiscal_year), 0),
                        msg=f"{statement_id} FY{fiscal_year}",
                    )

            # FY2024 has budget and actual observations from the same FY2026 source.
            # The instance-level selector must choose ACTUAL rather than become ambiguous.
            self.assertEqual(conn.execute(
                "SELECT source_code,status_class FROM statement_instance "
                "WHERE statement_id='enterprise.funding' AND fiscal_year=2024"
            ).fetchone(), ("FY2026", "actual"))
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='funding.enterprise.total' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], 33222897)
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id='use.enterprise.total' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], 33222597)
            self.assertEqual(conn.execute(
                "SELECT value FROM canonical_value "
                "WHERE entity_id='balance.enterprise.solid-waste-usage' "
                "AND fiscal_year=2026 AND status_class='adopted'"
            ).fetchone()[0], -6274988)


if __name__ == "__main__":
    unittest.main()
