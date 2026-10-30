#!/usr/bin/env python3
"""Load the interpretation dimensions: sources, coverage, and curated crosswalk.

Only human-confirmed/edited label mappings are loaded into the build database.
Every observation label lacking a confirmed mapping is reported (never dropped),
and candidate clusters are written for human review.
"""

from __future__ import annotations

import csv
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from scripts.production.ingest import _int_or_none
from scripts.production.labels import cluster_labels
from scripts.production.statusclass import distinct_classes

_FY = re.compile(r"FY(\d{4})")

# SQL predicate matching an observation ``o`` to a confirmed label_map row ``lm``.
# Shared by unmapped detection here and by build_canonical, so both resolve
# observations to entities identically. Only confirmed rows are ever loaded.
CONFIRMED_MATCH_SQL = """
    lm.original_label = o.original_label
    AND (
        lm.match_scope = 'label'
        OR (lm.match_scope = 'label+section' AND lm.table_section IS o.table_section)
        OR (lm.match_scope = 'label+section+category'
            AND lm.table_section IS o.table_section
            AND lm.raw_operating_category IS o.raw_operating_category)
        OR (lm.match_scope = 'label+section+source'
            AND lm.table_section IS o.table_section
            AND lm.source_code IS o.source_code)
    )
    AND (lm.effective_from_fy IS NULL OR o.fiscal_year >= lm.effective_from_fy)
    AND (lm.effective_to_fy IS NULL OR o.fiscal_year <= lm.effective_to_fy)
"""

_COVERAGE_DATASET_COL = {
    "whole_budget_rows": "whole-budget-major-funds",
    "general_fund_overview_rows": "general-fund-operating-categories-and-transfers",
    "general_fund_department_rows": "general-fund-department-appropriations",
    "special_revenue_rows": "named-special-revenue-funds",
    "broad_revenue_rows": "general-fund-broad-revenues",
    "balance_financing_rows": "general-fund-balances-and-financing",
}


@dataclass
class DimensionReport:
    unmapped_count: int = 0
    confirmed_label_maps: list = field(default_factory=list)
    candidate_entities: list = field(default_factory=list)


def load_sources(conn, registry_path: Path, extension_path: Path | None = None) -> None:
    """Load the official-source registry, one row per code, with a parsed order.

    ``INDEX`` is skipped (discovery-only, referenced by no observation). Codes
    that appear twice (Budget Highlights + General Fund Part 1) collapse to one
    ``source`` row. ``publication_order`` is the leading fiscal year in the code.
    """
    seen: set[str] = set()
    paths = [registry_path]
    # Sources for years modelled after the blind extraction was frozen. Kept in a separate
    # file so the frozen registry is never edited; the frozen one is read first and wins.
    if extension_path is not None and extension_path.exists():
        paths.append(extension_path)
    for path in paths:
        with path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                code = r["source_code"]
                if code == "INDEX" or code in seen:
                    continue
                seen.add(code)
                m = _FY.search(code)
                order = int(m.group(1)) if m else None
                conn.execute(
                    "INSERT OR IGNORE INTO source"
                    "(source_code, document_title_version, official_url, role, "
                    "publication_order) VALUES (?,?,?,?,?)",
                    (code, r["document_title_version"], r["official_url"], r["role"], order),
                )
    conn.commit()


def load_coverage(conn, coverage_path: Path) -> None:
    """Load the fiscal-year coverage matrix, marking each dataset's detail gaps."""
    with coverage_path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            fy = int(r["fiscal_year"])
            note = (r.get("coverage_note") or "").strip() or None
            for col, dataset in _COVERAGE_DATASET_COL.items():
                rows = _int_or_none(r.get(col)) or 0
                has_detail = 1 if rows > 0 else 0
                gap_note = note if has_detail == 0 else None
                conn.execute(
                    "INSERT OR IGNORE INTO coverage(fiscal_year, dataset, has_detail, gap_note) "
                    "VALUES (?,?,?,?)",
                    (fy, dataset, has_detail, gap_note),
                )
    # Reflect department detail recovered from image tables after the frozen matrix.
    for (fy,) in conn.execute(
        "SELECT DISTINCT fiscal_year FROM observation "
        "WHERE source_dataset='fy2022-2023-general-fund-appropriations'"
    ).fetchall():
        conn.execute(
            "UPDATE coverage SET has_detail=1, gap_note=? "
            "WHERE fiscal_year=? AND dataset='general-fund-department-appropriations'",
            ("Recovered from the embedded image table via vision transcription", fy),
        )
    conn.commit()


