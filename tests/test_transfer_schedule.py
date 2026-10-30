"""The FY2026 transfer schedule's validator must fail, and fail for the stated reason.

A validator written alongside the data it validates agrees with itself by construction. So the
positive case is established first, from a source-anchored fixture, and then each gate is made
to fire by mutating one field — with the mutation asserted to have landed, because a mutation
that silently did nothing produces a passing test that proves the opposite of what it claims.

The mutations go beyond the three the plan proposed. Its list (a receipt that no longer ties, a
zero residual, a status string) leaves the ways this schedule would most plausibly be wrong
untested: a counterparty swapped for another, an invented pair, a duplicated row, a residual
quietly relabelled as something the county published.
"""

from __future__ import annotations

import csv
import io
import unittest
from pathlib import Path

from scripts.research import transfer_schedule as validator
from scripts.research.transfer_schedule import Failure

ROOT = Path(__file__).resolve().parents[1]
SCHEDULE = ROOT / "research" / "transfer-reconciliation-2026-09" / "transfer_schedule.csv"


def rows() -> list[dict]:
    with SCHEDULE.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def run(data: list[dict]) -> list[str]:
    """Every gate, in the order the script runs them."""
    validator.check_vocabulary(data)
    validator.check_identity(data)
    validator.check_status(data)
    validator.check_residuals(data)
    validator.check_unique(data)
    validator.check_perimeter(data)
    validator.check_derivations(data)
    validator.check_conflicts(data)
    return (validator.check_page36_totals() + validator.check_receipts(data)
            + validator.check_sender_pages(data))


def find(data: list[dict], sender: str, receiver: str) -> dict:
    for row in data:
        if row["sending_fund_id"] == sender and row["receiving_fund_id"] == receiver:
            return row
    raise AssertionError(f"no row {sender} -> {receiver}; the fixture changed under the test")


class ScheduleIsValid(unittest.TestCase):
    def test_the_real_schedule_passes_every_gate(self):
        notes = run(rows())
        self.assertGreaterEqual(len(notes), 10, "too few tie-outs ran to have checked anything")

    def test_the_named_pairs_inside_the_total_sum_to_the_figure_the_preview_prints(self):
        matched = validator.matched_pairs(rows())
        self.assertEqual(len(matched), 11)
        self.assertEqual(sum(int(row["amount"]) for row in matched), 50226989)

    def test_the_preview_never_prints_a_retracted_or_removed_figure(self):
        data = rows()
        preview = validator.write_preview(data, validator.summarise(data))
        validator.check_no_forbidden_output(preview)
        # And it does not print a spending claim of any shape.
        self.assertNotIn("net spending", preview.lower())
        self.assertNotIn("477,233,755", preview)

    def test_the_preview_labels_its_own_arithmetic(self):
        data = rows()
        preview = validator.write_preview(data, validator.summarise(data))
        self.assertIn("site derivation", preview)
        self.assertIn("is not a county-published total", preview)
        self.assertIn("$50,226,989", preview)


