import csv
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.production.pipeline import run_pipeline
from scripts.production.schema import create_schema
from scripts.production.export_app import _data_version, export_app, primary_status_class

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"


def _real_db_path(tmp_root: Path) -> Path:
    """Run the real pipeline once into tmp_root/dist and return the sqlite path."""
    build = tmp_root / "build"
    dist = tmp_root / "dist"
    result = run_pipeline(BLIND, DATA, build, dist)
    assert result.ok, f"pipeline errors: {result.errors}"
    return dist / "gc_budget.sqlite"


class ExportAppTests(unittest.TestCase):
    """Exercises export_app.py against the REAL production database (not a
    fixture) -- the verify checks below assert specific published numbers, so
    they must run against the actual curated data, matching the convention in
    test_production_reconciliation.py and test_production_materialize.py."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        tmp_root = Path(cls._tmp.name)
        db_path = _real_db_path(tmp_root)
        cls.conn = sqlite3.connect(db_path)
        cls.out_dir = tmp_root / "web"
        cls.written = export_app(cls.conn, cls.out_dir)
        cls.pages_dir = cls.out_dir / "data" / "pages"

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()
        cls._tmp.cleanup()

    def _load_page(self, entity_id: str) -> dict:
        return json.loads((self.pages_dir / f"{entity_id}.json").read_text(encoding="utf-8"))

    def _load_v2_page(self, entity_id: str) -> dict:
        return json.loads(
            (self.out_dir / "data" / "v2" / "pages" / f"{entity_id}.json")
            .read_text(encoding="utf-8")
        )

    # -- R1: determinism -----------------------------------------------

    def test_first_export_version_includes_its_corrections_download(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "web"
            export_app(self.conn, output)
            version_file = output / "data" / "v2" / "corrections.json"
            first = version_file.read_bytes()
            self.assertEqual(json.loads(first)["data_version"], _data_version(output))
            export_app(self.conn, output)
            self.assertEqual(version_file.read_bytes(), first)

    def test_determinism_byte_identical_across_two_runs(self):
        with tempfile.TemporaryDirectory() as tmp2:
            out2 = Path(tmp2) / "web"
            export_app(self.conn, out2)

            files1 = sorted(p.relative_to(self.out_dir) for p in self.out_dir.rglob("*") if p.is_file())
            files2 = sorted(p.relative_to(out2) for p in out2.rglob("*") if p.is_file())
            self.assertEqual(files1, files2, "file sets differ between two exporter runs")

            mismatches = []
            for rel in files1:
                b1 = (self.out_dir / rel).read_bytes()
                b2 = (out2 / rel).read_bytes()
                if b1 != b2:
                    mismatches.append(str(rel))
            self.assertEqual(mismatches, [], f"non-deterministic output in: {mismatches}")

    def test_json_files_end_with_single_trailing_newline(self):
        for path in self.pages_dir.glob("*.json"):
            text = path.read_text(encoding="utf-8")
            self.assertTrue(text.endswith("\n"), path)
            self.assertFalse(text.endswith("\n\n"), path)

    # -- citations / null preservation (real-data sweep) -----------------

    def test_every_nonnull_series_value_has_full_citation(self):
        checked = 0
        for path in self.pages_dir.glob("*.json"):
            page = json.loads(path.read_text(encoding="utf-8"))
            for point in page["series"]:
                checked += 1
                if point["value"] is not None:
                    citation = point["citation"]
                    self.assertIsNotNone(citation, f"{path.name} FY{point['fiscal_year']} missing citation")
                    self.assertTrue(citation["source_code"], path.name)
                    self.assertIsNotNone(citation["pdf_page"], path.name)
                    self.assertTrue(citation["source_url"], path.name)
        self.assertGreater(checked, 1000)  # sanity: we actually walked real data (1860 primary-series rows)

    def test_every_canonical_zero_exports_its_source_printed_form(self):
        expected_zero_count = self.conn.execute(
            "SELECT COUNT(*) FROM canonical_value WHERE value=0"
        ).fetchone()[0]
        seen_zero_count = 0
        for path in (self.out_dir / "data" / "v2" / "pages").glob("*.json"):
            page = json.loads(path.read_text(encoding="utf-8"))
            for point in page["series"]:
                if point["value"] == 0:
                    seen_zero_count += 1
                    self.assertIn(point["printed_form"], {"-", "--"}, path.name)
                elif point["value"] is not None:
                    self.assertIsNone(point["printed_form"], path.name)
        self.assertEqual(seen_zero_count, expected_zero_count)

    def test_series_and_tree_csvs_carry_printed_form_without_widening_it(self):
        downloads = self.out_dir / "public" / "downloads"
        zero_rows = 0
        for path in list((downloads / "series").glob("*.csv")) + list(
            (downloads / "tree").glob("*.csv")
        ):
            with path.open(newline="", encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                self.assertIn("printed_form", reader.fieldnames or [], str(path))
                for row in reader:
                    if row["value"] == "0":
                        zero_rows += 1
                        self.assertIn(row["printed_form"], {"-", "--"}, str(path))
                        self.assertIn("note.printed-dash", row["note_ids"], str(path))
                    elif row["value"]:
                        self.assertEqual(row["printed_form"], "", str(path))
                        self.assertNotIn("note.printed-dash", row["note_ids"], str(path))
        self.assertGreater(zero_rows, 0, "CSV sweep did not encounter a canonical zero")

    def test_source_footnote_notes_reach_every_applicable_download_row(self):
        notes = json.loads(
            (self.out_dir / "data" / "v2" / "notes.json").read_text(encoding="utf-8")
        )["notes"]
        source_notes = [note for note in notes if note["note_type"] == "source_footnote"]
        self.assertEqual(len(source_notes), 16)

        for note in source_notes:
            entity_id = note["scope_value"]
            path = self.out_dir / "public" / "downloads" / "series" / f"{entity_id}.csv"
            with path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            reached = 0
            for row in rows:
                year = int(row["fiscal_year"])
                expected = note["fiscal_year_start"] <= year <= note["fiscal_year_end"]
                present = note["note_id"] in row["note_ids"].split(";")
                self.assertEqual(present, expected, f"{note['note_id']} in {path} FY{year}")
                reached += int(expected)
            self.assertGreater(reached, 0, f"{note['note_id']} reaches no downloadable value")

    def test_source_footnote_applicability_comes_from_printed_columns(self):
        notes = json.loads(
            (self.out_dir / "data" / "v2" / "notes.json").read_text(encoding="utf-8")
        )["notes"]
        natural = next(
            note for note in notes
            if note["note_type"] == "source_footnote"
            and note["scope_value"] == "fund.sr.natural-resources"
        )
        self.assertEqual(
            (natural["fiscal_year_start"], natural["fiscal_year_end"]),
            (2022, 2025),
        )
        self.assertEqual(natural["text"], "Expenditures include transfers out to other funds")

        path = (
            self.out_dir / "public" / "downloads" / "series"
            / "fund.sr.natural-resources.csv"
        )
        with path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        by_year = {int(row["fiscal_year"]): row for row in rows}
        # FY2024/FY2025 canonical values come from the unstarred FY2026 book. These two
        # assertions fail if attachment is incorrectly derived from the chosen citation.
        for year in (2024, 2025):
            self.assertIn(natural["note_id"], by_year[year]["note_ids"].split(";"))

    def test_disjoint_source_years_do_not_borrow_citations(self):
        notes = json.loads(
            (self.out_dir / "data" / "v2" / "notes.json").read_text(encoding="utf-8")
        )["notes"]
        workers = [
            note for note in notes
            if note["note_type"] == "source_footnote"
            and note["scope_value"] == "isf.workers-compensation"
        ]
        self.assertEqual(len(workers), 2)
        earlier = next(note for note in workers if note["fiscal_year_end"] == 2015)
        later = next(note for note in workers if note["fiscal_year_start"] == 2022)
        self.assertEqual(earlier["source_ref"], "FY2014-15, p.37")
        self.assertEqual(later["source_ref"], "FY2024-25, p.35; FY2026, p.35")

    # -- specific published numbers (Step 2 verify checks) ----------------

    def test_dept_sheriff_series(self):
        page = self._load_page("dept.sheriff")
        self.assertEqual(page["primary_status_class"], "adopted")
        years = [p["fiscal_year"] for p in page["series"]]
        self.assertEqual(years, list(range(2004, 2027)))
        self.assertEqual(len(years), 23)
        last = page["series"][-1]
        self.assertEqual(last["fiscal_year"], 2026)
        self.assertEqual(last["value"], 80407123)
        self.assertEqual(last["citation"]["printed_page"], 57)
        self.assertEqual(last["citation"]["pdf_page"], 58)
        self.assertEqual(last["citation"]["source_code"], "FY2026")

    def test_ems_department_gap_and_break(self):
        page = self._load_page("dept.emergencymedicalservices")
        years = [p["fiscal_year"] for p in page["series"]]
        for gap_year in (2018, 2019, 2020, 2021):
            self.assertNotIn(gap_year, years)
        gap_breaks = [b for b in page["breaks"] if b["kind"] == "gap"]
        self.assertTrue(any(b["from_fy"] == 2018 and b["to_fy"] == 2021 for b in gap_breaks),
                         page["breaks"])
        parent_changes = [b for b in page["breaks"] if b["kind"] == "parent_change"]
        self.assertTrue(any(b["at_fy"] == 2022 for b in parent_changes), page["breaks"])

    def test_gf_revenue_panel_is_estimated_and_property_tax_value(self):
        gf = self._load_page("fund.general")
        self.assertEqual(gf["revenue_panel"]["status_class"], "estimated")
        self.assertEqual(gf["revenue_panel"]["entity_id"], "rev.total-estimated-financial-sources")

        rev = self._load_page("rev.property-taxes")
        self.assertEqual(rev["primary_status_class"], "estimated")
        fy2026 = next(p for p in rev["series"] if p["fiscal_year"] == 2026)
        self.assertEqual(fy2026["value"], 158487600)
        self.assertEqual(fy2026["status_class"], "estimated")

    def test_isf_excluded_from_total_and_fy2026_value(self):
        isf = self._load_page("fund.internal-service")
        self.assertIs(isf["excluded_from_total"], True)
        fy2026 = next(p for p in isf["series"] if p["fiscal_year"] == 2026)
        self.assertEqual(fy2026["value"], 56969595)

    def test_pages_under_64kb(self):
        oversized = []
        for path in self.pages_dir.glob("*.json"):
            size = path.stat().st_size
            if size >= 65536:
                oversized.append((path.name, size))
        self.assertEqual(oversized, [])

    def test_whole_budget_root_and_four_funds(self):
        root = self._load_page("budget.total")
        fy2026_total = next(p["value"] for p in root["series"] if p["fiscal_year"] == 2026)
        self.assertEqual(fy2026_total, 477233755)

        children = {c["entity_id"]: c["value"] for c in root["children_by_year"]["2026"]}
        self.assertEqual(children["fund.general"], 275141134)
        self.assertEqual(children["fund.special-revenue"], 133984290)
        self.assertEqual(children["fund.debt-service"], 34885734)
        self.assertEqual(children["fund.enterprise"], 33222597)
        self.assertEqual(sum(children.values()), fy2026_total)

    def test_v1_contract_stays_frozen_at_131_entities(self):
        """134 until 2026-07-22, when three duplicates were merged away.

        The county misprinted three department labels for a run of years — "Medical
        Examienr", "Non-Departmenatl", and "Public Works Administrator" — and the label map
        gave each its own entity. That split three continuous series in two and made the
        canonical page report "Not published" for years the county HAD published. Merging
        them is why this number moved; the verbatim labels still travel on each
        observation's citation.
        """
        entities = json.loads((self.out_dir / "data" / "entities.json").read_text(encoding="utf-8"))
        self.assertEqual(len(entities), 131)
        self.assertNotIn("balance.gf.beginning", {e["entity_id"] for e in entities})
        for merged_away in ("dept.medicalexamienr", "dept.nondepartmenatl",
                            "dept.publicworksadministrator"):
            self.assertNotIn(merged_away, {e["entity_id"] for e in entities})
        pages = list(self.pages_dir.glob("*.json"))
        self.assertEqual(len(pages), 131)

    def test_every_entity_page_has_a_series_download(self):
        """The download link on an entity page must never be a broken promise.

        This replaces a `len(series_csvs) == 134` assertion that used to live in the v1
        freeze test above. That count was a PROXY for "the v1 contract did not grow", and
        the two assertions left in that test check the same property directly, on the files
        the contract is actually about. What it could not check is the thing that matters
        to a reader: that the CSV behind the link exists. Forty-six v2 entities had a page
        and no file, and the proxy was structurally incapable of noticing — it passed
        precisely because they were missing.
        """
        v2_entities = json.loads(
            (self.out_dir / "data" / "v2" / "entities.json").read_text(encoding="utf-8"))
        series_dir = self.out_dir / "public" / "downloads" / "series"
        missing = [
            entity["entity_id"] for entity in v2_entities
            if not (series_dir / f"{entity['entity_id']}.csv").exists()
        ]
        self.assertEqual(missing, [], f"entity pages with no series CSV behind their link: {missing}")

    def test_reorganization_parents_follow_printed_sections(self):
        page = self._load_page("dept.propertymanagement")
        parents_2016 = {p["entity_id"] for p in page["parent_by_year"]["2016"]}
        parents_2024 = {p["entity_id"] for p in page["parent_by_year"]["2024"]}
        self.assertEqual(parents_2016, {"opcat.community-development-planning"})
        self.assertEqual(parents_2024, {"opcat.public-works"})

    def test_v2_manifest_and_full_entity_dimension(self):
        v2_dir = self.out_dir / "data" / "v2"
        manifest = json.loads((v2_dir / "manifest.json").read_text(encoding="utf-8"))
        entities = json.loads((v2_dir / "entities.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest, {
            # Exporter-owned sweep set for the Phase 3.1 rendered-coverage gate. The web
            # test derives the actual set from static HTML and requires these counts.
            "coverage_page_entity_count": 271,
            "coverage_page_route_count": 3945,
            # 6 county-overview scopes x 3 domains x 25 years. Every region the overview
            # renders states its coverage in every year, including the ones with nothing.
            "coverage_record_count": 450,
            # 180 until three misprinted-label duplicates were merged (2026-07-22).
            # Core entities plus source-faithful Special Revenue, Debt Service, and
            # Enterprise operating-budget lines.
            "entity_count": 283,
            "fiscal_year_max": 2026,
            "fiscal_year_min": 2002,
            # 207 structural relationships, 13 `succeeded_by` links added 2026-07-22,
            # and two evidence-backed cross-presentation links added by Phase 3.3
            # so a reader can follow a renamed line across the year the county changed what
            # it called it, less the 2 duplicate hierarchy edges removed the same day (each
            # was wholly contained in a broader edge for the same parent/child pair, and
            # counted its child twice in the parent's rollup).
            "relationship_count": 241,
            "schema_version": 2,
            "statement_count": 21,
            "statement_instance_count": 334,
        })
        # 175 before balance.gf.budget-to-gaap-adjustment (the term that makes FY2011-FY2017
        # reconcile) and the four fund-balance classification entities; 177 after three
        # misprinted-label duplicates were merged into their canonical lines.
        self.assertEqual(len(entities), 283)
        self.assertIn("balance.gf.beginning", {entity["entity_id"] for entity in entities})
        self.assertIn("overview.gf.law-enforcement", {entity["entity_id"] for entity in entities})

    def test_related_presentations_export_as_navigation_never_arithmetic(self):
        relationships = json.loads(
            (self.out_dir / "data" / "v2" / "relationships.json").read_text(encoding="utf-8")
        )
        by_id = {row["relationship_id"]: row for row in relationships}
        expected = {
            "related.sr-parks-presentations": (
                "fund.sr.parks-recreation-tourism",
                "use.sr.parks-recreation-tourism",
            ),
            "related.gf-public-works-presentations": (
                "overview.gf.public-works",
                "opcat.public-works",
            ),
        }
        for relationship_id, endpoints in expected.items():
            row = by_id[relationship_id]
            self.assertEqual(
                (row["from_entity_id"], row["to_entity_id"]), endpoints
            )
            self.assertEqual(row["relationship_type"], "related_to")
            self.assertEqual(row["traceability_level"], "documented_association")
            self.assertIs(row["is_additive"], False)
            self.assertEqual(row["source_code"], "FY2026")

    def test_pending_year_status_is_exported_from_curated_data(self):
        pending = json.loads(
            (self.out_dir / "data" / "v2" / "pending-years.json").read_text(encoding="utf-8")
        )
        self.assertEqual(pending, [{
            "adopted_on": "2026-06-16",
            "fiscal_year": 2027,
            "reason_not_ingested": "No consolidated final source located in the official publications checked.",
            "status_checked_on": "2026-09-06",
        }])

    def test_v2_required_fixture_entities_and_multi_status_series(self):
        expected = {
            "rev.property-taxes": ("estimated", 158487600),
            "balance.gf.ending": ("estimated", 75496072),
            "fin.gf.transfers-in": ("financing", 21414993),
            "fund.general": ("adopted", 275141134),
            "overview.gf.law-enforcement": ("adopted", 84673198),
            "dept.sheriff": ("adopted", 80407123),
        }
        for entity_id, (status_class, value) in expected.items():
            page = self._load_v2_page(entity_id)
            point = next(
                item for item in page["series"]
                if item["fiscal_year"] == 2026 and item["status_class"] == status_class
            )
            self.assertEqual(point["value"], value, msg=entity_id)
            self.assertIsNotNone(point["citation"], msg=entity_id)

        transfers_out = self._load_v2_page("fin.gf.transfers-out")
        fy2026 = {
            point["status_class"]: point["value"]
            for point in transfers_out["series"] if point["fiscal_year"] == 2026
        }
        self.assertEqual(fy2026, {"adopted": 8502046, "financing": -8502046})

    def test_v2_fy2026_statements_reconstruct_with_zero_delta(self):
        statements = json.loads(
            (self.out_dir / "data" / "v2" / "statements.json").read_text(encoding="utf-8")
        )
        fy2026_statements = [
            statement for statement in statements
            if any(item["fiscal_year"] == 2026 for item in statement["instances"])
        ]
        # 9 before gf.balance-composition; 10 before the Special Revenue and Debt cycles;
        # Enterprise adds separately reconciled funding and outflow statements.
        self.assertEqual(len(statements), 21)
        self.assertEqual(len(fy2026_statements), 18)
        for statement in fy2026_statements:
            instance = next(
                item for item in statement["instances"] if item["fiscal_year"] == 2026
            )
            self.assertEqual(instance["validation_status"], "reconciled")
            self.assertEqual(instance["signed_delta"], 0, msg=statement["statement_id"])
            for member in instance["members"]:
                if member["value"] is not None:
                    self.assertIsNotNone(member["citation"])

        by_id = {statement["statement_id"]: statement for statement in statements}
        other_revenue = next(
            item for item in by_id["gf.other-revenue-detail"]["instances"]
            if item["fiscal_year"] == 2026
        )
        self.assertEqual(other_revenue["signed_delta"], 0)
        self.assertEqual(
            sum(member["value"] for member in other_revenue["members"][:-1]),
            6772089,
        )
        transfer_out = next(
            item for item in by_id["gf.transfer-out-detail"]["instances"]
            if item["fiscal_year"] == 2026
        )
        self.assertEqual(transfer_out["signed_delta"], 0)
        self.assertEqual(
            sum(member["value"] for member in transfer_out["members"][:-1]),
            8502046,
        )

        transfer_in = next(
            item for item in by_id["gf.transfer-in-detail"]["instances"]
            if item["fiscal_year"] == 2026
        )
        self.assertEqual(transfer_in["signed_delta"], 0)
        self.assertEqual(
            sum(member["value"] for member in transfer_in["members"][:-1]),
            21414993,
        )

    def test_v2_keeps_budget_estimates_and_audited_results_separate(self):
        page = self._load_v2_page("balance.gf.ending")
        fy2025 = {
            point["status_class"]: point
            for point in page["series"] if point["fiscal_year"] == 2025
        }
        self.assertEqual(fy2025["estimated"]["value"], 58672589)
        self.assertEqual(fy2025["estimated"]["citation"]["source_code"], "FY2024-25")
        self.assertEqual(fy2025["actual"]["value"], 81545344)
        self.assertEqual(fy2025["actual"]["citation"]["source_code"], "FY2025-ACFR")

        statements = json.loads(
            (self.out_dir / "data" / "v2" / "statements.json").read_text(encoding="utf-8")
        )
        by_id = {statement["statement_id"]: statement for statement in statements}
        planned = next(
            item for item in by_id["gf.position"]["instances"]
            if item["fiscal_year"] == 2025
        )
        actual = next(
            item for item in by_id["gf.actual-position"]["instances"]
            if item["fiscal_year"] == 2025
        )
        self.assertEqual(planned["source_code"], "FY2024-25")
        self.assertEqual(actual["source_code"], "FY2025-ACFR")
        self.assertEqual(planned["signed_delta"], 0)
        self.assertEqual(actual["signed_delta"], 0)

    def test_v2_relationship_statement_and_coverage_downloads_exist(self):
        v2_downloads = self.out_dir / "public" / "downloads" / "v2"
        for filename in (
            "relationships.csv", "statements.csv", "statement-members.csv",
            "statement-instances.csv", "scope-coverage.csv",
        ):
            path = v2_downloads / filename
            self.assertTrue(path.exists(), filename)
            self.assertGreater(path.stat().st_size, 50, filename)

    def test_v2_fy2025_budget_actual_comparison_reconciles(self):
        path = (
            self.out_dir / "data" / "v2" / "comparisons"
            / "general-fund-fy2025-budget-actual.json"
        )
        comparison = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(comparison["fiscal_year"], 2025)
        self.assertEqual(comparison["source"]["source_code"], "FY2025-ACFR")
        self.assertEqual(
            sum(item["contribution"] for item in comparison["revenue_categories"]),
            23106856,
        )
        self.assertEqual(
            sum(item["contribution"] for item in comparison["spending_categories"]),
            -10070841,
        )

    def test_comparison_manifest_names_the_exported_row_groups(self):
        manifest = json.loads(
            (self.out_dir / "data" / "v2" / "comparisons" / "index.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            manifest["sections"],
            ["revenue_categories", "spending_categories"],
        )
        self.assertEqual(manifest["fiscal_years"], list(range(2011, 2026)))

    def test_download_note_reach_equals_declared_scope_in_both_directions(self):
        """Re-derive note reach without importing the exporter's implementation."""
        # The public registry is the declared contract for downloads. It contains both the
        # hand-authored caveats and source-footnote notes derived from reviewed source pages.
        with (
            self.out_dir / "public" / "downloads" / "data-notes.csv"
        ).open(newline="", encoding="utf-8") as fh:
            notes = list(csv.DictReader(fh))

        eligible_note_ids = set()
        seen_note_ids = set()
        checked_rows = 0
        families = {
            "tree": self.out_dir / "public" / "downloads" / "tree",
            "series": self.out_dir / "public" / "downloads" / "series",
            "comparisons": self.out_dir / "public" / "downloads" / "comparisons",
        }

        for family, directory in families.items():
            files = sorted(directory.glob("*.csv"))
            self.assertTrue(files, f"no generated {family} CSV files found")
            for path in files:
                with path.open(newline="", encoding="utf-8") as fh:
                    reader = csv.DictReader(fh)
                    self.assertIn("note_ids", reader.fieldnames or [], str(path))
                    rows = list(reader)
                self.assertTrue(rows, f"{path} has a header but no figure rows")

                for row in rows:
                    checked_rows += 1
                    if family == "tree":
                        fiscal_year = int(path.stem.rsplit("-", 1)[1])
                        entity_id = row["entity_id"]
                        series_kind = None
                        dataset = None
                        line = None
                    elif family == "series":
                        fiscal_year = int(row["fiscal_year"])
                        entity_id = path.stem
                        series_kind = (
                            "department"
                            if entity_id.startswith(("dept.", "opcat."))
                            else None
                        )
                        dataset = None
                        line = None
                    else:
                        fiscal_year = int(row["fiscal_year"])
                        entity_id = None
                        series_kind = None
                        dataset = "general_fund_budget_actual_comparison"
                        if path.name == "general-fund-totals-budget-actual.csv":
                            # Totals carry dataset/year notes, not category-line notes.
                            self.assertIn(row["measure"], {
                                "total_revenues", "total_expenditures", "transfers_in",
                                "transfers_out", "net_change",
                            })
                            self.assertIn("budget_printed_form", row)
                            self.assertIn("actual_printed_form", row)
                            line = None
                        else:
                            line = row["canonical_key"]

                    expected = set()
                    for note in notes:
                        note_status = note.get("status_class", "").strip()
                        if note_status and note_status != row.get("status_class"):
                            continue
                        start = note["fiscal_year_start"].strip()
                        end = note["fiscal_year_end"].strip()
                        if start and fiscal_year < int(start):
                            continue
                        if end and fiscal_year > int(end):
                            continue

                        scope_type = note["scope_type"].strip()
                        scope_value = note["scope_value"].strip()
                        printed_forms = {value for value in scope_value.split(";") if value}
                        reaches = {
                            "fiscal_year": True,
                            "series": bool(scope_value and scope_value == series_kind),
                            "entity": bool(scope_value and scope_value == entity_id),
                            "dataset": bool(scope_value and scope_value == dataset),
                            "line": bool(scope_value and scope_value == line),
                            "printed_form": any(
                                row.get(column) in printed_forms
                                for column in (
                                    "printed_form", "budget_printed_form", "actual_printed_form",
                                )
                            ),
                        }.get(scope_type)
                        self.assertIsNotNone(
                            reaches,
                            f"test reach is undefined for {note['note_id']} ({scope_type})",
                        )
                        if reaches:
                            expected.add(note["note_id"])

                    actual = {value for value in row["note_ids"].split(";") if value}
                    eligible_note_ids.update(expected)
                    seen_note_ids.update(actual)
                    self.assertEqual(
                        actual,
                        expected,
                        f"{path.relative_to(self.out_dir)} row {row}",
                    )

        self.assertGreater(checked_rows, 5000, "the gate did not sweep the real artifact set")
        self.assertEqual(seen_note_ids, eligible_note_ids)