def _load_entities(conn, path: Path) -> None:
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT OR IGNORE INTO entity"
                "(entity_id, entity_type, canonical_name, common_aliases, "
                "plain_language_description, restriction_note, active_from_fy, active_to_fy) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (
                    r["entity_id"], r["entity_type"], r["canonical_name"],
                    r.get("common_aliases") or None,
                    r.get("plain_language_description") or None,
                    r.get("restriction_note") or None,
                    _int_or_none(r.get("active_from_fy")),
                    _int_or_none(r.get("active_to_fy")),
                ),
            )


def _load_entity_accounting(conn, defaults_path: Path, overrides_path: Path) -> None:
    """Load controlled type defaults and materialize one accounting row per entity."""
    defaults: dict[str, dict] = {}
    with defaults_path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            defaults[r["entity_type"]] = r
            conn.execute(
                "INSERT INTO entity_type_accounting"
                "(entity_type, accounting_role, value_semantics, normal_sign, "
                "included_in_scope_total_default) VALUES (?,?,?,?,?)",
                (
                    r["entity_type"], r["accounting_role"], r["value_semantics"],
                    r["normal_sign"], r["included_in_scope_total_default"],
                ),
            )

    overrides: dict[str, dict] = {}
    with overrides_path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            overrides[r["entity_id"]] = r

    for entity_id, entity_type in conn.execute(
        "SELECT entity_id, entity_type FROM entity ORDER BY entity_id"
    ).fetchall():
        if entity_type not in defaults:
            raise ValueError(f"entity type lacks accounting defaults: {entity_type}")
        base = defaults[entity_type]
        override = overrides.get(entity_id, {})
        values = tuple(
            (override.get(field) or base[default_field])
            for field, default_field in (
                ("accounting_role", "accounting_role"),
                ("value_semantics", "value_semantics"),
                ("normal_sign", "normal_sign"),
                ("included_in_scope_total", "included_in_scope_total_default"),
            )
        )
        conn.execute(
            "INSERT INTO entity_accounting"
            "(entity_id, accounting_role, value_semantics, normal_sign, "
            "included_in_scope_total) VALUES (?,?,?,?,?)",
            (entity_id, *values),
        )


def _load_relationships(conn, path: Path) -> None:
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT INTO entity_relationship"
                "(relationship_id, from_entity_id, to_entity_id, relationship_type, "
                "traceability_level, is_additive, effective_from_fy, effective_to_fy, "
                "restriction_note, relationship_note, source_code) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    r["relationship_id"], r["from_entity_id"], r["to_entity_id"],
                    r["relationship_type"], r["traceability_level"],
                    1 if r["is_additive"].strip().lower() in ("1", "true", "yes") else 0,
                    _int_or_none(r.get("effective_from_fy")),
                    _int_or_none(r.get("effective_to_fy")),
                    r.get("restriction_note") or None,
                    r.get("relationship_note") or None,
                    r.get("source_code") or None,
                ),
            )


def _load_statements(conn, data_dir: Path) -> None:
    with (data_dir / "accounting_statement.csv").open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT INTO accounting_statement"
                "(statement_id, canonical_name, scope_entity_id, statement_type, "
                "effective_from_fy, effective_to_fy, statement_note) VALUES (?,?,?,?,?,?,?)",
                (
                    r["statement_id"], r["canonical_name"], r["scope_entity_id"],
                    r["statement_type"], _int_or_none(r.get("effective_from_fy")),
                    _int_or_none(r.get("effective_to_fy")), r.get("statement_note") or None,
                ),
            )
    with (data_dir / "statement_member.csv").open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT INTO statement_member"
                "(statement_id, entity_id, member_role, display_order, arithmetic_sign, "
                "subtotal_group, status_class, is_required, effective_from_fy, "
                "effective_to_fy) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    r["statement_id"], r["entity_id"], r["member_role"],
                    int(r["display_order"]), int(r["arithmetic_sign"]),
                    r.get("subtotal_group") or None, r.get("status_class") or None,
                    1 if r["is_required"].strip().lower() in ("1", "true", "yes") else 0,
                    _int_or_none(r.get("effective_from_fy")),
                    _int_or_none(r.get("effective_to_fy")),
                ),
            )
    with (data_dir / "statement_instance.csv").open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            for fiscal_year in range(int(r["effective_from_fy"]), int(r["effective_to_fy"]) + 1):
                conn.execute(
                    "INSERT INTO statement_instance"
                    "(statement_id, fiscal_year, source_code, status_class, "
                    "validation_status, validation_note) VALUES (?,?,?,?,?,?)",
                    (
                        r["statement_id"], fiscal_year, r["source_code"],
                        r.get("status_class") or None, r["validation_status"],
                        r.get("validation_note") or None,
                    ),
                )