class GatesFireForTheirOwnReason(unittest.TestCase):
    def assertFails(self, data: list[dict], fragment: str):
        with self.assertRaises(Failure) as caught:
            run(data)
        self.assertIn(fragment, str(caught.exception).lower())

    def test_a_receipt_that_no_longer_ties_to_the_published_total(self):
        data = rows()
        row = find(data, "fund.sr.infrastructure-bank", "fund.general")
        row["amount"] = str(int(row["amount"]) - 1000)
        self.assertNotEqual(row["amount"], find(rows(), "fund.sr.infrastructure-bank", "fund.general")["amount"])
        self.assertFails(data, "do not tie")

    def test_a_zero_residual(self):
        data = rows()
        residual = next(row for row in data if row["row_kind"] == "residual")
        residual["amount"] = "0"
        self.assertFails(data, "never zero")

    def test_an_actual_smuggled_into_a_budget_schedule(self):
        data = rows()
        data[0]["status_class"] = "actual"
        self.assertFails(data, "status mixing")

    def test_a_residual_dressed_up_as_something_the_county_published(self):
        data = rows()
        residual = next(row for row in data if row["row_kind"] == "residual")
        residual["evidence"] = "sender_statement"
        self.assertFails(data, "site_derivation")

    def test_a_residual_with_its_formula_removed(self):
        data = rows()
        residual = next(row for row in data if row["row_kind"] == "residual")
        residual["derivation"] = ""
        self.assertFails(data, "invented number")

    def test_a_counterparty_swap_across_receipt_groups(self):
        # Moving a Debt Service receipt to the General Fund changes both groups' receipt totals,
        # so the per-group tie-out catches it. This is NOT a total-preserving swap; the round-3
        # review pointed out the old name claimed it was. The preserving case is below.
        data = rows()
        find(data, "fund.sr.infrastructure-bank", "fund.debt-service")["receiving_fund_id"] = "fund.general"
        self.assertFails(data, "do not tie")

    @unittest.expectedFailure
    def test_a_counterparty_swap_within_special_revenue_that_preserves_every_total(self):
        # Road Program and Parks are both Special Revenue, so re-pointing this receipt keeps the
        # Special Revenue receipt group AND the sender's outflow total unchanged. Catching it
        # needs per-recipient receipt controls transcribed from each fund's own statement
        # (Road Program p.150, Parks p.145, Affordable Housing), which are not in the validator
        # yet. Marked expectedFailure so the gap is on the record and this test starts failing
        # the day those controls land, at which point remove the decorator.
        data = rows()
        row = find(data, "fund.sr.infrastructure-bank", "fund.sr.road-program")
        row["receiving_fund_id"] = "fund.sr.parks-recreation-tourism"
        row["receiving_fund_label"] = "Parks, Recreation & Tourism"
        self.assertFails(data, "do not tie")

    def test_an_invented_pair(self):
        data = rows()
        invented = dict(data[0])
        invented.update(sending_fund_id="fund.general", receiving_fund_id="fund.enterprise",
                        sending_fund_label="General Fund", receiving_fund_label="Enterprise Fund",
                        amount="1234567", evidence="sender_statement", row_kind="named_pair",
                        derivation="", amount_alt="")
        data.append(invented)
        self.assertFails(data, "do not tie")

    def test_a_duplicated_row(self):
        data = rows()
        data.append(dict(find(data, "fund.general", "fund.debt-service")))
        self.assertFails(data, "duplicate row")

    def test_a_negative_amount_instead_of_a_direction(self):
        data = rows()
        data[0]["amount"] = "-" + data[0]["amount"]
        self.assertFails(data, "positive magnitudes")

    def test_a_row_citing_only_a_printed_page(self):
        data = rows()
        data[0]["pdf_page"] = ""
        self.assertFails(data, "pdf page")

    def test_an_unknown_evidence_value(self):
        data = rows()
        data[0]["evidence"] = "probably"
        self.assertFails(data, "evidence")

    def test_a_row_from_another_fiscal_year(self):
        # The control totals are FY2026 literals; a row from another year ties to nothing.
        data = rows()
        data[0]["fiscal_year"] = "1900"
        self.assertFails(data, "fiscal year")

    def test_a_row_with_no_source_document(self):
        data = rows()
        data[0]["source_code"] = ""
        self.assertFails(data, "source")

    def test_a_row_from_a_different_book(self):
        data = rows()
        data[0]["source_code"] = "FY2024-25"
        self.assertFails(data, "source")

    def test_a_deleted_enterprise_outflow(self):
        # p.36 prints $2,812,000 of Enterprise transfers out. The old validator never used it.
        data = [row for row in rows() if row["sending_fund_id"] != "fund.enterprise"]
        self.assertEqual(len(data), len(rows()) - 1)
        self.assertFails(data, "fund.enterprise outflows")

    def test_a_deleted_internal_service_receipt(self):
        # The one ISF row is also a General Fund receipt, so deleting it is caught by the
        # General Fund receipt tie-out first. That is a correct refusal; the ISF sender control
        # is exercised on its own below.
        data = [row for row in rows() if not row["sending_fund_id"].startswith("isf.")]
        self.assertEqual(len(data), len(rows()) - 1)
        self.assertFails(data, "receipts into fund.general do not tie")

    def test_an_internal_service_outflow_reassigned_to_an_uncontrolled_sender(self):
        # Re-pointing the sender to Debt Service keeps every receipt group and every other
        # sender total unchanged; only p.36's Internal Service transfers-out line notices.
        data = rows()
        row = next(row for row in data if row["sending_fund_id"].startswith("isf."))
        row["sending_fund_id"] = "fund.debt-service"
        row["sending_fund_label"] = "Debt Service"
        row["sender_in_perimeter"] = "yes"
        self.assertFails(data, "internal service outflows")

    def test_a_false_residual_formula(self):
        data = rows()
        residual = next(row for row in data if row["row_kind"] == "residual")
        residual["derivation"] = "1+1=2"
        self.assertFails(data, "derivation")

    def test_a_residual_formula_whose_arithmetic_is_wrong(self):
        data = rows()
        residual = next(row for row in data if row["receiving_fund_id"] == "fund.debt-service" and row["row_kind"] == "residual")
        residual["derivation"] = residual["derivation"].replace("19264914 named", "19264913 named")
        self.assertFails(data, "derivation")

    def test_an_erased_source_conflict(self):
        # Both within-book conflicts are transcribed controls; a schedule that quietly picks one
        # printed amount and drops the other is less honest than the disclosure it replaces.
        data = rows()
        row = find(data, "fund.sr.hospitality-tax", "fund.general")
        self.assertEqual(row["amount_alt"], "2162115")
        row["amount_alt"] = ""
        row["alt_printed_page"] = ""
        row["discrepancy_note"] = ""
        self.assertFails(data, "conflict")

    def test_an_undeclared_conflict(self):
        data = rows()
        row = find(data, "fund.general", "fund.debt-service")
        row["amount_alt"] = "8052047"
        row["alt_printed_page"] = "36"
        self.assertFails(data, "conflict")

    def test_a_perimeter_flag_that_contradicts_the_declared_perimeter(self):
        # Affordable Housing is a Special Revenue fund inside the published total; flagging its
        # receipt as outside would silently drop $250,000 from the matched pairs.
        data = rows()
        find(data, "fund.general", "fund.sr.affordable-housing")["receiver_in_perimeter"] = "no"
        self.assertFails(data, "perimeter")

    def test_an_empty_schedule_is_refused_rather_than_passing_everything(self):
        with self.assertRaises(Failure) as caught:
            validator.load(Path("/dev/null"))
        self.assertIn("column set changed", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
