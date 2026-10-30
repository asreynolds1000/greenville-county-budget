"""The FY2022 and FY2023 transfer-surge notes must say which STATUS they describe.

Both notes describe **audited actual** General Fund transfers. Their entity, year and status
must all match the figure they qualify. Previously they reached 181 and 187 series files
respectively, including `fund.general.csv`'s FY2022 *adopted* total of $205,859,228.

So the text is the contract here, and it is asserted exactly rather than by keyword. The
pre-existing check on the FY2023 note matched `/could not find|not stated/i`, which the
unrevised copy already satisfied: it could not have detected whether this change landed.

The $41,245,916 is the ACFR Note 8 counterparty table, p.70, recorded in the note's own
source_ref file. The Note 8 narrative and the MD&A round it to "$41 million"; the table figure is
the one cited here.
"""

from __future__ import annotations

import csv
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURATED = ROOT / "data" / "production" / "data_notes.csv"
EXPORTED = ROOT / "web" / "data" / "v2" / "notes.json"
DOWNLOAD = ROOT / "web" / "public" / "downloads" / "data-notes.csv"

STATUS_QUALIFICATION = "This describes actual transfers, not the adopted transfer budget."

EXPECTED = {
    "note.fy2022-transfer-surge": {
        "headline": "FY2022 actual General Fund transfers included COVID relief",
        "text": (
            "The audited report records a $41,245,916 transfer from the COVID Relief Fund into "
            "the General Fund. This describes actual transfers, not the adopted transfer budget."
        ),
        "fiscal_year_start": "2022",
        "fiscal_year_end": "2022",
        "scope_type": "entity",
        "scope_value": "fin.gf.transfers-in",
        "status_class": "actual",
        "source_ref": "research/fy2025-budget-actual/transfer-surge-fy2022-fy2023.md",
    },
    "note.fy2023-transfer-surge": {
        "headline": "A large transfer the report does not explain",
        "text": (
            "Actual transfers into the General Fund were again unusually large in 2023, including "
            "$30.3 million from revenue bonds. This describes actual transfers, not the adopted "
            "transfer budget. We could not find an explanation for it in the county's report. The "
            "amount is confirmed; the reason is not stated."
        ),
        "fiscal_year_start": "2023",
        "fiscal_year_end": "2023",
        "scope_type": "entity",
        "scope_value": "fin.gf.transfers-in",
        "status_class": "actual",
        "source_ref": "research/fy2025-budget-actual/transfer-surge-fy2022-fy2023.md",
    },
}


def _rows(path: Path) -> dict[str, dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["note_id"]: row for row in csv.DictReader(handle)}


class TransferSurgeNoteText(unittest.TestCase):
    def test_curated_rows_name_the_status_they_describe(self):
        rows = _rows(CURATED)
        for note_id, expected in EXPECTED.items():
            with self.subTest(note_id):
                row = rows.get(note_id)
                self.assertIsNotNone(row, f"{note_id} is missing from {CURATED.name}")
                for field, value in expected.items():
                    self.assertEqual(row[field], value, f"{note_id}.{field}")
                self.assertIn(STATUS_QUALIFICATION, row["text"])

    def test_the_exported_notes_carry_the_same_text(self):
        exported = {note["note_id"]: note for note in json.loads(EXPORTED.read_text(encoding="utf-8"))["notes"]}
        for note_id, expected in EXPECTED.items():
            with self.subTest(note_id):
                self.assertEqual(exported[note_id]["headline"], expected["headline"])
                self.assertEqual(exported[note_id]["text"], expected["text"])
                self.assertEqual(exported[note_id].get("status_class"), "actual")

    def test_the_public_download_carries_the_same_text(self):
        # The download is where a reader most easily reads a note next to a number whose status
        # it does not share, so the qualification has to survive the export, not just the CSV.
        rows = _rows(DOWNLOAD)
        for note_id, expected in EXPECTED.items():
            with self.subTest(note_id):
                self.assertEqual(rows[note_id]["headline"], expected["headline"])
                self.assertEqual(rows[note_id]["text"], expected["text"])
                self.assertEqual(rows[note_id].get("status_class"), "actual")

    def test_the_old_unqualified_wording_is_gone_everywhere(self):
        gone = [
            "A large one-off transfer",
            "Transfers into the General Fund were unusually large in 2022",
            "The county's report describes this transfer.",
        ]
        for path in (CURATED, EXPORTED, DOWNLOAD):
            body = path.read_text(encoding="utf-8")
            for phrase in gone:
                with self.subTest(path=path.name, phrase=phrase):
                    self.assertNotIn(phrase, body)

    def test_the_notes_only_reach_actual_general_fund_transfers(self):
        """Check every downloadable figure, including the financing sibling and other years."""
        for note_id, year in (("note.fy2022-transfer-surge", "2022"), ("note.fy2023-transfer-surge", "2023")):
            hits = []
            downloads = ROOT / "web" / "public" / "downloads"
            for family in ("series", "tree", "comparisons"):
                for path in sorted((downloads / family).glob("*.csv")):
                    with path.open(newline="", encoding="utf-8") as handle:
                        for row in csv.DictReader(handle):
                            if note_id in (row.get("note_ids") or "").split(";"):
                                hits.append((str(path.relative_to(downloads)),
                                             row.get("fiscal_year"), row.get("status_class")))
            with self.subTest(note_id=note_id):
                self.assertEqual(hits, [("series/fin.gf.transfers-in.csv", year, "actual")])

    def test_status_scoped_notes_require_a_matching_known_status(self):
        from scripts.production.export_app import _note_ids_for

        notes = [
            {"note_id": "actual-only", "scope_type": "entity", "scope_value": "fin.gf.transfers-in",
             "fiscal_year_start": "2022", "fiscal_year_end": "2022", "status_class": "actual"},
            {"note_id": "all-statuses", "scope_type": "entity", "scope_value": "fin.gf.transfers-in",
             "fiscal_year_start": "2022", "fiscal_year_end": "2022", "status_class": ""},
        ]
        for status in ("actual", "adopted", "estimated", "financing", "projected", "proposed", None):
            with self.subTest(status=status):
                expected = ["actual-only", "all-statuses"] if status == "actual" else ["all-statuses"]
                self.assertEqual(_note_ids_for(notes, 2022, entity_id="fin.gf.transfers-in",
                                               status_class=status), expected)
        self.assertEqual(_note_ids_for(notes, 2023, entity_id="fin.gf.transfers-in",
                                       status_class="actual"), [])
        self.assertEqual(_note_ids_for(notes, 2022, entity_id="fund.general",
                                       status_class="actual"), [])


if __name__ == "__main__":
    unittest.main()