def _load_entity_presentation(conn, path: Path) -> None:
    """Resident-facing display names, separate from the source-faithful canonical ones.

    The county prints most department labels in full capitals, and a few carry OCR damage
    ("SOIL A ND WA TER") or a typo ("ENG,-PAVING/DRAINAGE"). Neither is how a resident
    should be asked to read them, and neither can be fixed by lower-casing the canonical
    name in the app: a naive title-case would also destroy acronyms, and a TypeScript-only
    override map would never reach the Python-generated search index, recreating the exact
    drift this table exists to prevent (cold review finding R5).

    So the display layer is DATA, loaded once here and exported to every artifact that
    renders a name. The canonical name, the verbatim printed label, the citations and the
    downloads are untouched.

    Validated on three properties. The key must resolve to a real entity, or a renamed
    entity would silently keep its old label. The key must be unique, or two rows would
    fight over one entity. The value must be non-empty, since a blank display name would
    render as a nameless row.

    Display VALUES are deliberately not required to be unique. Greenville printed two
    distinct departments under the identical label "PLANNING AND CODE COMPLIANCE" in
    FY2014-15; forcing those apart would mean inventing a distinction the source does not
    make, which is worse than repeating what it says.
    """
    if not path.exists():
        return
    seen: set[str] = set()
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            entity_id = (r.get("entity_id") or "").strip()
            display_name = (r.get("display_name") or "").strip()
            if not display_name:
                raise ValueError(
                    f"entity_presentation.csv: empty display_name for {entity_id!r}. "
                    "Remove the row rather than blanking it."
                )
            if entity_id in seen:
                raise ValueError(
                    f"entity_presentation.csv: {entity_id!r} appears more than once."
                )
            seen.add(entity_id)
            exists = conn.execute(
                "SELECT 1 FROM entity WHERE entity_id=?", (entity_id,)
            ).fetchone()
            if not exists:
                raise ValueError(
                    f"entity_presentation.csv: {entity_id!r} is not an entity. A display "
                    "name for an entity that does not exist means a rename went unnoticed."
                )
            conn.execute(
                "INSERT INTO entity_presentation(entity_id, display_name) VALUES (?,?)",
                (entity_id, display_name),
            )


def _load_scope_coverage(conn, path: Path) -> None:
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT INTO scope_coverage"
                "(scope_entity_id, domain, fiscal_year, coverage_level, status_classes, "
                "gap_note, source_code) VALUES (?,?,?,?,?,?,?)",
                (
                    r["scope_entity_id"], r["domain"], int(r["fiscal_year"]),
                    r["coverage_level"], r.get("status_classes") or None,
                    r.get("gap_note") or None, r.get("source_code") or None,
                ),
            )


def _load_label_maps(conn, path: Path) -> list[dict]:
    confirmed: list[dict] = []
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["review_status"] not in ("human_confirmed", "human_edited"):
                continue
            conn.execute(
                "INSERT INTO label_map"
                "(original_label, match_scope, table_section, raw_operating_category, "
                "source_code, entity_id, "
                "effective_from_fy, effective_to_fy, mapping_note, review_status) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    r["original_label"], r["match_scope"],
                    r.get("table_section") or None,
                    r.get("raw_operating_category") or None,
                    r.get("source_code") or None,
                    r["entity_id"],
                    _int_or_none(r.get("effective_from_fy")),
                    _int_or_none(r.get("effective_to_fy")),
                    r.get("mapping_note") or None, r["review_status"],
                ),
            )
            confirmed.append(r)
    return confirmed


def _load_edges(conn, path: Path) -> None:
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            conn.execute(
                "INSERT INTO hierarchy_edge"
                "(parent_entity_id, child_entity_id, relationship, "
                "effective_from_fy, effective_to_fy, edge_note) VALUES (?,?,?,?,?,?)",
                (
                    r["parent_entity_id"], r["child_entity_id"], r["relationship"],
                    _int_or_none(r.get("effective_from_fy")),
                    _int_or_none(r.get("effective_to_fy")),
                    r.get("edge_note") or None,
                ),
            )