class SearchPreviewTests(unittest.TestCase):
    """The search index's answer previews (plan Step 5, cold review finding R3).

    A result list of names sends a resident to three pages to learn which "transfers" line
    is the big one; the preview puts a figure in the result. The properties that keep that
    honest are all about what the preview must NOT do: invent a current year for a line
    that stopped being published, choose between two published bases, or show a headcount
    where a reader expects dollars.
    """

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        tmp_root = Path(cls._tmp.name)
        conn = sqlite3.connect(_real_db_path(tmp_root))
        out_dir = tmp_root / "web"
        export_app(conn, out_dir)
        conn.close()
        cls.index = json.loads(
            (out_dir / "data" / "v2" / "search-index.json").read_text(encoding="utf-8")
        )
        cls.by_id = {entry["entity_id"]: entry for entry in cls.index}

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_current_year_entity_previews_the_current_year(self):
        preview = self.by_id["dept.sheriff"]["preview"]
        self.assertEqual(preview["fiscal_year"], 2026)
        self.assertFalse(preview["is_latest"])
        self.assertEqual(
            preview["observations"], [
                {"printed_form": None, "status_class": "adopted", "value": 80407123}
            ]
        )

    def test_every_search_entry_has_a_type_qualifier_and_departments_have_a_parent(self):
        self.assertEqual(len(self.index), 283)
        for entry in self.index:
            self.assertTrue(entry["entity_type"], entry["entity_id"])
            self.assertTrue(entry["qualifier"], entry["entity_id"])
            if entry["entity_type"] == "department":
                self.assertTrue(entry["parent_label"], entry["entity_id"])
            else:
                self.assertIsNone(entry["parent_label"], entry["entity_id"])

    def test_historical_entity_is_flagged_as_latest_not_current(self):
        # EMS was its own operating category only FY2018-FY2021. Its last figure shown
        # without a qualifier reads as this year's EMS budget.
        preview = self.by_id["opcat.emergency-medical-services"]["preview"]
        self.assertTrue(preview["is_latest"])
        self.assertLess(preview["fiscal_year"], 2026)

    def test_parallel_statuses_are_both_kept(self):
        # The R3 case, and it is real rather than hypothetical: FY2026 transfers out is
        # published both as an adopted amount and as a signed financing line.
        preview = self.by_id["fin.gf.transfers-out"]["preview"]
        statuses = [obs["status_class"] for obs in preview["observations"]]
        self.assertEqual(len(statuses), len(set(statuses)), "one row per status")
        self.assertGreater(len(statuses), 1)
        self.assertIn("adopted", statuses)

    def test_every_preview_year_actually_has_those_observations(self):
        # The preview is a claim about a specific entity-year. If it can drift from the
        # entity's own page, a search result and the page it links to would disagree.
        for entry in self.index:
            preview = entry.get("preview")
            if not preview:
                continue
            page = json.loads(
                (
                    Path(self._tmp.name) / "web" / "data" / "v2" / "pages"
                    / f"{entry['entity_id']}.json"
                ).read_text(encoding="utf-8")
            )
            on_page = {
                (point["status_class"], point["value"])
                for point in page["series"]
                if point["fiscal_year"] == preview["fiscal_year"]
                and point["measure_type"] == "dollars"
            }
            for observation in preview["observations"]:
                self.assertIn(
                    (observation["status_class"], observation["value"]),
                    on_page,
                    f"{entry['entity_id']} FY{preview['fiscal_year']}",
                )

    def test_no_preview_is_emitted_empty(self):
        for entry in self.index:
            preview = entry.get("preview")
            if preview is not None:
                self.assertTrue(preview["observations"], entry["entity_id"])

    def test_is_latest_is_false_only_for_the_current_year(self):
        current = max(
            entry["preview"]["fiscal_year"]
            for entry in self.index
            if entry.get("preview")
        )
        for entry in self.index:
            preview = entry.get("preview")
            if not preview:
                continue
            self.assertEqual(
                preview["is_latest"],
                preview["fiscal_year"] != current,
                entry["entity_id"],
            )


