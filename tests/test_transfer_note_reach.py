"""Exactly where the three transfer notes may and may not appear.

Both directions, because "the note appears somewhere" is half a contract. A note that reaches
too far is the defect this whole piece of work exists to correct: the FY2022 surge note sits on
181 series files, including a budget row it does not describe. Adding three more notes without
pinning their reach would repeat that with fresh text.

The `explanation` notes in particular have a year dimension that the site's note plumbing does
not filter on its own: `getEntityNotes` returns every entity note regardless of year, so a
FY2026 worked example is one unfiltered list away from appearing under an FY2024 comparison.
The renderer filters; this asserts the exported data does too, on the surface a reader can
download and keep.
"""

from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURATED = ROOT / "data" / "production" / "data_notes.csv"
EXPORTED = ROOT / "web" / "data" / "v2" / "notes.json"
SERIES = ROOT / "web" / "public" / "downloads" / "series"
TREE = ROOT / "web" / "public" / "downloads" / "tree"
COMPARISONS = ROOT / "web" / "public" / "downloads" / "comparisons"

CALLOUT = "note.interfund-transfers-not-netted"
FY2026_EXAMPLE = "note.fy2026-transfers-in-this-total"
NOT_CALCULATED = "note.transfers-removed-not-calculated"
TRANSFER_NOTES = (CALLOUT, FY2026_EXAMPLE, NOT_CALCULATED)


def curated() -> dict[str, dict]:
    with CURATED.open(newline="", encoding="utf-8") as handle:
        return {row["note_id"]: row for row in csv.DictReader(handle)}