def _migrate_hierarchy_relationships(conn) -> None:
    """Mirror legacy hierarchy edges into the generalized relationship model.

    ``hierarchy_edge`` remains the rollup source during the lossless migration.
    The deterministic relationship ID is content-addressed, so CSV reordering
    cannot change identity and overlapping year-scoped edges remain distinct.
    """
    rows = conn.execute(
        "SELECT parent_entity_id, child_entity_id, relationship, "
        "effective_from_fy, effective_to_fy, edge_note "
        "FROM hierarchy_edge ORDER BY parent_entity_id, child_entity_id, relationship, "
        "effective_from_fy, effective_to_fy, edge_note"
    ).fetchall()
    for parent, child, relationship, from_fy, to_fy, note in rows:
        identity = "|".join(
            "" if value is None else str(value)
            for value in (parent, child, relationship, from_fy, to_fy, note)
        )
        relationship_id = "hierarchy." + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
        conn.execute(
            "INSERT INTO entity_relationship"
            "(relationship_id, from_entity_id, to_entity_id, relationship_type, "
            "traceability_level, is_additive, effective_from_fy, effective_to_fy, "
            "relationship_note) VALUES (?,?,?,?,?,?,?,?,?)",
            (
                relationship_id, parent, child, relationship, "structural",
                1 if relationship == "contains" else 0, from_fy, to_fy, note,
            ),
        )


def _write_reports(conn, reports_dir: Path) -> tuple[int, list[dict]]:
    reports_dir.mkdir(parents=True, exist_ok=True)
    unmapped = conn.execute(
        f"""
        SELECT o.observation_id, o.original_label, o.table_section,
               o.source_dataset, o.fiscal_year
        FROM observation o
        WHERE NOT EXISTS (SELECT 1 FROM label_map lm WHERE {CONFIRMED_MATCH_SQL})
        """
    ).fetchall()
    cols = ["observation_id", "original_label", "table_section", "source_dataset", "fiscal_year"]
    unmapped_rows = [dict(zip(cols, r)) for r in unmapped]

    with (reports_dir / "unmapped-labels.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["source_dataset", "original_label", "occurrences"])
        counts: dict[tuple[str, str], int] = {}
        for r in unmapped_rows:
            counts[(r["source_dataset"], r["original_label"])] = counts.get(
                (r["source_dataset"], r["original_label"]), 0) + 1
        for (ds, lab), n in sorted(counts.items()):
            w.writerow([ds, lab, n])

    entities, label_maps = cluster_labels(unmapped_rows)
    with (reports_dir / "entity.candidates.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["entity_id", "entity_type", "canonical_name", "review_status"])
        w.writeheader()
        w.writerows(entities)
    with (reports_dir / "label_map.candidates.csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["original_label", "match_scope", "entity_id", "review_status"])
        w.writeheader()
        w.writerows(label_maps)

    return len(unmapped_rows), entities


def load_status_classes(conn, data_dir: Path) -> None:
    """Populate the status_class vocabulary table from the curated CSV."""
    for c in distinct_classes(data_dir / "status_class.csv"):
        conn.execute(
            "INSERT OR IGNORE INTO status_class(status_class, is_comparable_group, display_label) "
            "VALUES (?,?,?)",
            (c["status_class"], c["is_comparable_group"], c["display_label"]),
        )
    conn.commit()


def load_dimensions(conn, data_dir: Path, blind_dir: Path, reports_dir: Path) -> DimensionReport:
    """Load curated entities/label maps/edges and report unmapped labels."""
    load_status_classes(conn, data_dir)
    _load_entities(conn, data_dir / "entity.csv")
    _load_entity_accounting(
        conn,
        data_dir / "entity_type_accounting.csv",
        data_dir / "entity_accounting_override.csv",
    )
    confirmed = _load_label_maps(conn, data_dir / "label_map.csv")
    _load_edges(conn, data_dir / "hierarchy_edge.csv")
    _migrate_hierarchy_relationships(conn)
    _load_relationships(conn, data_dir / "entity_relationship.csv")
    _load_statements(conn, data_dir)
    _load_scope_coverage(conn, data_dir / "scope_coverage.csv")
    _load_entity_presentation(conn, data_dir / "entity_presentation.csv")
    conn.commit()
    unmapped_count, candidate_entities = _write_reports(conn, reports_dir)
    return DimensionReport(
        unmapped_count=unmapped_count,
        confirmed_label_maps=confirmed,
        candidate_entities=candidate_entities,
    )