class NullPreservationFixtureTests(unittest.TestCase):
    """A focused in-memory fixture (production data has zero disputed/null
    canonical_value rows today) to prove the exporter never coerces a NULL
    canonical value to 0, and omits citation/reconciliation cleanly when
    there is nothing to cite."""

    def _export_fixture(self, conn, out_dir):
        # Source-footnote resolution is a production-data contract covered by the
        # real-database tests above. This deliberately tiny fixture has no label_map
        # corpus, so keep that unrelated global input out of its null-value test.
        with patch(
            "scripts.production.export_app._source_footnote_notes",
            return_value=[],
        ):
            return export_app(conn, out_dir)

    def _seed(self, conn):
        create_schema(conn)
        conn.executescript(
            "INSERT INTO status_class(status_class) VALUES('adopted');"
            "INSERT INTO entity(entity_id,entity_type,canonical_name) VALUES"
            "('budget.total','whole_budget','Total Budget'),"
            "('e.parent','fund_type','Parent'),('e.child','department','Child');"
            "INSERT INTO hierarchy_edge(parent_entity_id,child_entity_id,relationship) VALUES"
            "('budget.total','e.parent','contains'),"
            "('e.parent','e.child','contains');"
            "INSERT INTO source(source_code,publication_order) VALUES('S1',1);"
            "INSERT INTO observation(observation_id,fiscal_year,value,measure_type,status,"
            "status_class,original_label,source_code,printed_page,pdf_page,source_url,"
            "source_dataset,source_row_ordinal) VALUES"
            "('o1',2010,500,'dollars','ADOPTED BUDGET','adopted','Parent','S1',1,1,'http://x','d',0);"
            "INSERT INTO canonical_value(entity_id,fiscal_year,status_class,measure_type,value,"
            "canonical_status,chosen_observation_id) VALUES"
            "('e.parent',2010,'adopted','dollars',500,'single','o1'),"
            "('e.parent',2011,'adopted','dollars',NULL,'disputed',NULL);"
        )

    def test_disputed_null_value_is_preserved_never_zero(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        self._seed(conn)
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp) / "web"
            self._export_fixture(conn, out_dir)
            page = json.loads((out_dir / "data" / "pages" / "e.parent.json").read_text(encoding="utf-8"))
            points = {p["fiscal_year"]: p for p in page["series"]}
            self.assertEqual(points[2010]["value"], 500)
            self.assertIsNotNone(points[2010]["citation"])
            self.assertIn(2011, points, "disputed row with NULL value must still appear as a series point")
            self.assertIsNone(points[2011]["value"])
            self.assertNotEqual(points[2011]["value"], 0)
            self.assertIsNone(points[2011]["citation"])

    def test_child_with_no_value_that_year_is_null_not_zero(self):
        conn = sqlite3.connect(":memory:")
        self.addCleanup(conn.close)
        self._seed(conn)
        # e.child has no canonical_value rows at all -- it is still edge-active
        # every year (unbounded edge), so it must appear with value=null.
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp) / "web"
            self._export_fixture(conn, out_dir)
            parent_page = json.loads((out_dir / "data" / "pages" / "e.parent.json").read_text(encoding="utf-8"))
            child_2010 = next(c for c in parent_page["children_by_year"]["2010"] if c["entity_id"] == "e.child")
            self.assertIsNone(child_2010["value"])