def series_rows(name: str) -> list[dict]:
    with (SERIES / f"{name}.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def note_ids(row: dict) -> set[str]:
    return {value for value in (row.get("note_ids") or "").split(";") if value}


class TransferNoteContracts(unittest.TestCase):
    def test_each_note_declares_the_scope_years_and_contract_it_needs(self):
        rows = curated()
        expected = {
            CALLOUT: ("entity", "budget.total", "", "", "callout", "warning"),
            FY2026_EXAMPLE: ("entity", "budget.total", "2026", "2026", "explanation", "info"),
            NOT_CALCULATED: ("entity", "budget.total", "", "", "explanation", "info"),
        }
        for note_id, (scope, value, start, end, contract, severity) in expected.items():
            with self.subTest(note_id):
                row = rows[note_id]
                self.assertEqual(
                    (row["scope_type"], row["scope_value"], row["fiscal_year_start"],
                     row["fiscal_year_end"], row["render_contract"], row["severity"]),
                    (scope, value, start, end, contract, severity),
                )

    def test_the_callout_keeps_the_reason_a_dollar_can_appear_twice(self):
        # The plan's replacement wording said the transfers "remain in the total" without
        # saying why that matters. The mechanism is the whole point of the note.
        text = curated()[CALLOUT]["text"]
        self.assertIn("appears in more than one fund's plan", text)
        self.assertIn("not actual service spending", text)
        self.assertLessEqual(len(text.split()), 40, "the callout is rendered twice on the page; keep it short")

    def test_the_worked_example_cites_amounts_the_county_printed(self):
        text = curated()[FY2026_EXAMPLE]["text"]
        # Both verified against the FY2026 book's General Fund interfund schedule (printed
        # p.131, PDF p.132): Affordable Housing $250,000 out, Workers Compensation $2,500,000 in.
        self.assertIn("$250,000", text)
        self.assertIn("$2,500,000", text)
        self.assertIn("FY2026 p.131", curated()[FY2026_EXAMPLE]["source_ref"])
        self.assertEqual(len(text.split("\n\n")), 3, "three paragraphs: out, in-from-outside, perimeter")

    def test_the_not_calculated_note_points_at_a_public_explanation(self):
        row = curated()[NOT_CALCULATED]
        self.assertIn("/methodology/#excluded", row["source_ref"])
        self.assertNotIn("transfer-clarity-plan", row["source_ref"],
                         "a draft plan in the repository is not a resident-verifiable citation")

    def test_every_note_survives_the_export(self):
        exported = {note["note_id"]: note for note in json.loads(EXPORTED.read_text(encoding="utf-8"))["notes"]}
        rows = curated()
        for note_id in TRANSFER_NOTES:
            with self.subTest(note_id):
                self.assertEqual(exported[note_id]["headline"], rows[note_id]["headline"])
                self.assertEqual(exported[note_id]["text"], rows[note_id]["text"])
                self.assertEqual(exported[note_id]["render_contract"], rows[note_id]["render_contract"])


class TransferNoteReach(unittest.TestCase):
    def test_the_open_year_notes_reach_every_budget_total_row(self):
        rows = series_rows("budget.total")
        self.assertTrue(rows, "no rows read; an empty file would pass every assertion below")
        for row in rows:
            with self.subTest(year=row["fiscal_year"]):
                self.assertIn(CALLOUT, note_ids(row))
                self.assertIn(NOT_CALCULATED, note_ids(row))

    def test_the_fy2026_example_reaches_the_fy2026_row_and_no_other(self):
        for row in series_rows("budget.total"):
            with self.subTest(year=row["fiscal_year"]):
                if row["fiscal_year"] == "2026":
                    self.assertIn(FY2026_EXAMPLE, note_ids(row))
                else:
                    self.assertNotIn(FY2026_EXAMPLE, note_ids(row))

    def test_no_other_series_carries_any_of_the_three(self):
        # The failure this guards is the one the surge notes already have: a note that looks
        # correctly scoped and is in fact on 181 files.
        offenders = {}
        for path in sorted(SERIES.glob("*.csv")):
            if path.stem == "budget.total":
                continue
            found = set()
            with path.open(newline="", encoding="utf-8") as handle:
                for row in csv.DictReader(handle):
                    found |= note_ids(row) & set(TRANSFER_NOTES)
            if found:
                offenders[path.name] = sorted(found)
        self.assertEqual(offenders, {})

    def test_the_tree_downloads_mark_only_the_whole_budget_row(self):
        """The tree family is a second surface with its own reach, and its own way to be wrong.

        Every year's tree has `budget.total` as its root and the four fund groups beneath it.
        An entity-scoped note belongs on the root row and nowhere else: putting it on
        `fund.general` would say the General Fund's own budget double-counts, which it does not.
        """
        seen_root = 0
        for path in sorted(TREE.glob("whole-budget-*.csv")):
            year = path.stem.rsplit("-", 1)[-1]
            with path.open(newline="", encoding="utf-8") as handle:
                for row in csv.DictReader(handle):
                    ids = note_ids(row)
                    with self.subTest(file=path.name, entity=row["entity_id"]):
                        if row["entity_id"] == "budget.total":
                            seen_root += 1
                            self.assertIn(CALLOUT, ids)
                            self.assertIn(NOT_CALCULATED, ids)
                            self.assertEqual(FY2026_EXAMPLE in ids, year == "2026")
                        else:
                            self.assertEqual(ids & set(TRANSFER_NOTES), set())
        self.assertGreaterEqual(seen_root, 20, "far too few tree files read to have tested anything")

    def test_no_comparison_download_carries_them(self):
        # The General Fund comparison is about one fund, not the whole-budget total.
        files_read = rows_read = 0
        for path in sorted(COMPARISONS.glob("*.csv")):
            files_read += 1
            with path.open(newline="", encoding="utf-8") as handle:
                for row in csv.DictReader(handle):
                    rows_read += 1
                    with self.subTest(file=path.name):
                        self.assertEqual(note_ids(row) & set(TRANSFER_NOTES), set())
        # An emptied or renamed directory makes the loop above a no-op that passes.
        self.assertGreaterEqual(files_read, 15, "far too few comparison files read to have tested anything")
        self.assertGreater(rows_read, files_read, "comparison files read but no rows: the absence check ran on nothing")

    def test_the_series_download_is_actually_being_read(self):
        """A positive control for the three absence tests above.

        Every one of them passes if `note_ids` is always empty — a renamed column, a changed
        delimiter, a truncated export. This fails in exactly those cases.
        """
        rows = series_rows("fund.general")
        self.assertTrue(any(note_ids(row) for row in rows),
                        "no note ids parsed anywhere; the absence assertions above are vacuous")


if __name__ == "__main__":
    unittest.main()
