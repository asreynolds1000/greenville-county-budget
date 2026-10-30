"""Tests for the frozen source-file gates.

Every test here is a negative test. A gate that has only ever been observed passing has not
been shown to work; it has been shown to be silent. This project already shipped a commit
claiming a fix the tree did not contain, because the gate covering that row tolerated both
the corrected and uncorrected value.
"""

from __future__ import annotations

import csv
import shutil
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts.production.validate_sources import (
    check_cross_schedule,
    check_detailed_reconciliation,
    validate_sources,
)

DATA = Path(__file__).resolve().parents[1] / "data" / "production"

# Extra inputs the audited-equation checks read beyond the reconciliation set.
EQUATION_FILES = (
    "general_fund_flow_residuals.csv",
    "general_fund_balance_classifications.csv",
    "general_fund_balance_sheet_pages.csv",
)

FILES = (
    "general_fund_detailed_expenditure.csv",
    "general_fund_detailed_revenue.csv",
    "general_fund_audited_series.csv",
    "general_fund_basic_statement_totals.csv",
)


class SourceGateTests(unittest.TestCase):
    def _sandbox(self, tmp: str) -> Path:
        target = Path(tmp)
        for name in FILES:
            shutil.copy(DATA / name, target / name)
        return target

    def _rewrite(self, path: Path, old: bytes, new: bytes) -> None:
        raw = path.read_bytes()
        self.assertIn(old, raw, f"fixture line not found in {path.name}")
        path.write_bytes(raw.replace(old, new, 1))

    def test_committed_sources_pass_all_gates(self):
        self.assertEqual(validate_sources(DATA), [])

    def test_fy2018_derived_total_must_be_absent_not_zero(self):
        """The FY2018 regression, as a permanent test.

        The county omitted this total. Storing 0 instead of absent fabricates a $27.4M
        overspend on the page whose whole purpose is budget-versus-actual honesty.
        """
        with TemporaryDirectory() as tmp:
            target = self._sandbox(tmp)
            self._rewrite(
                target / "general_fund_detailed_expenditure.csv",
                b"2018,Public safety,,,,,27362763,401312",
                b"2018,Public safety,,,0,0,27362763,401312",
            )
            errors = check_detailed_reconciliation(target)
            self.assertTrue(errors)
            self.assertTrue(
                any("must be empty (absent)" in e for e in errors),
                f"expected the absent-not-zero error, got {errors}",
            )

    def test_unregistered_contradicted_total_fails(self):
        """A total row zeroed out while its children carry real budgets must fail.

        This is the general form of the FY2018 defect: unregistered, it is either a source
        omission nobody documented or an extraction error. Either way it cannot pass.
        """
        with TemporaryDirectory() as tmp:
            target = self._sandbox(tmp)
            path = target / "general_fund_detailed_expenditure.csv"
            with path.open(newline="", encoding="utf-8-sig") as fh:
                rows = list(csv.DictReader(fh))
            victim = next(
                r for r in rows
                if r["fiscal_year"] == "2016"
                and not r["subdepartment"]
                and not r["object"]
                and (r["final_budget"] or "").strip() not in ("", "0")
            )
            original = (
                f"{victim['fiscal_year']},{victim['department']},,,"
                f"{victim['original_budget']},{victim['final_budget']},"
                f"{victim['actual']},{victim['variance']}"
            ).encode()
            zeroed = (
                f"{victim['fiscal_year']},{victim['department']},,,0,0,"
                f"{victim['actual']},{victim['variance']}"
            ).encode()
            self._rewrite(path, original, zeroed)
            errors = check_detailed_reconciliation(target)
            self.assertTrue(
                any("register it in DERIVED_TOTALS" in e for e in errors),
                f"expected the contradicted-total error, got {errors}",
            )

    def test_object_row_drift_fails(self):
        with TemporaryDirectory() as tmp:
            target = self._sandbox(tmp)
            path = target / "general_fund_detailed_expenditure.csv"
            raw = path.read_bytes().split(b"\r\n")
            for i, line in enumerate(raw):
                parts = line.split(b",")
                if len(parts) == 8 and parts[0] == b"2016" and parts[3] and parts[6].isdigit():
                    parts[6] = str(int(parts[6]) + 1000).encode()
                    raw[i] = b",".join(parts)
                    break
            path.write_bytes(b"\r\n".join(raw))
            self.assertTrue(check_detailed_reconciliation(target))

    def test_cross_schedule_disagreement_fails(self):
        """A year where the county's two presentations disagree must stop the build."""
        with TemporaryDirectory() as tmp:
            target = self._sandbox(tmp)
            path = target / "general_fund_basic_statement_totals.csv"
            with path.open(newline="", encoding="utf-8-sig") as fh:
                rows = list(csv.DictReader(fh))
            for row in rows:
                if row["measure"] == "total_expenditures" and str(row["fiscal_year"]) == "2016":
                    row["actual"] = "999,999,999"
            with path.open("w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            errors = check_cross_schedule(target)
            self.assertTrue(errors)
            self.assertTrue(any("Needs a human" in e for e in errors))

    def test_absent_is_not_read_as_zero(self):
        from scripts.production.validate_sources import _money

        self.assertIsNone(_money(""))
        self.assertIsNone(_money("-"))
        self.assertEqual(_money("0"), 0)
        self.assertEqual(_money("27,764,075"), 27764075)
        self.assertEqual(_money("(824,428)"), -824428)


if __name__ == "__main__":
    unittest.main()


class AuditedEquationTests(unittest.TestCase):
    """The accounting identities, and proof that their naive forms are wrong.

    These assertions are the durable record of a finding a cold review made and this data
    confirmed: both equations fail if written the obvious way, and they fail across many
    years at once, which reads like corrupt data rather than a wrong formula.
    """

    def _series(self):
        import csv as _csv
        with (DATA / "general_fund_audited_series.csv").open(
            newline="", encoding="utf-8-sig"
        ) as fh:
            rows = list(_csv.DictReader(fh))
        series = {}
        for r in rows:
            value = (r["actual"] or "").strip()
            series.setdefault(r["fiscal_year"], {})[r["measure"]] = (
                int(value) if value.lstrip("-").isdigit() else None
            )
        return series

    def test_committed_data_satisfies_every_identity(self):
        from scripts.production.validate_sources import check_audited_equations

        self.assertEqual(check_audited_equations(DATA), [])

    def test_naive_position_equation_fails_the_pre_2018_era(self):
        """Without the Note 1-D budget-to-GAAP term, FY2011-FY2017 do not balance."""
        series = self._series()
        failing = [
            year for year, s in series.items()
            if None not in (s["fund_balance_beginning"], s["net_change"], s["fund_balance_ending"])
            and s["fund_balance_beginning"] + s["net_change"] != s["fund_balance_ending"]
        ]
        self.assertEqual(sorted(failing), [str(y) for y in range(2011, 2018)])

    def test_naive_flow_equation_fails_every_year(self):
        """transfers_out is stored negative, so subtracting it is wrong in all 15 years."""
        series = self._series()
        passing = [
            year for year, s in series.items()
            if s["total_revenues"] - s["total_expenditures"]
            + s["transfers_in"] - s["transfers_out"] == s["net_change"]
        ]
        self.assertEqual(passing, [])

    def test_classifications_double_count_if_total_rows_are_included(self):
        """Summing every classification row counts the balance twice."""
        import csv as _csv
        with (DATA / "general_fund_balance_classifications.csv").open(
            newline="", encoding="utf-8-sig"
        ) as fh:
            rows = [r for r in _csv.DictReader(fh) if r["fiscal_year"] == "2025"]
        everything = sum(int(r["amount"]) for r in rows)
        detail_only = sum(
            int(r["amount"]) for r in rows if r["classification"].strip().upper() != "TOTAL"
        )
        self.assertEqual(everything, detail_only * 2)
        self.assertEqual(detail_only, 81_545_344)

    def test_missing_measure_is_an_error_not_a_silent_skip(self):
        """Removing a measure must fail, not quietly disable the checks that use it.

        This test was written expecting a chain break and instead found the validator
        reporting success, because every identity skipped itself when a term was absent.
        """
        from scripts.production.validate_sources import check_audited_equations

        with TemporaryDirectory() as tmp:
            target = self._equation_sandbox(tmp)
            path = target / "general_fund_audited_series.csv"
            raw = path.read_text(encoding="utf-8-sig").replace(
                "2016,fund_balance_ending", "2016,fund_balance_ending_DISABLED", 1
            )
            path.write_text(raw, encoding="utf-8")
            errors = check_audited_equations(target)
            self.assertTrue(any("missing" in e for e in errors), errors)

    def _equation_sandbox(self, tmp: str) -> Path:
        target = Path(tmp)
        for name in FILES + EQUATION_FILES:
            shutil.copy(DATA / name, target / name)
        return target

    def test_broken_year_chain_is_caught(self):
        from scripts.production.validate_sources import check_audited_equations

        with TemporaryDirectory() as tmp:
            target = self._equation_sandbox(tmp)
            path = target / "general_fund_audited_series.csv"
            lines = path.read_text(encoding="utf-8-sig").split("\n")
            for i, line in enumerate(lines):
                if line.startswith("2016,fund_balance_ending,"):
                    parts = line.split(",")
                    parts[3] = str(int(parts[3]) + 1000)
                    lines[i] = ",".join(parts)
                    break
            path.write_text("\n".join(lines), encoding="utf-8")
            errors = check_audited_equations(target)
            self.assertTrue(any("year chain is broken" in e for e in errors), errors)


class DataNoteTests(unittest.TestCase):
    """The caveat layer, and the rules that stop it degrading into decoration."""

    def test_committed_notes_pass(self):
        from scripts.production.validate_sources import check_data_notes

        self.assertEqual(check_data_notes(DATA), [])

    def test_removing_a_required_note_fails_the_build(self):
        """Dropping the FY2012 extraction note must stop the pipeline.

        This is the rule that makes the layer real rather than advisory: the facts a reader
        cannot discover from the figures alone are mandatory, not optional.
        """
        from scripts.production.validate_sources import check_data_notes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "data_notes.csv", target / "data_notes.csv")
            # entity.csv too: an entity-scoped note is checked against the real entity
            # ids, so a fixture without it is not a fixture of this check.
            shutil.copy(DATA / "entity.csv", target / "entity.csv")
            path = target / "data_notes.csv"
            kept = [
                line for line in path.read_text(encoding="utf-8-sig").split("\n")
                if not line.startswith("note.fy2012-extraction,")
            ]
            path.write_text("\n".join(kept), encoding="utf-8")
            errors = check_data_notes(target)
            self.assertTrue(any("extraction_method" in e for e in errors), errors)

    def test_invented_note_type_fails(self):
        from scripts.production.validate_sources import check_data_notes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "data_notes.csv", target / "data_notes.csv")
            # entity.csv too: an entity-scoped note is checked against the real entity
            # ids, so a fixture without it is not a fixture of this check.
            shutil.copy(DATA / "entity.csv", target / "entity.csv")
            path = target / "data_notes.csv"
            raw = path.read_text(encoding="utf-8-sig").replace(
                ",unusual_movement,", ",something_i_made_up,", 1
            )
            path.write_text(raw, encoding="utf-8")
            self.assertTrue(
                any("controlled vocabulary" in e for e in check_data_notes(target))
            )

    def test_removing_generic_printed_dash_note_fails_by_name(self):
        from scripts.production.validate_sources import check_data_notes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "data_notes.csv", target / "data_notes.csv")
            shutil.copy(DATA / "entity.csv", target / "entity.csv")
            path = target / "data_notes.csv"
            kept = [
                line for line in path.read_text(encoding="utf-8-sig").split("\n")
                if not line.startswith("note.printed-dash,")
            ]
            path.write_text("\n".join(kept), encoding="utf-8")
            errors = check_data_notes(target)
            self.assertTrue(
                any("note.printed-dash is missing" in error for error in errors),
                errors,
            )

    def test_printed_dash_scope_cannot_drop_double_dash_class(self):
        from scripts.production.validate_sources import check_data_notes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "data_notes.csv", target / "data_notes.csv")
            shutil.copy(DATA / "entity.csv", target / "entity.csv")
            path = target / "data_notes.csv"
            raw = path.read_text(encoding="utf-8-sig").replace(
                "note.printed-dash,printed_form,-;--,",
                "note.printed-dash,printed_form,-,",
                1,
            )
            self.assertIn("note.printed-dash,printed_form,-,", raw)
            path.write_text(raw, encoding="utf-8")
            errors = check_data_notes(target)
            self.assertTrue(
                any("both '-' and '--'" in error for error in errors),
                errors,
            )

    def test_every_note_carries_severity_and_a_render_contract(self):
        """A note with no severity badges everything equally and trains readers to ignore it."""
        import csv as _csv

        with (DATA / "data_notes.csv").open(newline="", encoding="utf-8-sig") as fh:
            rows = list(_csv.DictReader(fh))
        self.assertTrue(rows)
        for row in rows:
            self.assertIn(row["severity"], {"info", "warning"}, row["note_id"])
            self.assertTrue(row["render_contract"].strip(), row["note_id"])

    def test_unrecognised_note_status_fails_the_build(self):
        import csv
        from scripts.production.validate_sources import check_data_notes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "entity.csv", target / "entity.csv")
            with (DATA / "data_notes.csv").open(newline="", encoding="utf-8-sig") as fh:
                reader = csv.DictReader(fh)
                fields = list(reader.fieldnames or [])
                rows = list(reader)
            if "status_class" not in fields:
                fields.append("status_class")
            rows[0]["status_class"] = "actaul"
            with (target / "data_notes.csv").open("w", newline="", encoding="utf-8") as fh:
                writer = csv.DictWriter(fh, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            self.assertTrue(any("status_class" in error for error in check_data_notes(target)))

    def test_the_2013_break_obliges_a_series_split(self):
        """The reorganisation note must force a split, not merely display a badge.

        A badge does not stop a reader treating a line across the break as one trend, and a
        badge is the first thing lost when a chart is screenshotted.
        """
        import csv as _csv

        with (DATA / "data_notes.csv").open(newline="", encoding="utf-8-sig") as fh:
            rows = {r["note_type"]: r for r in _csv.DictReader(fh)}
        self.assertEqual(rows["comparability_break"]["render_contract"], "series_split")


class SourceFootnoteTests(unittest.TestCase):
    def test_committed_source_footnotes_cover_every_marked_observation(self):
        from scripts.production.validate_sources import check_source_footnotes

        self.assertEqual(check_source_footnotes(DATA), [])

    def test_new_marker_without_a_source_read_fails_naming_its_identity(self):
        from scripts.production.validate_sources import check_source_footnotes

        with TemporaryDirectory() as tmp:
            target = Path(tmp)
            shutil.copy(DATA / "source_footnotes.csv", target / "source_footnotes.csv")
            shutil.copytree(DATA / "observations", target / "observations")
            path = target / "observations" / "special-revenue-summary.csv"
            with path.open(newline="", encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))
                fields = list(rows[0])
            synthetic = rows[0].copy()
            synthetic.update(
                {
                    "fiscal_year": "2026",
                    "original_label": "Synthetic future source †",
                    "table_section": "Synthetic marked table",
                    "source_code": "FY2026",
                }
            )
            rows.append(synthetic)
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)

            # Prove the perturbation landed before asking the validator to reject it.
            self.assertIn("Synthetic future source †", path.read_text(encoding="utf-8"))
            errors = check_source_footnotes(target)
            self.assertTrue(
                any(
                    "Synthetic future source †" in error
                    and "FY2026" in error
                    and "Synthetic marked table" in error
                    for error in errors
                ),
                errors,
            )