class PrimaryStatusClassTests(unittest.TestCase):
    def test_revenue_types_are_estimated(self):
        self.assertEqual(primary_status_class("revenue_category"), "estimated")
        self.assertEqual(primary_status_class("revenue_total"), "estimated")

    def test_other_types_are_adopted(self):
        for t in ("department", "operating_category", "fund", "fund_type",
                  "program", "whole_budget", "general_fund_total"):
            self.assertEqual(primary_status_class(t), "adopted")


if __name__ == "__main__":
    unittest.main()


class NotesTravelWithDownloadsTests(unittest.TestCase):
    """Plan Phase 1 step 7: "a downloaded FY2012 CSV carries its OCR note".

    That criterion was satisfied by shipping a separate `data-notes.csv` and one advisory
    sentence on the downloads index, which is not what it says and not what it is for. The
    scenario it exists to prevent (cold review R3) is someone downloading a series, plotting
    it, seeing a step, and publishing a conclusion attributed to this site. Only a note
    reference IN the file reaches that person.
    """

    @classmethod
    def setUpClass(cls):
        cls.downloads = ROOT / "web" / "public" / "downloads"
        if not cls.downloads.exists():
            raise unittest.SkipTest("run scripts.production.export_app first")

    def _rows(self, relative_path):
        with (self.downloads / relative_path).open(newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))

    def test_fy2012_comparison_csv_carries_its_extraction_note(self):
        rows = self._rows("comparisons/general-fund-fy2012-budget-actual.csv")
        self.assertTrue(rows, "FY2012 comparison CSV is empty or missing")
        for row in rows:
            self.assertIn("note.fy2012-extraction", row["note_ids"])

    def test_department_series_csv_carries_the_fy2006_break(self):
        rows = {r["fiscal_year"]: r for r in self._rows("series/dept.sheriff.csv")}
        self.assertIn("note.fy2006-benefits-into-departments", rows["2006"]["note_ids"])
        self.assertIn("note.fy2013-reorganisation", rows["2013"]["note_ids"])

    def test_scoped_notes_do_not_leak_onto_unrelated_series(self):
        rows = {r["fiscal_year"]: r for r in self._rows("series/rev.property-taxes.csv")}
        self.assertNotIn("note.fy2006-benefits-into-departments", rows["2006"]["note_ids"])
        self.assertNotIn("note.fy2013-reorganisation", rows["2013"]["note_ids"])

    def test_whole_budget_tree_csv_carries_its_citations(self):
        # The downloads page claims every row names its source document and printed page.
        # This is the first file that page lists.
        rows = self._rows("tree/whole-budget-2026.csv")
        self.assertTrue(rows)
        for row in rows:
            if row["value"] == "":
                continue
            self.assertTrue(row["source_code"], f"{row['entity_id']} has a value but no source")
            self.assertTrue(row["source_url"], f"{row['entity_id']} has a value but no source URL")