class SourceEditionTests(unittest.TestCase):
    def test_committed_budget_sources_are_reviewed_as_adopted(self):
        from scripts.production.validate_sources import check_source_editions

        self.assertEqual(check_source_editions(DATA), [])

    def _fixture(self, tmp: str) -> Path:
        target = Path(tmp)
        shutil.copy(DATA / "source_edition_reviews.csv", target)
        shutil.copytree(DATA / "observations", target / "observations")
        return target

    def test_proposed_source_is_rejected_by_name_and_status(self):
        from scripts.production.validate_sources import check_source_editions

        with TemporaryDirectory() as tmp:
            target = self._fixture(tmp)
            path = target / "observations" / "special-revenue-summary.csv"
            raw = path.read_text(encoding="utf-8-sig")
            self.assertIn("FY2026", raw)
            path.write_text(raw.replace("FY2026", "FY2027-proposed", 1), encoding="utf-8")
            self.assertIn("FY2027-proposed", path.read_text(encoding="utf-8"))
            errors = check_source_editions(target)
            self.assertTrue(
                any("FY2027-proposed" in error and "not adopted" in error for error in errors),
                errors,
            )

    def test_observation_cannot_land_on_a_reviewed_proposed_footer_page(self):
        from scripts.production.validate_sources import check_source_editions

        with TemporaryDirectory() as tmp:
            target = self._fixture(tmp)
            path = target / "observations" / "debt-service-summary.csv"
            with path.open(newline="", encoding="utf-8-sig") as handle:
                rows = list(csv.DictReader(handle))
                fields = list(rows[0])
            victim = next(row for row in rows if row["source_code"] == "FY2024-25")
            victim["pdf_page"] = "176"
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            self.assertIn(",176,", path.read_text(encoding="utf-8"))
            errors = check_source_editions(target)
            self.assertTrue(
                any(
                    "FY2024-25" in error
                    and "PDF page 176" in error
                    and "Proposed Budget Document footer" in error
                    for error in errors
                ),
                errors,
            )

    def test_adopted_source_requires_a_recorded_marker(self):
        from scripts.production.validate_sources import check_source_editions

        with TemporaryDirectory() as tmp:
            target = self._fixture(tmp)
            path = target / "source_edition_reviews.csv"
            raw = path.read_text(encoding="utf-8-sig")
            row = next(line for line in raw.splitlines() if line.startswith("FY2026,"))
            changed = row.replace(
                "Ordinance No. 5713; ADOPTED IN REGULAR MEETING THIS 17th Day of June 2025.",
                "",
            )
            self.assertNotEqual(row, changed)
            path.write_text(raw.replace(row, changed), encoding="utf-8")
            errors = check_source_editions(target)
            self.assertTrue(
                any("FY2026" in error and "no recorded adoption marker" in error for error in errors),
                errors,
            )
