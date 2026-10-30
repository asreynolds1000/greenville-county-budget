#!/usr/bin/env python3
"""Export the production database into git-committable app data.

Second stage after the pipeline, run separately and additively:

    python3 -m scripts.production.pipeline && python3 -m scripts.production.export_app

Reads ``dist/gc_budget.sqlite`` (already built by ``scripts.production.pipeline``)
and writes deterministic, sorted-key JSON into ``web/data/`` plus per-view CSVs
into ``web/public/downloads/``, both git-tracked. This module never touches
``dist/`` and is not wired into ``run_pipeline`` -- the existing five-stage
contract is untouched.

Determinism (the app's build never re-derives these numbers, so they must be
byte-identical across machines and runs): every JSON file is written with
``sort_keys=True, ensure_ascii=False, separators=(",", ":")`` plus exactly one
trailing newline; every CSV is opened with ``newline="\\n"`` and rows are
written in an explicitly sorted order. Dollar amounts are always integers.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from pathlib import Path

from scripts.production.dimensions import CONFIRMED_MATCH_SQL

_ROOT = Path(__file__).resolve().parents[2]

_MEASURE = "dollars"
_REVENUE_ENTITY_TYPES = {"revenue_category", "revenue_total"}
_REVENUE_STATUS = "estimated"
_DEFAULT_STATUS = "adopted"
_WHOLE_BUDGET_ENTITY = "budget.total"
_GF_FUND_ENTITY = "fund.general"
_GF_EXPENDITURES_ENTITY = "gf.expenditures"
_GF_REVENUE_ROOT_ENTITY = "rev.total-estimated-financial-sources"
_ISF_ENTITY = "fund.internal-service"
_COVERAGE_FUND_GROUP_IDS = {
    "fund.special-revenue",
    "fund.debt-service",
    "fund.enterprise",
    "fund.internal-service",
}
_COVERAGE_ACCOUNTING_ROLES = {
    "revenue",
    "financing_in",
    "beginning_position",
    "ending_position",
    "net_position_change",
    "position_adjustment",
    "position_component",
    "operating_use",
    "financing_out",
    "net_financing",
    "container",
    "scope_total",
}

# The v1 application contract is intentionally frozen while the sources/funds/
# uses v2 exporter is built. New balance, financing, and use-total entities can
# carry multiple status-class series and statement memberships that v1 cannot
# represent honestly; exclude them instead of silently choosing one status.
_V1_ENTITY_TYPES = {
    "whole_budget",
    "fund_type",
    "fund",
    "general_fund_total",
    "operating_category",
    "department",
    "program",
    "revenue_total",
    "revenue_category",
}


def primary_status_class(entity_type: str) -> str:
    """The status class a page's own cross-year ``series`` is built from.

    Revenue entities print an ``estimated`` series FY2006-26 (adopted only in
    FY2004-05); everything else -- funds, operating categories, departments,
    ISF programs, the whole-budget root -- is an ``adopted`` product.
    """
    return _REVENUE_STATUS if entity_type in _REVENUE_ENTITY_TYPES else _DEFAULT_STATUS


def _edge_active(edge: dict, fy: int) -> bool:
    from_fy, to_fy = edge["from_fy"], edge["to_fy"]
    return (from_fy is None or fy >= from_fy) and (to_fy is None or fy <= to_fy)


# --------------------------------------------------------------------------
# Loading (one pass per table; everything downstream reads these in-memory
# indexes rather than re-querying the database).
# --------------------------------------------------------------------------

def _display_names(conn) -> dict[str, str]:
    """Curated resident-facing labels, keyed by entity id (plan Step 6).

    Exported alongside the canonical name rather than replacing it, so provenance,
    downloads and citations keep the county's own printed wording while the interface can
    show "Sheriff" instead of "SHERIFF". One source feeds both the entity pages and the
    search index; a TypeScript-side map would reach only the former.
    """
    return dict(conn.execute("SELECT entity_id, display_name FROM entity_presentation"))


def _load_entities(conn) -> dict[str, dict]:
    entities: dict[str, dict] = {}
    display = _display_names(conn)
    # V1's revenue panel is specifically the General Fund revenue hierarchy. A type-only
    # allowlist was sufficient until Special Revenue gained its own revenue entities; at
    # that point six truthful v2 entities silently enlarged the frozen v1 contract. Keep
    # only the revenue root and descendants the v1 UI actually knows how to describe.
    v1_revenue_ids = {
        row[0]
        for row in conn.execute(
            "WITH RECURSIVE gf_revenue(entity_id) AS ("
            "SELECT ? UNION SELECT he.child_entity_id FROM hierarchy_edge he "
            "JOIN gf_revenue parent ON he.parent_entity_id=parent.entity_id"
            ") SELECT entity_id FROM gf_revenue",
            (_GF_REVENUE_ROOT_ENTITY,),
        )
    }
    for (entity_id, entity_type, canonical_name, common_aliases,
         plain_language_description, restriction_note, active_from_fy, active_to_fy) in conn.execute(
        "SELECT entity_id, entity_type, canonical_name, common_aliases, "
        "plain_language_description, restriction_note, active_from_fy, active_to_fy FROM entity"
    ):
        if entity_type not in _V1_ENTITY_TYPES:
            continue
        if entity_type in _REVENUE_ENTITY_TYPES and entity_id not in v1_revenue_ids:
            continue
        entities[entity_id] = {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "canonical_name": canonical_name,
            "display_name": display.get(entity_id),
            "common_aliases": common_aliases.split("; ") if common_aliases else [],
            "plain_language_description": plain_language_description,
            "restriction_note": restriction_note,
            "active_from_fy": active_from_fy,
            "active_to_fy": active_to_fy,
        }
    return entities


def _archive_urls() -> dict[str, dict]:
    """Wayback snapshot per source document, where one exists.

    The provenance chain is the product: every figure on this site cites a page in a county
    PDF. County websites reorganise, and when this one does, 2,600 pages of citations become
    dead links with nothing behind them. A snapshot is the fallback, and it is deliberately
    a THIRD-PARTY one — "the Internet Archive captured this on 2022-08-12" is stronger
    provenance than a copy we host ourselves, and it carries a date, which a copy does not.
    """
    path = _ROOT / "data" / "production" / "source_archive_urls.csv"
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            url = (row.get("archive_url") or "").strip()
            if url:
                out[row["source_code"].strip()] = {
                    "archive_url": url,
                    "archived_on": (row.get("archived_on") or "").strip() or None,
                }
    return out


def _load_sources(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT source_code, document_title_version, official_url, role, publication_order "
        "FROM source ORDER BY publication_order"
    ).fetchall()
    archives = _archive_urls()
    return [
        {
            "source_code": code,
            "document_title_version": title,
            "official_url": url,
            "role": role,
            "publication_order": order,
            # Absent where no snapshot exists yet. The app renders the fallback only when
            # it has one, rather than promising an archived copy it cannot produce.
            **archives.get(code, {}),
        }
        for code, title, url, role, order in rows
    ]


def _load_coverage(conn) -> dict[int, list[dict]]:
    coverage: dict[int, list[dict]] = {}
    for fy, dataset, has_detail, gap_note in conn.execute(
        "SELECT fiscal_year, dataset, has_detail, gap_note FROM coverage ORDER BY fiscal_year, dataset"
    ):
        coverage.setdefault(fy, []).append(
            {"dataset": dataset, "has_detail": bool(has_detail), "gap_note": gap_note}
        )
    return coverage


def _load_hierarchy_edges(conn) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """Return (children_index, parent_index).

    ``children_index[parent_id]`` holds only ``contains`` edges -- the additive
    drilldown tree used for children_by_year and the whole-budget CSV.
    ``parent_index[child_id]`` holds every edge (``contains`` and
    ``detail_view``) -- some entities (documented: dept.propertymanagement,
    dept.animalcareservices) are genuinely listed under two operating
    categories in overlapping years, so a child can have more than one active
    parent edge in the same year; that is exported faithfully as a list
    rather than silently picking one.
    """
    children_index: dict[str, list[dict]] = {}
    parent_index: dict[str, list[dict]] = {}
    rows = conn.execute(
        "SELECT parent_entity_id, child_entity_id, relationship, "
        "effective_from_fy, effective_to_fy, edge_note FROM hierarchy_edge"
    ).fetchall()
    for parent_id, child_id, relationship, from_fy, to_fy, edge_note in rows:
        edge = {
            "parent_entity_id": parent_id,
            "child_entity_id": child_id,
            "relationship": relationship,
            "from_fy": from_fy,
            "to_fy": to_fy,
            "edge_note": edge_note,
        }
        parent_index.setdefault(child_id, []).append(edge)
        if relationship == "contains":
            children_index.setdefault(parent_id, []).append(edge)
    return children_index, parent_index


def _load_canonical(conn) -> dict[tuple[str, str], dict[int, tuple]]:
    """canonical_index[(entity_id, status_class)][fy] = value/status/source form/provenance."""
    index: dict[tuple[str, str], dict[int, tuple]] = {}
    for entity_id, fy, status_class, value, canonical_status, printed_form, chosen_obs in conn.execute(
        "SELECT entity_id, fiscal_year, status_class, value, canonical_status, printed_form, "
        "chosen_observation_id "
        "FROM canonical_value WHERE measure_type=?", (_MEASURE,)
    ):
        index.setdefault((entity_id, status_class), {})[fy] = (
            value, canonical_status, printed_form, chosen_obs
        )
    return index


def _load_rollups(conn) -> dict[tuple[str, int, str], dict]:
    index: dict[tuple[str, int, str], dict] = {}
    for entity_id, fy, status_class, rolled_up, direct, reconciles, note in conn.execute(
        "SELECT entity_id, fiscal_year, status_class, rolled_up_value, direct_value, reconciles, "
        "reconciliation_note FROM hierarchy_rollup"
    ):
        index[(entity_id, fy, status_class)] = {
            "rolled_up_value": rolled_up,
            "direct_value": direct,
            "reconciles": None if reconciles is None else bool(reconciles),
            "reconciliation_note": note,
        }
    return index


def _load_alternatives(conn) -> dict[tuple[str, int, str], list[dict]]:
    index: dict[tuple[str, int, str], list[dict]] = {}
    rows = conn.execute(
        "SELECT entity_id, fiscal_year, status_class, value, printed_form, source_code, "
        "publication_order "
        "FROM canonical_alternative WHERE measure_type=? ORDER BY publication_order, source_code",
        (_MEASURE,)
    ).fetchall()
    for entity_id, fy, status_class, value, printed_form, source_code, _order in rows:
        index.setdefault((entity_id, fy, status_class), []).append(
            {"value": value, "printed_form": printed_form, "source_code": source_code}
        )
    return index


def _load_observation_citations(conn) -> dict[str, dict]:
    citations: dict[str, dict] = {}
    for obs_id, source_code, printed_page, pdf_page, source_url, original_label, status in conn.execute(
        "SELECT observation_id, source_code, printed_page, pdf_page, source_url, original_label, status "
        "FROM observation"
    ):
        citations[obs_id] = {
            "source_code": source_code,
            "printed_page": printed_page,
            "pdf_page": pdf_page,
            "source_url": source_url,
            "original_label": original_label,
            "status": status,
        }
    return citations


def _fy_bounds(conn) -> tuple[int, int]:
    row = conn.execute("SELECT MIN(fiscal_year), MAX(fiscal_year) FROM canonical_value").fetchone()
    return row[0], row[1]


# --------------------------------------------------------------------------
# Break / gap detection (T1). Computed generically by walking, year by year,
# the set of active parent edges for an entity -- this handles the common
# single-parent case (EMS: Public Safety -> [gap] -> Strategic Operations ->
# Department of Administration) and the genuine dual-parent overlap case
# (dept.propertymanagement, dept.animalcareservices) without special-casing.
# --------------------------------------------------------------------------

def _describe_parent_change(prev_ids: tuple[str, ...], cur_ids: tuple[str, ...],
                             names: dict[str, str], at_fy: int) -> str:
    prev_set, cur_set = set(prev_ids), set(cur_ids)
    if len(prev_ids) == 1 and len(cur_ids) == 1:
        return f"Moved from {names.get(prev_ids[0], prev_ids[0])} to {names.get(cur_ids[0], cur_ids[0])} in FY{at_fy}."
    added = sorted(cur_set - prev_set)
    removed = sorted(prev_set - cur_set)
    parts = []
    if added:
        parts.append("added under " + ", ".join(names.get(i, i) for i in added))
    if removed:
        parts.append("no longer listed under " + ", ".join(names.get(i, i) for i in removed))
    if not parts:
        return f"Parent grouping changed in FY{at_fy}."
    return f"In FY{at_fy}, {' and '.join(parts)}."


def _compute_breaks(parent_tuples_by_fy: dict[int, tuple[str, ...]], names: dict[str, str]) -> list[dict]:
    covered_years = sorted(parent_tuples_by_fy)
    breaks: list[dict] = []
    for i in range(1, len(covered_years)):
        prev_fy, cur_fy = covered_years[i - 1], covered_years[i]
        prev_parents = parent_tuples_by_fy[prev_fy]
        cur_parents = parent_tuples_by_fy[cur_fy]
        if cur_fy > prev_fy + 1:
            breaks.append({
                "kind": "gap",
                "from_fy": prev_fy + 1,
                "to_fy": cur_fy - 1,
                "note": f"Not reported at this level in FY{prev_fy + 1}-FY{cur_fy - 1}.",
            })
        if cur_parents != prev_parents:
            breaks.append({
                "kind": "parent_change",
                "at_fy": cur_fy,
                "from_parents": list(prev_parents),
                "to_parents": list(cur_parents),
                "note": _describe_parent_change(prev_parents, cur_parents, names, cur_fy),
            })
    return breaks


# --------------------------------------------------------------------------
# Page assembly
# --------------------------------------------------------------------------

def _build_series(entity_id: str, status_class: str, canonical_index, rollup_index,
                   alt_index, citations) -> list[dict]:
    fy_values = canonical_index.get((entity_id, status_class), {})
    points = []
    for fy in sorted(fy_values):
        value, canonical_status, printed_form, chosen_obs = fy_values[fy]
        citation = citations.get(chosen_obs) if chosen_obs else None
        rollup = rollup_index.get((entity_id, fy, status_class))
        points.append({
            "fiscal_year": fy,
            "value": value,
            "printed_form": printed_form,
            "status_class": status_class,
            "canonical_status": canonical_status,
            "citation": citation,
            "alternatives": alt_index.get((entity_id, fy, status_class), []),
            "reconciliation": rollup,
        })
    return points


def _build_children_and_parent(entity_id: str, fy_min: int, fy_max: int, children_index,
                                parent_index, entities, canonical_index) -> tuple[dict, dict, list[dict]]:
    children_by_year: dict[int, list[dict]] = {}
    for fy in range(fy_min, fy_max + 1):
        edges = [e for e in children_index.get(entity_id, []) if _edge_active(e, fy)]
        if not edges:
            continue
        rows = []
        for e in sorted(edges, key=lambda e: e["child_entity_id"]):
            child_id = e["child_entity_id"]
            child_entity = entities[child_id]
            child_status = primary_status_class(child_entity["entity_type"])
            value = canonical_index.get((child_id, child_status), {}).get(fy, (None,))[0]
            printed_form = canonical_index.get((child_id, child_status), {}).get(
                fy, (None, None, None)
            )[2]
            rows.append({
                "entity_id": child_id,
                "canonical_name": child_entity["canonical_name"],
                "value": value,
                "printed_form": printed_form,
            })
        children_by_year[fy] = rows

    parent_by_year: dict[int, list[dict]] = {}
    parent_tuples_by_fy: dict[int, tuple[str, ...]] = {}
    for fy in range(fy_min, fy_max + 1):
        edges = [e for e in parent_index.get(entity_id, []) if _edge_active(e, fy)]
        if not edges:
            continue
        rows = []
        for e in sorted(edges, key=lambda e: e["parent_entity_id"]):
            parent_id = e["parent_entity_id"]
            parent_entity = entities[parent_id]
            parent_status = primary_status_class(parent_entity["entity_type"])
            value = canonical_index.get((parent_id, parent_status), {}).get(fy, (None,))[0]
            printed_form = canonical_index.get((parent_id, parent_status), {}).get(
                fy, (None, None, None)
            )[2]
            rows.append({
                "entity_id": parent_id,
                "canonical_name": parent_entity["canonical_name"],
                "relationship": e["relationship"],
                "edge_note": e["edge_note"],
                "value": value,
                "printed_form": printed_form,
            })
        parent_by_year[fy] = rows
        parent_tuples_by_fy[fy] = tuple(sorted(e["parent_entity_id"] for e in edges))

    names = {eid: e["canonical_name"] for eid, e in entities.items()}
    breaks = _compute_breaks(parent_tuples_by_fy, names)
    return children_by_year, parent_by_year, breaks


def _gf_detail_view(canonical_index) -> dict:
    """Compare fund.general vs gf.expenditures per year, entirely data-driven
    (no hardcoded fiscal years). Produces the coverage-gap years (no adopted
    gf.expenditures value at all: FY2002-03) separately from value-divergence
    years (both exist and differ: FY2005, 2007, 2014), per plan revision Y3.
    """
    fg = canonical_index.get((_GF_FUND_ENTITY, "adopted"), {})
    ge = canonical_index.get((_GF_EXPENDITURES_ENTITY, "adopted"), {})
    coverage_gap_years: list[int] = []
    divergence: list[dict] = []
    for fy in sorted(fg):
        fg_value = fg[fy][0]
        if fy not in ge:
            coverage_gap_years.append(fy)
            continue
        ge_value = ge[fy][0]
        if fg_value != ge_value:
            divergence.append({
                "fiscal_year": fy,
                "fund_general_value": fg_value,
                "gf_expenditures_value": ge_value,
            })
    return {
        "entity_id": _GF_EXPENDITURES_ENTITY,
        "relationship": "detail_view",
        "note": ("Department appropriation detail; related to but not additive under "
                 "the General Fund total."),
        "coverage_gap_fiscal_years": coverage_gap_years,
        "value_divergence_fiscal_years": divergence,
    }


def _build_page(entity_id: str, entities, children_index, parent_index, canonical_index,
                 rollup_index, alt_index, citations, whole_budget_by_year: dict[int, int],
                 fy_min: int, fy_max: int) -> dict:
    entity = entities[entity_id]
    status_class = primary_status_class(entity["entity_type"])
    series = _build_series(entity_id, status_class, canonical_index, rollup_index, alt_index, citations)
    children_by_year, parent_by_year, breaks = _build_children_and_parent(
        entity_id, fy_min, fy_max, children_index, parent_index, entities, canonical_index)

    page = {
        "entity_id": entity_id,
        "entity_type": entity["entity_type"],
        "canonical_name": entity["canonical_name"],
        "common_aliases": entity["common_aliases"],
        "plain_language_description": entity["plain_language_description"],
        "restriction_note": entity["restriction_note"],
        "active_from_fy": entity["active_from_fy"],
        "active_to_fy": entity["active_to_fy"],
        "primary_status_class": status_class,
        "series": series,
        "children_by_year": children_by_year,
        "parent_by_year": parent_by_year,
        "whole_budget_total_by_year": whole_budget_by_year,
        "breaks": breaks,
    }

    if entity_id == _GF_FUND_ENTITY:
        page["revenue_panel"] = {
            "entity_id": _GF_REVENUE_ROOT_ENTITY,
            "status_class": _REVENUE_STATUS,
            "note": ("Money-in for the General Fund; shown separately from adopted spending "
                     "and never summed with it."),
        }
        page["detail_view"] = _gf_detail_view(canonical_index)

    if entity_id == _ISF_ENTITY:
        page["excluded_from_total"] = True

    return page


# --------------------------------------------------------------------------
# years.json
# --------------------------------------------------------------------------

def _gf_expenditures_status_for_year(fy: int, canonical_index) -> dict:
    fg = canonical_index.get((_GF_FUND_ENTITY, "adopted"), {})
    ge_adopted = canonical_index.get((_GF_EXPENDITURES_ENTITY, "adopted"), {})
    if fy not in fg:
        return {"status": "not_applicable", "fund_general_value": None,
                "gf_expenditures_value": None, "gf_expenditures_status_class": None, "note": None}
    fg_value = fg[fy][0]
    if fy in ge_adopted:
        ge_value = ge_adopted[fy][0]
        if fg_value == ge_value:
            return {"status": "matches", "fund_general_value": fg_value,
                     "gf_expenditures_value": ge_value, "gf_expenditures_status_class": "adopted",
                     "note": None}
        return {
            "status": "value_divergence",
            "fund_general_value": fg_value,
            "gf_expenditures_value": ge_value,
            "gf_expenditures_status_class": "adopted",
            "note": (f"General Fund budget (${fg_value:,}) and General Fund expenditures / "
                     f"department detail (${ge_value:,}) diverge in FY{fy}; the department view "
                     "is related to, but not additive under, the General Fund total this year."),
        }
    # No adopted gf.expenditures value; look for the earliest-status alternative for context.
    for other_status in ("actual", "projected", "estimated", "proposed"):
        other = canonical_index.get((_GF_EXPENDITURES_ENTITY, other_status), {})
        if fy in other:
            return {
                "status": "coverage_gap",
                "fund_general_value": fg_value,
                "gf_expenditures_value": other[fy][0],
                "gf_expenditures_status_class": other_status,
                "note": (f"No adopted General Fund department-appropriation total is published "
                         f"for FY{fy}; department detail exists only as {other_status} that year."),
            }
    return {
        "status": "coverage_gap",
        "fund_general_value": fg_value,
        "gf_expenditures_value": None,
        "gf_expenditures_status_class": None,
        "note": f"No General Fund department-appropriation detail is published for FY{fy}.",
    }


def _build_years(conn, coverage_by_fy, canonical_index) -> dict[int, dict]:
    years = sorted(set(coverage_by_fy) | {
        fy for fy, in conn.execute("SELECT DISTINCT fiscal_year FROM canonical_value")
    })
    out: dict[int, dict] = {}
    for fy in years:
        rows = coverage_by_fy.get(fy, [])
        recovered = any(
            r["dataset"] == "general-fund-department-appropriations"
            and r["gap_note"] and "recover" in r["gap_note"].lower()
            for r in rows
        )
        budget_total = canonical_index.get((_WHOLE_BUDGET_ENTITY, "adopted"), {}).get(fy, (None,))[0]
        out[fy] = {
            "fiscal_year": fy,
            "coverage": rows,
            "budget_total_status_class": "adopted" if budget_total is not None else None,
            "gf_expenditures_vs_budget": _gf_expenditures_status_for_year(fy, canonical_index),
            "recovered_provenance": recovered,
        }
    return out


# --------------------------------------------------------------------------
# CSV downloads
# --------------------------------------------------------------------------

def _write_series_csv(
    path: Path,
    series: list[dict],
    notes: list[dict],
    entity_id: str = "",
) -> None:
    """One entity's whole series, each row carrying the notes that qualify that year.

    The `note_ids` column is the fix for the scenario cold-review finding R3 named: someone
    downloads `dept.sheriff.csv`, plots it, sees FY2005 $17.9M jump to FY2006 $26.9M, and
    publishes "Sheriff budget up 50%" citing this site. The site renders the explanation;
    the file did not carry it. A CSV stripped of its caveats is how a misreading gets
    manufactured and then attributed here.

    Notes are scoped: a department-series break does not qualify a revenue line.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="\n", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["fiscal_year", "value", "printed_form", "status_class", "canonical_status",
                    "source_code", "printed_page", "pdf_page", "source_url", "note_ids"])
        for point in series:
            citation = point["citation"] or {}
            w.writerow([
                point["fiscal_year"],
                "" if point["value"] is None else point["value"],
                point.get("printed_form") or "",
                point["status_class"],
                point["canonical_status"],
                citation.get("source_code", ""),
                "" if citation.get("printed_page") is None else citation.get("printed_page"),
                "" if citation.get("pdf_page") is None else citation.get("pdf_page"),
                citation.get("source_url", ""),
                ";".join(_note_ids_for(
                    notes,
                    point["fiscal_year"],
                    status_class=point["status_class"],
                    entity_id=entity_id,
                    series_kind=_series_kind(entity_id),
                    printed_form=point.get("printed_form"),
                )),
            ])


def _series_kind(entity_id: str) -> str | None:
    """Which scoped notes apply to this entity's series. Mirrors `seriesKindFor` in the app."""
    return "department" if entity_id.startswith(("dept.", "opcat.")) else None


def _budget_tree_rows(
    fy: int,
    children_index,
    entities,
    canonical_index,
    citations,
    notes: list[dict],
) -> list[tuple]:
    """Rows for one year's whole-budget tree, each carrying its own citation.

    The citation columns were missing, on the first file the downloads page lists, while
    that page claimed "every row carries the source document and printed page its figure
    was read from". A downloaded file that cannot be checked against the county is the one
    artefact this project cannot afford to ship.
    """
    rows: list[tuple] = []

    def visit(entity_id: str, parent_id: str | None) -> None:
        entity = entities[entity_id]
        status = primary_status_class(entity["entity_type"])
        entry = canonical_index.get((entity_id, status), {}).get(fy, (None, None, None, None))
        value, printed_form, chosen_obs = entry[0], entry[2], entry[3]
        citation = citations.get(chosen_obs) or {}
        rows.append((
            entity_id, entity["canonical_name"], entity["entity_type"], parent_id or "", value,
            printed_form or "",
            status,
            citation.get("source_code", ""),
            citation.get("printed_page", "") if citation.get("printed_page") is not None else "",
            citation.get("pdf_page", "") if citation.get("pdf_page") is not None else "",
            citation.get("source_url", ""),
            ";".join(_note_ids_for(
                notes, fy, status_class=status, entity_id=entity_id, printed_form=printed_form
            )),
        ))
        children = sorted(
            e["child_entity_id"] for e in children_index.get(entity_id, []) if _edge_active(e, fy)
        )
        for child_id in children:
            visit(child_id, entity_id)

    visit(_WHOLE_BUDGET_ENTITY, None)
    return rows


def _write_tree_csv(path: Path, rows: list[tuple]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="\n", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["entity_id", "canonical_name", "entity_type", "parent_entity_id", "value",
                    "printed_form",
                    "status_class", "source_code", "printed_page", "pdf_page", "source_url",
                    "note_ids"])
        for row in rows:
            entity_id, canonical_name, entity_type, parent_id, value = row[:5]
            w.writerow([entity_id, canonical_name, entity_type, parent_id,
                        "" if value is None else value, *row[5:]])


# --------------------------------------------------------------------------
# JSON writer
# --------------------------------------------------------------------------

def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n"
    path.write_text(text, encoding="utf-8")


# --------------------------------------------------------------------------
# V2 sources/funds/uses contract. This is additive to the frozen v1 files.
# --------------------------------------------------------------------------

def _load_v2_entities(conn) -> dict[str, dict]:
    entities: dict[str, dict] = {}
    display = _display_names(conn)
    rows = conn.execute(
        "SELECT e.entity_id,e.entity_type,e.canonical_name,e.common_aliases,"
        "e.plain_language_description,e.restriction_note,e.active_from_fy,e.active_to_fy,"
        "ea.accounting_role,ea.value_semantics,ea.normal_sign,ea.included_in_scope_total "
        "FROM entity e JOIN entity_accounting ea ON ea.entity_id=e.entity_id "
        "ORDER BY e.entity_id"
    ).fetchall()
    for row in rows:
        (entity_id, entity_type, name, aliases, description, restriction, active_from,
         active_to, role, semantics, normal_sign, included) = row
        entities[entity_id] = {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "canonical_name": name,
            "display_name": display.get(entity_id),
            "common_aliases": aliases.split("; ") if aliases else [],
            "plain_language_description": description,
            "restriction_note": restriction,
            "active_from_fy": active_from,
            "active_to_fy": active_to,
            "accounting": {
                "accounting_role": role,
                "value_semantics": semantics,
                "normal_sign": normal_sign,
                "included_in_scope_total": included,
            },
        }
    return entities


def _load_v2_relationships(conn) -> list[dict]:
    rows = conn.execute(
        "SELECT relationship_id,from_entity_id,to_entity_id,relationship_type,"
        "traceability_level,is_additive,effective_from_fy,effective_to_fy,"
        "restriction_note,relationship_note,source_code "
        "FROM entity_relationship ORDER BY relationship_id"
    ).fetchall()
    return [
        {
            "relationship_id": relationship_id,
            "from_entity_id": from_id,
            "to_entity_id": to_id,
            "relationship_type": relationship_type,
            "traceability_level": traceability,
            "is_additive": bool(is_additive),
            "effective_from_fy": from_fy,
            "effective_to_fy": to_fy,
            "restriction_note": restriction,
            "relationship_note": note,
            "source_code": source_code,
        }
        for (relationship_id, from_id, to_id, relationship_type, traceability,
             is_additive, from_fy, to_fy, restriction, note, source_code) in rows
    ]


def _succession(conn) -> dict[str, dict]:
    """Which line each entity continues from, and continues as.

    Exported onto the entity page so a reader landing on ENG.-SOUTHERN BUREAU can follow the
    work forward to ENGINEERING - SOUTHERN BUREAU without the site claiming the two series
    are one. The link is navigation; comparability is a separate claim carried by a note.
    """
    out: dict[str, dict] = {}
    rows = conn.execute(
        "SELECT from_entity_id, to_entity_id, relationship_note, effective_from_fy, "
        "effective_to_fy FROM entity_relationship WHERE relationship_type='succeeded_by'"
    ).fetchall()
    for earlier, later, note, from_fy, to_fy in rows:
        out.setdefault(earlier, {})["succeeded_by"] = {
            "entity_id": later, "note": note, "from_fiscal_year": from_fy,
            "to_fiscal_year": to_fy,
        }
        out.setdefault(later, {})["preceded_by"] = {
            "entity_id": earlier, "note": note, "from_fiscal_year": from_fy,
            "to_fiscal_year": to_fy,
        }
    return out


def _build_v2_entity_page(conn, entity: dict, citations, alt_index, succession=None) -> dict:
    entity_id = entity["entity_id"]
    series: list[dict] = []
    rows = conn.execute(
        "SELECT fiscal_year,status_class,measure_type,value,printed_form,canonical_status,"
        "selection_rule,chosen_observation_id FROM canonical_value "
        "WHERE entity_id=? ORDER BY status_class,measure_type,fiscal_year",
        (entity_id,),
    ).fetchall()
    for (fy, status_class, measure_type, value, printed_form, canonical_status, selection_rule,
         chosen_obs) in rows:
        series.append({
            "fiscal_year": fy,
            "status_class": status_class,
            "measure_type": measure_type,
            "value": value,
            "printed_form": printed_form,
            "canonical_status": canonical_status,
            "selection_rule": selection_rule,
            "citation": citations.get(chosen_obs) if chosen_obs else None,
            "alternatives": alt_index.get((entity_id, fy, status_class), []),
        })
    memberships = [
        {
            "statement_id": statement_id,
            "member_role": role,
            "display_order": order,
            "arithmetic_sign": sign,
            "subtotal_group": group,
            "status_class": status_class,
            "is_required": bool(required),
            "effective_from_fy": from_fy,
            "effective_to_fy": to_fy,
        }
        for (statement_id, role, order, sign, group, status_class, required,
             from_fy, to_fy) in conn.execute(
                "SELECT statement_id,member_role,display_order,arithmetic_sign,"
                "subtotal_group,status_class,is_required,effective_from_fy,effective_to_fy "
                "FROM statement_member WHERE entity_id=? "
                "ORDER BY statement_id,display_order,member_role",
                (entity_id,),
             ).fetchall()
    ]
    page = dict(entity)
    page["series"] = series
    page["statement_memberships"] = memberships
    links = (succession or {}).get(entity_id, {})
    page["succeeded_by"] = links.get("succeeded_by")
    page["preceded_by"] = links.get("preceded_by")
    return page


def _resolve_statement_member(
    conn,
    member: dict,
    fiscal_year: int,
    source_code: str,
    instance_status_class: str | None,
    citations,
) -> dict:
    sql = (
        "SELECT cv.status_class,cv.value,cv.printed_form,cv.chosen_observation_id "
        "FROM canonical_value cv WHERE cv.entity_id=? AND cv.fiscal_year=? "
        "AND cv.measure_type='dollars' AND cv.value IS NOT NULL"
    )
    params: list = [member["entity_id"], fiscal_year]
    resolved_filter = member["status_class"] or instance_status_class
    if resolved_filter:
        sql += " AND cv.status_class=?"
        params.append(resolved_filter)
    rows = conn.execute(sql + " ORDER BY cv.status_class", params).fetchall()
    if len(rows) > 1 and not resolved_filter:
        source_rows = [
            row for row in rows
            if row[3] and citations.get(row[3], {}).get("source_code") == source_code
        ]
        if len(source_rows) == 1:
            rows = source_rows
    if len(rows) > 1:
        raise ValueError(
            f"statement member {member['statement_id']} / {member['entity_id']} "
            f"matches multiple statuses in FY{fiscal_year}"
        )
    resolved_status, value, printed_form, chosen_obs = (
        rows[0] if rows else (None, None, None, None)
    )
    return {
        **member,
        "resolved_status_class": resolved_status,
        "value": value,
        "printed_form": printed_form,
        "signed_value": member["arithmetic_sign"] * value if value is not None else None,
        "citation": citations.get(chosen_obs) if chosen_obs else None,
    }


def _load_v2_statements(conn, citations) -> list[dict]:
    statements: list[dict] = []
    for statement_id, name, scope_id, statement_type, from_fy, to_fy, note in conn.execute(
        "SELECT statement_id,canonical_name,scope_entity_id,statement_type,"
        "effective_from_fy,effective_to_fy,statement_note "
        "FROM accounting_statement ORDER BY statement_id"
    ):
        members = [
            {
                "statement_id": statement_id,
                "entity_id": entity_id,
                "member_role": role,
                "display_order": order,
                "arithmetic_sign": sign,
                "subtotal_group": group,
                "status_class": status_class,
                "is_required": bool(required),
                "effective_from_fy": member_from,
                "effective_to_fy": member_to,
            }
            for (entity_id, role, order, sign, group, status_class, required,
                 member_from, member_to) in conn.execute(
                    "SELECT entity_id,member_role,display_order,arithmetic_sign,"
                    "subtotal_group,status_class,is_required,effective_from_fy,effective_to_fy "
                    "FROM statement_member WHERE statement_id=? "
                    "ORDER BY display_order,entity_id",
                    (statement_id,),
                 ).fetchall()
        ]
        instances: list[dict] = []
        for fiscal_year, source_code, instance_status_class, validation_status, validation_note in conn.execute(
            "SELECT fiscal_year,source_code,status_class,validation_status,validation_note "
            "FROM statement_instance WHERE statement_id=? ORDER BY fiscal_year",
            (statement_id,),
        ):
            active = [
                member for member in members
                if (member["effective_from_fy"] is None or fiscal_year >= member["effective_from_fy"])
                and (member["effective_to_fy"] is None or fiscal_year <= member["effective_to_fy"])
            ]
            resolved = [
                _resolve_statement_member(
                    conn, member, fiscal_year, source_code, instance_status_class, citations
                )
                for member in active
            ]
            signed_delta = sum(
                member["signed_value"] for member in resolved
                if member["signed_value"] is not None
            )
            instances.append({
                "fiscal_year": fiscal_year,
                "source_code": source_code,
                "status_class": instance_status_class,
                "validation_status": validation_status,
                "validation_note": validation_note,
                "signed_delta": signed_delta,
                "members": resolved,
            })
        statements.append({
            "statement_id": statement_id,
            "canonical_name": name,
            "scope_entity_id": scope_id,
            "statement_type": statement_type,
            "effective_from_fy": from_fy,
            "effective_to_fy": to_fy,
            "statement_note": note,
            "members": members,
            "instances": instances,
        })
    return statements


def _load_v2_scope_coverage(conn) -> list[dict]:
    return [
        {
            "scope_entity_id": scope_id,
            "domain": domain,
            "fiscal_year": fiscal_year,
            "coverage_level": level,
            "status_classes": status_classes.split(";") if status_classes else [],
            "gap_note": gap_note,
            "source_code": source_code,
        }
        for scope_id, domain, fiscal_year, level, status_classes, gap_note, source_code in conn.execute(
            "SELECT scope_entity_id,domain,fiscal_year,coverage_level,status_classes,"
            "gap_note,source_code FROM scope_coverage "
            "ORDER BY scope_entity_id,domain,fiscal_year"
        )
    ]


def _coverage_scope_for_export(
    entity_id: str,
    coverage_scopes: set[str],
    relationships: list[dict],
    statements: list[dict],
) -> str | None:
    """Mirror the app's data-derived coverage-scope walk for the sweep manifest."""
    if entity_id in coverage_scopes:
        return entity_id

    parent_of: dict[str, str] = {}
    for relationship in relationships:
        if relationship["relationship_type"] in {"contains", "detail_view"}:
            parent_of.setdefault(relationship["to_entity_id"], relationship["from_entity_id"])

    chain = [entity_id]
    seen = {entity_id}
    current = parent_of.get(entity_id)
    while current and current not in seen:
        if current in coverage_scopes:
            return current
        seen.add(current)
        chain.append(current)
        current = parent_of.get(current)

    for candidate in chain:
        for statement in statements:
            if statement["scope_entity_id"] not in coverage_scopes:
                continue
            if any(member["entity_id"] == candidate for member in statement["members"]):
                return statement["scope_entity_id"]
    return None


def _coverage_page_counts(
    pages: dict[str, dict],
    coverage: list[dict],
    relationships: list[dict],
    statements: list[dict],
) -> tuple[int, int]:
    """Return the exporter-owned set size for entity pages that render CoverageState.

    Each entity has a latest-year route plus one route per distinct series year. The browser
    gate derives the actual rendered set from the static HTML and compares it with these
    counts, so a new view or an accidentally narrowed sweep cannot silently change the set.
    """
    coverage_scopes = {row["scope_entity_id"] for row in coverage}
    entity_count = 0
    route_count = 0
    for entity_id, page in pages.items():
        if entity_id == _GF_FUND_ENTITY:
            continue
        renders = entity_id in _COVERAGE_FUND_GROUP_IDS
        if not renders and page["accounting"]["accounting_role"] in _COVERAGE_ACCOUNTING_ROLES:
            renders = _coverage_scope_for_export(
                entity_id, coverage_scopes, relationships, statements
            ) is not None
        if not renders:
            continue
        years = {point["fiscal_year"] for point in page["series"]}
        entity_count += 1
        route_count += 1 + len(years)
    return entity_count, route_count


def _write_query_csv(path: Path, headers: list[str], rows: list[tuple]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(headers)
        writer.writerows(rows)


def _export_transfers(out_dir: Path) -> list[Path]:
    """Per-year transfers between the General Fund and its counterparties.

    Transfers are where money moves without being earned or spent, and they are where the
    two large unexplained movements in this dataset live (the FY2022 COVID relief transfer
    and the FY2023 revenue-bond transfer). Exported per year, with the county's own TOTAL
    rows kept separate from the counterparty lines so a consumer cannot double-count by
    summing everything.
    """
    source_path = _ROOT / "data" / "production" / "general_fund_transfers.csv"
    with source_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    by_year: dict[int, dict] = {}
    for row in rows:
        fiscal_year = int(row["fiscal_year"])
        entry = by_year.setdefault(
            fiscal_year,
            {"fiscal_year": fiscal_year, "transfers_in": [], "transfers_out": [],
             "total_in": None, "total_out": None},
        )
        counterparty = row["general_fund_counterparty"]
        amount = int(row["amount"])
        is_total = counterparty.strip().upper().startswith("TOTAL")
        direction = row["direction"]
        if is_total:
            entry["total_in" if direction == "transfer_in" else "total_out"] = amount
            continue
        entry["transfers_in" if direction == "transfer_in" else "transfers_out"].append(
            {"counterparty": counterparty, "amount": amount, "source": row["source"]}
        )

    for entry in by_year.values():
        for key in ("transfers_in", "transfers_out"):
            entry[key].sort(key=lambda item: (-item["amount"], item["counterparty"]))
        # The county prints its own totals. Where it does, they must equal the lines.
        for total_key, list_key in (("total_in", "transfers_in"), ("total_out", "transfers_out")):
            printed = entry[total_key]
            if printed is None:
                continue
            summed = sum(item["amount"] for item in entry[list_key])
            if summed != printed:
                raise ValueError(
                    f"FY{entry['fiscal_year']} {list_key} sum to {summed} but the county "
                    f"prints a total of {printed}"
                )

    path = out_dir / "data" / "v2" / "transfers.json"
    _write_json(path, {"years": [by_year[year] for year in sorted(by_year)]})
    return [path]


def _export_data_notes(out_dir: Path, rows: list[dict]) -> list[Path]:
    """Export the caveat layer, and write it into the public CSV downloads too.

    A downloaded CSV stripped of its caveats is exactly how a misreading gets manufactured
    and then attributed to this site, so the notes travel with the data rather than living
    only in the app.
    """
    notes = []
    for row in rows:
        start = row["fiscal_year_start"].strip()
        end = row["fiscal_year_end"].strip()
        notes.append({
            "note_id": row["note_id"],
            "scope_type": row["scope_type"],
            "scope_value": row["scope_value"],
            "fiscal_year_start": int(start) if start else None,
            "fiscal_year_end": int(end) if end else None,
            "status_class": row.get("status_class", "").strip() or None,
            "note_type": row["note_type"],
            "severity": row["severity"],
            "render_contract": row["render_contract"],
            "headline": row["headline"],
            "text": row["text"],
            "source_ref": row["source_ref"],
        })
    notes.sort(key=lambda n: n["note_id"])

    notes_path = out_dir / "data" / "v2" / "notes.json"
    _write_json(notes_path, {"notes": notes})
    written = [notes_path]

    downloads = out_dir / "public" / "downloads" / "data-notes.csv"
    downloads.parent.mkdir(parents=True, exist_ok=True)
    with downloads.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=list(rows[0].keys()),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: r["note_id"]))
    written.append(downloads)
    return written


def _export_verification_status(out_dir: Path) -> list[Path]:
    """Export how deeply each fiscal year was verified.

    A site that states its verification depth per year is harder to embarrass than one that
    implies uniform certainty, and this dataset is genuinely not uniform: FY2025 has two
    independent extractions, the other fourteen have one plus a stratified blind re-read.
    Generated by `scripts.curation.gen_verification_status` from the audit itself, so the
    published numbers cannot drift from the audit that produced them.
    """
    source_path = _ROOT / "data" / "production" / "verification_status.csv"
    with source_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    def _num(value: str) -> int | None:
        return int(value) if value.strip() else None

    years = [
        {
            "fiscal_year": int(row["fiscal_year"]),
            "method": row["method"],
            "cells_sampled": _num(row["cells_sampled"]),
            "cells_exact": _num(row["cells_exact"]),
            "cells_dash_as_nil": _num(row["cells_dash_as_nil"]),
            "cells_mismatched": _num(row["cells_mismatched"]),
            "anomalies_reported": _num(row["anomalies_reported"]),
            "status_note": row["status_note"],
        }
        for row in rows
    ]
    years.sort(key=lambda y: y["fiscal_year"])

    path = out_dir / "data" / "v2" / "verification.json"
    _write_json(path, years)
    written = [path]

    downloads = out_dir / "public" / "downloads" / "verification-status.csv"
    downloads.parent.mkdir(parents=True, exist_ok=True)
    with downloads.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: int(r["fiscal_year"])))
    written.append(downloads)
    return written


def _data_version(out_dir: Path) -> str:
    """A hash of what this site actually PUBLISHES.

    The first version of this hashed `data/production/**/*.csv` — the curated dimensions —
    which is the wrong domain and made the corrections page's promise ("it changes when a
    figure changes") false for the most likely kind of correction there is. The frozen
    extraction lives in `audit/blind-extraction/` and the recovered image tables in
    `data/recovered/`, both outside it, so fixing a mis-transcribed cell would have changed
    a published figure and left the version stamp untouched. So would an exporter bug fix
    that changed emitted values with no input change at all.

    Hashing the OUTPUT instead makes the property true by construction rather than by
    enumeration: the version changes if and only if something a reader can see changes, and
    it stays correct when a new input root is added without anyone remembering to add it
    here. It is still a content hash, not a clock — a rebuild with no data change reproduces
    the same string, which the exporter's byte-identical output guarantee makes reliable.

    Excludes the file it feeds (`corrections.json` carries the version, so hashing it would
    be self-referential) and anything not derived from the data.
    """
    digest = hashlib.sha256()
    roots = [out_dir / "data", out_dir / "public" / "downloads"]
    paths = sorted(
        path for root in roots if root.exists() for path in root.rglob("*")
        if path.is_file() and path.name != "corrections.json"
    )
    for path in paths:
        digest.update(path.relative_to(out_dir).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def _export_corrections_and_version(out_dir: Path) -> list[Path]:
    """The corrections log, and a data version a citation can be pinned to.

    A citation to "this site" is worthless if the figure can change underneath it without
    trace. So: a public log of what changed and when, and a version stamp on every page.

    The stamp is a hash of the production data, NOT a build timestamp. A timestamp would
    change on every rebuild and tell a reader nothing about whether the numbers moved --
    and it would break this exporter's byte-identical-output promise, which is what makes a
    data diff reviewable in the first place. A content hash changes when, and only when,
    the data changes.
    """
    data_dir = _ROOT / "data" / "production"

    log_path = data_dir / "corrections_log.csv"
    with log_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    corrections = sorted(rows, key=lambda r: (r["corrected_on"], r["correction_id"]), reverse=True)

    # The downloadable log participates in the published-data hash. Write it first;
    # otherwise a changed correction appears in the version only on the next export.
    downloads = out_dir / "public" / "downloads" / "corrections-log.csv"
    downloads.parent.mkdir(parents=True, exist_ok=True)
    with downloads.open("w", newline="\n", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(corrections)
    version = _data_version(out_dir)
    payload = {"data_version": version, "corrections": corrections}
    json_path = out_dir / "data" / "v2" / "corrections.json"
    _write_json(json_path, payload)
    return [json_path, downloads]


def _export_pending_years(out_dir: Path) -> list[Path]:
    """Years the county adopted but this source-faithful dataset cannot publish yet.

    This is status data, not a clock. The checked date and reason are curated so rebuilding
    tomorrow does not pretend anyone checked the county source tomorrow. The web gate compares
    every pending year with the latest year actually published and rejects the note the moment
    ingestion catches up.
    """
    path = _ROOT / "data" / "production" / "pending_years.csv"
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        expected = ["fiscal_year", "adopted_on", "status_checked_on", "reason_not_ingested"]
        if reader.fieldnames != expected:
            raise ValueError(
                f"{path.relative_to(_ROOT)} has fields {reader.fieldnames}; expected {expected}"
            )
        rows = [
            {
                "fiscal_year": int(row["fiscal_year"]),
                "adopted_on": row["adopted_on"],
                "status_checked_on": row["status_checked_on"],
                "reason_not_ingested": row["reason_not_ingested"],
            }
            for row in reader
        ]
    if not rows:
        raise ValueError(f"{path.relative_to(_ROOT)} has no pending-year records")

    target = out_dir / "data" / "v2" / "pending-years.json"
    _write_json(target, sorted(rows, key=lambda row: row["fiscal_year"]))
    return [target]


_ROLE_DOMAIN_LABEL = {
    "revenue": "Money in", "financing_in": "Money in",
    "beginning_position": "Where it sits", "ending_position": "Where it sits",
    "net_position_change": "Where it sits", "position_adjustment": "Where it sits",
    "position_component": "Where it sits",
    "operating_use": "Money out", "financing_out": "Money out", "net_financing": "Money out",
    "container": "Money out", "scope_total": "Money out",
    "informational_total": "Money in",
}

_ENTITY_TYPE_QUALIFIER = {
    "balance_adjustment": "Position adjustment",
    "balance_beginning": "Beginning balance",
    "balance_change": "Balance change",
    "balance_component": "Balance category",
    "balance_ending": "Ending balance",
    "department": "Department",
    "expense_line": "Spending line",
    "financing_net": "Net financing line",
    "financing_source": "Financing source",
    "financing_use": "Financing use",
    "fund": "Named fund",
    "fund_type": "Fund",
    "funding_total": "Funding total",
    "general_fund_total": "General Fund total",
    "operating_category": "Category total",
    "operating_overview_category": "Budget overview line",
    "program": "Program",
    "revenue_category": "Revenue line",
    "revenue_source": "Revenue detail",
    "revenue_total": "Revenue total",
    "use_total": "Spending total",
    "whole_budget": "County total",
}


def _search_preview_values(conn) -> dict[str, dict]:
    """One answerable figure per entity, for the search results page.

    A result list of names and descriptions makes a resident open three pages to find out
    which "transfers" line is the big one. The preview puts the amount in the result.

    Which year: the current budget year when the entity has a published value for it,
    otherwise that entity's most recent published year. The distinction is carried
    explicitly as `is_latest`, because an inactive historical line showing a figure with no
    qualifier reads as a current number — which is the one thing a preview must not do.

    ALL canonical observations for the chosen entity-year are returned, not one (cold review
    finding R3). An entity-year can legitimately carry more than one status: an estimate and
    an adopted figure answer different questions, and silently picking whichever sorts first
    would present one basis as though it were the only published value. The UI shows them as
    separate labelled lines; this function refuses to choose.

    Dollars only. A headcount and a dollar amount in the same preview line would read as one
    quantity.
    """
    rows = conn.execute(
        "SELECT entity_id, fiscal_year, status_class, value, printed_form FROM canonical_value "
        "WHERE measure_type='dollars' AND value IS NOT NULL "
        "ORDER BY entity_id, fiscal_year, status_class"
    ).fetchall()

    by_entity: dict[str, dict[int, list[dict]]] = {}
    for entity_id, fiscal_year, status_class, value, printed_form in rows:
        by_entity.setdefault(entity_id, {}).setdefault(fiscal_year, []).append(
            {"status_class": status_class, "value": value, "printed_form": printed_form}
        )

    current_fy = max(
        (fy for years in by_entity.values() for fy in years),
        default=None,
    )

    previews: dict[str, dict] = {}
    for entity_id, years in by_entity.items():
        if not years:
            continue
        chosen_fy = current_fy if current_fy in years else max(years)
        previews[entity_id] = {
            "fiscal_year": chosen_fy,
            # True when this is the entity's latest published year rather than the current
            # budget year — i.e. when the reader is looking at history, not this year.
            "is_latest": chosen_fy != current_fy,
            "observations": sorted(years[chosen_fy], key=lambda o: o["status_class"]),
        }
    return previews


def _export_search_index(conn, out_dir: Path) -> list[Path]:
    """A static search index: every line, its aliases, and where it sits.

    Built here rather than in the app because the app must never import all 180 entity
    pages into a client bundle (plan Decision 3 / T3). This file is ~40KB and is the only
    data the search page loads.

    Every entry carries a DOMAIN label and a FUND label, because the same word legitimately
    matches several lines and the reader has to be able to tell them apart: "transfers"
    matches both transfers in and transfers out, and showing them as two results labelled
    "Money in" and "Money out" is the honest answer rather than a single merged one.
    """
    fund_of: dict[str, str] = {}
    children: dict[str, list[str]] = {}
    for parent, child in conn.execute(
        "SELECT parent_entity_id, child_entity_id FROM hierarchy_edge"
    ):
        children.setdefault(parent, []).append(child)
    for scope, member in conn.execute(
        "SELECT s.scope_entity_id, m.entity_id FROM accounting_statement s "
        "JOIN statement_member m ON m.statement_id = s.statement_id"
    ):
        children.setdefault(scope, []).append(member)

    fund_names = {
        entity_id: name for entity_id, name in conn.execute(
            # The fund GROUPS only. A named special revenue fund is a member of the
            # Special Revenue Fund, not its own fund, and labelling Road Program with
            # "Road Program" tells a reader nothing they cannot already see.
            "SELECT entity_id, canonical_name FROM entity "
            "WHERE entity_type = 'fund_type' OR entity_id = 'budget.total'"
        )
    }
    # Most specific fund first, and the county total LAST, or the total reaches every
    # entity before any fund does and labels all 180 of them "Total Budget" -- which is
    # true, useless, and exactly what the first version of this did.
    ordered_funds = sorted(
        fund_names,
        key=lambda fid: (fid == "budget.total", -fid.count("."), fid),
    )
    for fund_id in ordered_funds:
        stack = [fund_id]
        seen = {fund_id}
        while stack:
            current = stack.pop()
            # First fund to reach an entity wins, and the funds are walked from the most
            # specific outwards, so a General Fund department is not labelled "Total Budget".
            fund_of.setdefault(current, fund_id)
            for child in children.get(current, []):
                if child not in seen:
                    seen.add(child)
                    stack.append(child)

    previews = _search_preview_values(conn)
    display = _display_names(conn)

    # A department name is not always unique, even within the department type. The most
    # recent printed parent category is the resident-facing organisational context; for the
    # overlapping Planning and Code Compliance pair it is the fact that distinguishes the
    # two lines when their names and years do not.
    department_parent: dict[str, str] = {}
    parent_rows = conn.execute(
        "SELECT he.child_entity_id,he.parent_entity_id,p.canonical_name,"
        "he.effective_from_fy,he.effective_to_fy FROM hierarchy_edge he "
        "JOIN entity child ON child.entity_id=he.child_entity_id "
        "JOIN entity p ON p.entity_id=he.parent_entity_id "
        "WHERE child.entity_type='department' AND p.entity_type='operating_category' "
        "ORDER BY he.child_entity_id,COALESCE(he.effective_to_fy,9999),"
        "COALESCE(he.effective_from_fy,-1),he.parent_entity_id"
    ).fetchall()
    for child_id, parent_id, parent_name, _from_fy, _to_fy in parent_rows:
        department_parent[child_id] = display.get(parent_id, parent_name)

    entries = []
    for (entity_id, entity_type, name, aliases, description, role, active_from, active_to) in conn.execute(
        "SELECT e.entity_id, e.entity_type, e.canonical_name, e.common_aliases, "
        "e.plain_language_description, ea.accounting_role, e.active_from_fy, e.active_to_fy "
        "FROM entity e LEFT JOIN entity_accounting ea ON ea.entity_id = e.entity_id"
    ):
        if entity_type not in _ENTITY_TYPE_QUALIFIER:
            raise ValueError(f"search qualifier is undefined for entity type {entity_type!r}")
        fund_id = fund_of.get(entity_id)
        entries.append({
            "entity_id": entity_id,
            "entity_type": entity_type,
            "name": display.get(entity_id, name),
            # The printed label stays searchable even when the display name differs, so a
            # reader who types what the budget book says still finds the line.
            "aliases": sorted({
                *(a.strip() for a in (aliases or "").split(";") if a.strip()),
                *([name] if display.get(entity_id) else []),
            }),
            "description": description,
            "qualifier": _ENTITY_TYPE_QUALIFIER[entity_type],
            "parent_label": department_parent.get(entity_id),
            "domain_label": _ROLE_DOMAIN_LABEL.get(role or "", "Other"),
            "fund_id": fund_id,
            "fund_label": fund_names.get(fund_id or "", None),
            "active_from_fy": active_from,
            "active_to_fy": active_to,
            "preview": previews.get(entity_id),
        })
    entries.sort(key=lambda e: e["entity_id"])

    path = out_dir / "data" / "v2" / "search-index.json"
    _write_json(path, entries)
    return [path]


def _export_general_fund_budget_actual_comparison(
    out_dir: Path,
    notes: list[dict],
) -> list[Path]:
    """Export the curated, source-cited budget-versus-actual comparison, one file per year.

    This dataset intentionally stays separate from the canonical observation
    series: its budget values are the ACFR's final amended budget used for
    variance analysis, not a replacement for the adopted budget-book series.
    """
    source_path = _ROOT / "data" / "production" / "general_fund_budget_actual_comparison.csv"
    with source_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise ValueError(f"comparison dataset is empty: {source_path}")

    # The category-driver CSV is intentionally limited to the lines that explain a
    # variance. The resident summary also needs the audited statement's five headline
    # totals, whose *final amended* budget is the same budget basis as its actual.
    # Keep that separate from the adopted budget-book series rather than silently
    # combining two different budget concepts in the application.
    audited_series_path = _ROOT / "data" / "production" / "general_fund_audited_series.csv"
    with audited_series_path.open(newline="", encoding="utf-8-sig") as fh:
        audited_rows = list(csv.DictReader(fh))
    required_totals = (
        "total_revenues",
        "total_expenditures",
        "transfers_in",
        "transfers_out",
        "net_change",
    )
    audited_totals: dict[int, dict[str, dict]] = {}
    for row in audited_rows:
        measure = row["measure"]
        if measure in required_totals:
            audited_totals.setdefault(int(row["fiscal_year"]), {})[measure] = row

    # The residual components (leases, land/asset sales, a fund-balance appropriation) that
    # close the gap between the four flow measures above and the audited net change. Each
    # component is scoped to a `column` ("actual" or "final_budget") because a residual does
    # not always land on the same side: FY2011's is a Final Budget adjustment with no Actual-
    # column counterpart. Grouped by fiscal year so a year with no residual exports an empty
    # list rather than a missing key.
    residuals_path = _ROOT / "data" / "production" / "general_fund_flow_residuals.csv"
    with residuals_path.open(newline="", encoding="utf-8") as fh:
        residual_rows = list(csv.DictReader(fh))
    residuals_by_year: dict[int, list[dict]] = {}
    for row in residual_rows:
        residuals_by_year.setdefault(int(row["fiscal_year"]), []).append(row)

    # `basic-statement-totals.csv` records the physical and printed page of the
    # annual budget-and-actual statement. Its pages are deliberately not inferred
    # from a detailed-schedule offset: those layouts diverge in earlier reports.
    statement_totals_path = _ROOT / "research" / "fy2025-budget-actual" / "basic-statement-totals.csv"
    with statement_totals_path.open(newline="", encoding="utf-8-sig") as fh:
        statement_rows = list(csv.DictReader(fh))
    statement_pages: dict[int, tuple[int, int]] = {}
    for row in statement_rows:
        fiscal_year = int(row["fiscal_year"])
        page = (int(row["printed_page"]), int(row["pdf_page"]))
        existing = statement_pages.setdefault(fiscal_year, page)
        if existing != page:
            raise ValueError(
                f"FY{fiscal_year} basic statement has conflicting source pages: "
                f"{existing} and {page}"
            )

    printed_forms_path = _ROOT / "data" / "production" / "comparison_total_printed_forms.csv"
    with printed_forms_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        printed_form_rows = list(reader)
    required_printed_form_fields = {
        "fiscal_year", "measure", "column", "printed_form", "pdf_page", "printed_page", "source_note",
    }
    if set(reader.fieldnames or []) != required_printed_form_fields:
        raise ValueError(
            f"{printed_forms_path.relative_to(_ROOT)} must have fields "
            f"{sorted(required_printed_form_fields)}"
        )
    printed_forms: dict[tuple[int, str, str], dict] = {}
    for row in printed_form_rows:
        key = (int(row["fiscal_year"]), row["measure"], row["column"])
        if key in printed_forms:
            raise ValueError(f"duplicate printed-form override: FY{key[0]} {key[1]} {key[2]}")
        if row["column"] not in {"budget", "actual"}:
            raise ValueError(f"invalid printed-form column for FY{key[0]}: {row['column']!r}")
        if row["printed_form"] not in {"0", "-", "--", "(0)"}:
            raise ValueError(f"invalid printed form for FY{key[0]} {key[1]}: {row['printed_form']!r}")
        if not row["source_note"].strip():
            raise ValueError(f"FY{key[0]} {key[1]} {key[2]} lacks a verification note")
        if statement_pages.get(key[0]) != (int(row["printed_page"]), int(row["pdf_page"])):
            raise ValueError(
                f"FY{key[0]} {key[1]} {key[2]} printed-form source page does not match "
                "the verified basic statement"
            )
        printed_forms[key] = row

    allowed_sections = ("revenue_categories", "spending_categories")
    source_sections = {row["section"] for row in rows}
    unknown_sections = source_sections - set(allowed_sections)
    if unknown_sections:
        raise ValueError(f"unknown comparison sections: {sorted(unknown_sections)}")
    sections = [section for section in allowed_sections if section in source_sections]

    by_year: dict[int, list[dict]] = {}
    for row in rows:
        by_year.setdefault(int(row["fiscal_year"]), []).append(row)

    written: list[Path] = []
    total_download_rows: list[dict] = []
    used_printed_form_keys: set[tuple[int, str, str]] = set()
    used_residual_years: set[int] = set()
    for fiscal_year in sorted(by_year):
        year_rows = by_year[fiscal_year]
        source_tuples = {
            (row["source_code"], row["document_title_version"], row["source_url"])
            for row in year_rows
        }
        if len(source_tuples) != 1:
            raise ValueError(
                f"FY{fiscal_year} comparison draws on {len(source_tuples)} official sources; "
                f"each year must cite exactly one audited report"
            )

        source_code, document_title, source_url = next(iter(source_tuples))
        missing_totals = [
            measure
            for measure in required_totals
            if measure not in audited_totals.get(fiscal_year, {})
        ]
        if missing_totals:
            raise ValueError(
                f"FY{fiscal_year} audited series lacks required comparison totals: "
                f"{', '.join(missing_totals)}"
            )
        if fiscal_year not in statement_pages:
            raise ValueError(
                f"FY{fiscal_year} lacks verified basic-statement source-page metadata"
            )
        printed_page, pdf_page = statement_pages[fiscal_year]
        totals = {}
        for measure in required_totals:
            total = audited_totals[fiscal_year][measure]
            if total["final_budget"] == "" or total["actual"] == "":
                raise ValueError(
                    f"FY{fiscal_year} {measure} lacks a final budget or audited actual"
                )
            budget, actual = int(total["final_budget"]), int(total["actual"])
            budget_form = printed_forms.get((fiscal_year, measure, "budget"))
            actual_form = printed_forms.get((fiscal_year, measure, "actual"))
            if budget == 0 and budget_form is None:
                raise ValueError(f"FY{fiscal_year} {measure} budget zero lacks a printed-form classification")
            if actual == 0 and actual_form is None:
                raise ValueError(f"FY{fiscal_year} {measure} actual zero lacks a printed-form classification")
            if budget != 0 and budget_form is not None:
                raise ValueError(f"FY{fiscal_year} {measure} budget has a printed-form override but is nonzero")
            if actual != 0 and actual_form is not None:
                raise ValueError(f"FY{fiscal_year} {measure} actual has a printed-form override but is nonzero")
            if budget_form:
                used_printed_form_keys.add((fiscal_year, measure, "budget"))
            if actual_form:
                used_printed_form_keys.add((fiscal_year, measure, "actual"))
            totals[measure] = {
                "budget": budget,
                "budget_printed_form": budget_form["printed_form"] if budget_form else None,
                "actual": actual,
                "actual_printed_form": actual_form["printed_form"] if actual_form else None,
                "printed_page": printed_page,
                "pdf_page": pdf_page,
            }

        # The residual is what makes `net_change == revenue - expenditure + transfers_in +
        # transfers_out` false without it (transfers_out is stored negative, so it is added,
        # not subtracted). Sum each column's printed components and assert they close that
        # exact gap; a wrong or missing component would otherwise ship a comparison whose
        # own totals don't foot, silently.
        residual_components = []
        residual_sums: dict[str, int] = {}
        if fiscal_year in residuals_by_year:
            used_residual_years.add(fiscal_year)
        for row in residuals_by_year.get(fiscal_year, []):
            column = row["column"]
            if column not in {"actual", "final_budget"}:
                raise ValueError(
                    f"FY{fiscal_year} residual component {row['component']!r} has an "
                    f"unrecognized column {column!r}"
                )
            amount = int(row["amount"])
            residual_sums[column] = residual_sums.get(column, 0) + amount
            residual_components.append({
                "column": column,
                "label": row["component"],
                "amount": amount,
                "source_page": printed_page,
                "source_code": source_code,
            })
        residual_components.sort(key=lambda c: (c["column"], c["label"]))

        # "actual" residuals close the gap in the audited-actual column; "final_budget"
        # residuals close the same gap in the Final Budget column. The payload's own
        # per-measure dict keys the budget side "budget" (it holds the CSV's final_budget
        # value), so that is the key a final_budget-column residual must check against.
        totals_measure_key = {"actual": "actual", "final_budget": "budget"}
        for column, component_sum in residual_sums.items():
            measure_key = totals_measure_key[column]
            identity_residual = totals["net_change"][measure_key] - (
                totals["total_revenues"][measure_key]
                - totals["total_expenditures"][measure_key]
                + totals["transfers_in"][measure_key]
                + totals["transfers_out"][measure_key]
            )
            if component_sum != identity_residual:
                raise ValueError(
                    f"FY{fiscal_year} {column} residual components sum to "
                    f"{component_sum:,} but the flow identity (net change minus revenue, "
                    f"expenditure and transfers) requires {identity_residual:,}"
                )
        totals["residual_components"] = residual_components

        payload = {
            "fiscal_year": fiscal_year,
            "source": {
                "source_code": source_code,
                "document_title_version": document_title,
                "source_url": source_url,
            },
            "totals": totals,
            "revenue_categories": [],
            "spending_categories": [],
        }
        for row in year_rows:
            section = row["section"]
            payload[section].append({
                # `label` is the stable display name; `source_label` is the county's printed
                # wording for that year, which drifts. Both ship, so a citation can be
                # checked against the page without the series breaking between years.
                "label": row["label"],
                "source_label": row["source_label"],
                "canonical_key": row["canonical_key"],
                "budget": int(row["budget"]),
                "actual": int(row["actual"]),
                "contribution": int(row["contribution"]),
                "pdf_page": int(row["pdf_page"]),
                "printed_page": int(row["printed_page"]),
            })

        path = (
            out_dir / "data" / "v2" / "comparisons"
            / f"general-fund-fy{fiscal_year}-budget-actual.json"
        )
        _write_json(path, payload)
        written.append(path)
        for measure in required_totals:
            total = totals[measure]
            total_download_rows.append({
                "fiscal_year": fiscal_year,
                "measure": measure,
                "budget": total["budget"],
                "budget_printed_form": total["budget_printed_form"] or "",
                "actual": total["actual"],
                "actual_printed_form": total["actual_printed_form"] or "",
                "basis": "ACFR final amended budget vs budget-basis actual",
                "source_code": source_code,
                "source_url": source_url,
                "pdf_page": total["pdf_page"],
                "printed_page": total["printed_page"],
                "note_ids": ";".join(_note_ids_for(
                    notes,
                    fiscal_year,
                    # A comparison contains both budget and actual, not one status.
                    status_class=None,
                    dataset="general_fund_budget_actual_comparison",
                    printed_form=total["budget_printed_form"] or total["actual_printed_form"],
                )),
            })

    unused_printed_forms = sorted(set(printed_forms) - used_printed_form_keys)
    if unused_printed_forms:
        raise ValueError(f"unused printed-form overrides: {unused_printed_forms}")

    unused_residual_years = sorted(set(residuals_by_year) - used_residual_years)
    if unused_residual_years:
        raise ValueError(
            f"general_fund_flow_residuals.csv has residuals for years with no comparison "
            f"entry: {unused_residual_years}"
        )

    # An explicit manifest, so the app knows which years have a comparison without probing
    # the filesystem for files that may not exist. FY2026 has no audited actual yet and is
    # deliberately absent.
    index_path = out_dir / "data" / "v2" / "comparisons" / "index.json"
    # The downloads page describes the granularity from this manifest rather than from a
    # sentence that can outlive the export shape. A new section therefore has to cross the
    # exporter, schema, formatter and unit gate before the trust page can promise it.
    _write_json(index_path, {"fiscal_years": sorted(by_year), "sections": sections})
    written.append(index_path)
        # The dataset was app-only JSON. The downloads page said "everything behind this site
    # is available as CSV" while the flagship budget-versus-actual dataset had no file at
    # all, and the caveat that governs it (the comparison uses the ACFR final budget, not
    # the adopted figure) lived only on the page.
    #
    # Every row now names the notes that qualify it. R3's scenario is someone plotting a
    # downloaded series, seeing a step, and publishing "up 50%" attributed to this site —
    # a note_ids column is what stands between that reader and the explanation.
    downloads = out_dir / "public" / "downloads" / "comparisons"
    downloads.mkdir(parents=True, exist_ok=True)
    source_rows = _read_comparison_source()
    fieldnames = list(source_rows[0].keys()) + ["note_ids"]
    by_year: dict[str, list[dict]] = {}
    for row in source_rows:
        by_year.setdefault(row["fiscal_year"], []).append({
            **row,
            "note_ids": ";".join(_note_ids_for(
                notes,
                int(row["fiscal_year"]),
                status_class=None,
                dataset="general_fund_budget_actual_comparison",
                line=row["canonical_key"],
            )),
        })
    for year, rows_for_year in sorted(by_year.items()):
        path = downloads / f"general-fund-fy{year}-budget-actual.csv"
        with path.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
            w.writeheader()
            w.writerows(rows_for_year)
        written.append(path)

    totals_path = downloads / "general-fund-totals-budget-actual.csv"
    total_fieldnames = [
        "fiscal_year",
        "measure",
        "budget",
        "budget_printed_form",
        "actual",
        "actual_printed_form",
        "basis",
        "source_code",
        "source_url",
        "pdf_page",
        "printed_page",
        "note_ids",
    ]
    with totals_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=total_fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(total_download_rows)
    written.append(totals_path)

    return written


def _read_comparison_source() -> list[dict]:
    path = _ROOT / "data" / "production" / "general_fund_budget_actual_comparison.csv"
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _contiguous_year_ranges(years: set[int]) -> list[tuple[int, int]]:
    ordered = sorted(years)
    if not ordered:
        return []
    ranges: list[tuple[int, int]] = []
    start = previous = ordered[0]
    for year in ordered[1:]:
        if year == previous + 1:
            previous = year
            continue
        ranges.append((start, previous))
        start = previous = year
    ranges.append((start, previous))
    return ranges


def _source_footnote_notes(conn) -> list[dict]:
    """Turn source-page footnotes into entity/year notes without using chosen citations.

    Applicability comes from the source record's printed columns. That is load-bearing for
    Natural Resources: the FY2024-25 book stars FY2024 and FY2025, but those observations
    are not retained after the later FY2026 book supplies the canonical values.
    """
    path = _ROOT / "data" / "production" / "source_footnotes.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        source_rows = list(csv.DictReader(handle))

    grouped: dict[tuple[str, str, str, str], dict[str, object]] = {}
    for row in source_rows:
        entity_ids = {
            entity_id
            for entity_id, in conn.execute(
                f"SELECT DISTINCT lm.entity_id FROM observation o "
                f"JOIN label_map lm ON {CONFIRMED_MATCH_SQL} "
                "WHERE o.source_code=? AND o.table_section IS ? AND o.original_label=?",
                (row["source_code"], row["table_section"], row["original_label"]),
            )
        }
        if len(entity_ids) != 1:
            raise ValueError(
                f"source footnote {row['source_code']} / {row['table_section']} / "
                f"{row['original_label']!r} resolves to entities {sorted(entity_ids)}"
            )
        entity_id = next(iter(entity_ids))
        status = row["review_status"]
        text = row["footnote_text"]
        marker = row["marker"]
        key = (entity_id, status, marker, text)
        bucket = grouped.setdefault(key, {"years": set(), "source_ranges": []})
        row_years = {
            int(value) for value in row["printed_year_columns"].split(";") if value
        }
        bucket["years"].update(row_years)
        bucket["source_ranges"].append(
            (row_years, f"{row['source_code']}, p.{row['printed_page']}")
        )

    notes: list[dict] = []
    for (entity_id, status, marker, source_text), values in sorted(grouped.items()):
        for start, end in _contiguous_year_ranges(values["years"]):
            identity = f"{entity_id}|{status}|{marker}|{source_text}|{start}|{end}"
            suffix = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:10]
            missing = status == "human_confirmed_missing_text"
            range_years = set(range(start, end + 1))
            source_refs = {
                source_ref
                for source_years, source_ref in values["source_ranges"]
                if source_years & range_years
            }
            notes.append(
                {
                    "note_id": f"note.source-footnote.{entity_id}.{suffix}",
                    "scope_type": "entity",
                    "scope_value": entity_id,
                    "fiscal_year_start": str(start),
                    "fiscal_year_end": str(end),
                    "note_type": "source_footnote",
                    "severity": "warning" if missing else "info",
                    "render_contract": "footnote",
                    "headline": (
                        f"Unresolved source marker: {marker}"
                        if missing else f"Source footnote: {marker}"
                    ),
                    "text": (
                        "The county prints this marker but does not define it on the cited "
                        "page or elsewhere in this budget book."
                        if missing else source_text
                    ),
                    "source_ref": "; ".join(sorted(source_refs)),
                    "status_class": "",
                }
            )
    return notes


def _read_download_notes(conn) -> list[dict]:
    path = _ROOT / "data" / "production" / "data_notes.csv"
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    rows.extend(_source_footnote_notes(conn))
    note_ids = [row["note_id"] for row in rows]
    if len(note_ids) != len(set(note_ids)):
        raise ValueError("base and source-footnote note IDs collide")
    return rows


def _note_ids_for(
    notes: list[dict],
    fiscal_year: int,
    *,
    status_class: str | None = None,
    entity_id: str | None = None,
    series_kind: str | None = None,
    dataset: str | None = None,
    line: str | None = None,
    printed_form: str | None = None,
) -> list[str]:
    """Caveats whose year, status AND declared scope reach one downloadable figure."""
    applicable: list[str] = []
    for note in notes:
        start = note["fiscal_year_start"].strip()
        end = note["fiscal_year_end"].strip()
        if start and fiscal_year < int(start):
            continue
        if end and fiscal_year > int(end):
            continue
        note_status = note.get("status_class", "").strip()
        if note_status and note_status != status_class:
            continue

        scope_type = note["scope_type"].strip()
        scope_value = note["scope_value"].strip()
        if scope_type == "fiscal_year":
            in_scope = True
        elif scope_type == "series":
            in_scope = bool(scope_value and scope_value == series_kind)
        elif scope_type == "entity":
            in_scope = bool(scope_value and scope_value == entity_id)
        elif scope_type == "dataset":
            in_scope = bool(scope_value and scope_value == dataset)
        elif scope_type == "line":
            in_scope = bool(scope_value and scope_value == line)
        elif scope_type == "printed_form":
            in_scope = printed_form in {value for value in scope_value.split(";") if value}
        else:
            raise ValueError(
                f"{note['note_id']}: download reach is undefined for scope_type {scope_type!r}"
            )
        if in_scope:
            applicable.append(note["note_id"])
    return sorted(applicable)


def _export_v2(
    conn,
    out_dir: Path,
    citations,
    alt_index,
    already_written: set[str],
    notes: list[dict],
) -> list[Path]:
    data_dir = out_dir / "data" / "v2"
    downloads_dir = out_dir / "public" / "downloads" / "v2"
    written: list[Path] = []
    entities = _load_v2_entities(conn)
    relationships = _load_v2_relationships(conn)
    statements = _load_v2_statements(conn, citations)
    coverage = _load_v2_scope_coverage(conn)
    fy_min, fy_max = _fy_bounds(conn)
    succession = _succession(conn)
    pages = {
        entity_id: _build_v2_entity_page(
            conn, entities[entity_id], citations, alt_index, succession
        )
        for entity_id in sorted(entities)
    }
    coverage_page_entity_count, coverage_page_route_count = _coverage_page_counts(
        pages, coverage, relationships, statements
    )

    manifest = {
        "schema_version": 2,
        "fiscal_year_min": fy_min,
        "fiscal_year_max": fy_max,
        "entity_count": len(entities),
        "relationship_count": len(relationships),
        "statement_count": len(statements),
        "statement_instance_count": sum(len(s["instances"]) for s in statements),
        "coverage_record_count": len(coverage),
        "coverage_page_entity_count": coverage_page_entity_count,
        "coverage_page_route_count": coverage_page_route_count,
    }
    json_files = {
        "manifest.json": manifest,
        "entities.json": [entities[entity_id] for entity_id in sorted(entities)],
        "relationships.json": relationships,
        "statements.json": statements,
        "coverage.json": coverage,
    }
    for filename, payload in json_files.items():
        path = data_dir / filename
        _write_json(path, payload)
        written.append(path)
    for entity_id in sorted(entities):
        path = data_dir / "pages" / f"{entity_id}.json"
        page = pages[entity_id]
        _write_json(path, page)
        written.append(path)

        # Every entity page offers its own series as a CSV, so the download link on it is
        # never a broken promise. The v1 export covers only the 134 entities that existed
        # before the accounting model landed; the 46 added since -- balances, financing,
        # transfers -- had pages but no file behind the link.
        #
        # Keyed on what THIS RUN wrote, not on what is on disk: a filesystem check would
        # let a leftover file from an older export suppress the write and go on being
        # served.
        if entity_id not in already_written:
            series_path = out_dir / "public" / "downloads" / "series" / f"{entity_id}.csv"
            _write_series_csv(series_path, page["series"], notes, entity_id)
            written.append(series_path)

    csv_specs = [
        (
            "relationships.csv",
            ["relationship_id", "from_entity_id", "to_entity_id", "relationship_type",
             "traceability_level", "is_additive", "effective_from_fy", "effective_to_fy",
             "restriction_note", "relationship_note", "source_code"],
            "SELECT relationship_id,from_entity_id,to_entity_id,relationship_type,"
            "traceability_level,is_additive,effective_from_fy,effective_to_fy,"
            "restriction_note,relationship_note,source_code FROM entity_relationship "
            "ORDER BY relationship_id",
        ),
        (
            "statements.csv",
            ["statement_id", "canonical_name", "scope_entity_id", "statement_type",
             "effective_from_fy", "effective_to_fy", "statement_note"],
            "SELECT statement_id,canonical_name,scope_entity_id,statement_type,"
            "effective_from_fy,effective_to_fy,statement_note FROM accounting_statement "
            "ORDER BY statement_id",
        ),
        (
            "statement-members.csv",
            ["statement_id", "entity_id", "member_role", "display_order", "arithmetic_sign",
             "subtotal_group", "status_class", "is_required", "effective_from_fy", "effective_to_fy"],
            "SELECT statement_id,entity_id,member_role,display_order,arithmetic_sign,"
            "subtotal_group,status_class,is_required,effective_from_fy,effective_to_fy "
            "FROM statement_member ORDER BY statement_id,display_order,entity_id",
        ),
        (
            "statement-instances.csv",
            ["statement_id", "fiscal_year", "source_code", "status_class", "validation_status", "validation_note"],
            "SELECT statement_id,fiscal_year,source_code,status_class,validation_status,validation_note "
            "FROM statement_instance ORDER BY statement_id,fiscal_year",
        ),
        (
            "scope-coverage.csv",
            ["scope_entity_id", "domain", "fiscal_year", "coverage_level", "status_classes",
             "gap_note", "source_code"],
            "SELECT scope_entity_id,domain,fiscal_year,coverage_level,status_classes,gap_note,"
            "source_code FROM scope_coverage ORDER BY scope_entity_id,domain,fiscal_year",
        ),
    ]
    for filename, headers, query in csv_specs:
        path = downloads_dir / filename
        _write_query_csv(path, headers, conn.execute(query).fetchall())
        written.append(path)
    return written


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------

# Directories the exporter OWNS entirely: every file in them is generated here, one per
# entity. Anything else under web/data or web/public/downloads is hand-placed or written by
# a different generator and must not be touched.
_MANAGED_DIRS = (
    ("data", "pages"),
    ("data", "v2", "pages"),
    ("data", "v2", "comparisons"),
    ("public", "downloads", "comparisons"),
    ("public", "downloads", "series"),
)


def _prune_stale(out_dir: Path, written: list[Path]) -> list[Path]:
    """Delete generated per-entity files that this run did not write.

    Without this, removing an entity leaves its page and its CSV behind forever. They stay
    committed, they stay downloadable, and nothing fails — a resident could still fetch
    `dept.medicalexamienr.csv` for a department that no longer exists in the model, which is
    worse than a 404 because it looks authoritative.

    Deliberately narrow. Only the three directories above are swept, only files whose suffix
    the exporter produces, and only when this run actually wrote something into that
    directory — so an aborted or partial run cannot empty the site.
    """
    kept = {path.resolve() for path in written}
    removed: list[Path] = []

    for parts in _MANAGED_DIRS:
        directory = out_dir.joinpath(*parts)
        if not directory.is_dir():
            continue
        wrote_here = any(path.resolve().parent == directory.resolve() for path in written)
        if not wrote_here:
            continue
        for existing in sorted(directory.iterdir()):
            if not existing.is_file() or existing.suffix not in {".json", ".csv"}:
                continue
            if existing.resolve() not in kept:
                existing.unlink()
                removed.append(existing)
    return removed


def export_app(conn: sqlite3.Connection, out_dir: Path) -> list[Path]:
    """Read ``conn`` (an open connection to gc_budget.sqlite) and write
    web/data/ + web/public/downloads/ under ``out_dir``. Returns every path
    written, for callers that want to assert on the file set."""
    data_dir = out_dir / "data"
    downloads_dir = out_dir / "public" / "downloads"
    written: list[Path] = []
    notes = _read_download_notes(conn)

    entities = _load_entities(conn)
    sources = _load_sources(conn)
    coverage_by_fy = _load_coverage(conn)
    children_index, parent_index = _load_hierarchy_edges(conn)
    canonical_index = _load_canonical(conn)
    rollup_index = _load_rollups(conn)
    alt_index = _load_alternatives(conn)
    citations = _load_observation_citations(conn)
    fy_min, fy_max = _fy_bounds(conn)

    whole_budget_by_year = {
        fy: value for fy, (value, _status, _form, _obs) in
        canonical_index.get((_WHOLE_BUDGET_ENTITY, "adopted"), {}).items()
    }

    # entities.json
    entities_path = data_dir / "entities.json"
    _write_json(entities_path, [entities[eid] for eid in sorted(entities)])
    written.append(entities_path)

    # sources.json
    sources_path = data_dir / "sources.json"
    _write_json(sources_path, sources)
    written.append(sources_path)

    # years.json
    years_path = data_dir / "years.json"
    _write_json(years_path, _build_years(conn, coverage_by_fy, canonical_index))
    written.append(years_path)

    # pages/<entity_id>.json + per-entity series CSV
    for entity_id in sorted(entities):
        page = _build_page(entity_id, entities, children_index, parent_index, canonical_index,
                            rollup_index, alt_index, citations, whole_budget_by_year, fy_min, fy_max)
        page_path = data_dir / "pages" / f"{entity_id}.json"
        _write_json(page_path, page)
        written.append(page_path)

        csv_path = downloads_dir / "series" / f"{entity_id}.csv"
        _write_series_csv(csv_path, page["series"], notes, entity_id)
        written.append(csv_path)

    # per-year whole-budget-tree CSV (the additive budget.total tree only --
    # funds + named Special Revenue sub-funds; GF department detail, ISF, and
    # revenue have their own per-entity series CSVs above, since mixing
    # non-additive data into a file named "whole-budget-tree" would misstate
    # what it sums to).
    for fy in range(fy_min, fy_max + 1):
        rows = _budget_tree_rows(
            fy, children_index, entities, canonical_index, citations, notes
        )
        tree_path = downloads_dir / "tree" / f"whole-budget-{fy}.csv"
        _write_tree_csv(tree_path, rows)
        written.append(tree_path)

    written.extend(_export_v2(conn, out_dir, citations, alt_index, set(entities), notes))
    written.extend(_export_general_fund_budget_actual_comparison(out_dir, notes))
    written.extend(_export_data_notes(out_dir, notes))
    written.extend(_export_verification_status(out_dir))
    written.extend(_export_search_index(conn, out_dir))
    written.extend(_export_transfers(out_dir))
    written.extend(_export_pending_years(out_dir))

    # Calendar-year property levies are separate from budget appropriations, but are
    # still published data: include them before computing the site data version.
    from scripts.property_tax import export_property_tax
    written.extend(export_property_tax(out_dir))

    # LAST, and it must stay last: the data version is a hash of everything written above.
    # Run it earlier and the stamp silently describes a subset of the site.
    written.extend(_export_corrections_and_version(out_dir))

    for stale in _prune_stale(out_dir, written):
        print(f"pruned stale artifact: {stale.relative_to(out_dir)}")

    return written


def _assert_build_is_fresh(db_path: Path) -> None:
    """Refuse to export from a build older than its inputs.

    When the pipeline fails its validation gates it prints "artifacts not written" and
    leaves the previous `dist/` in place. `export_app` would then run happily against that
    stale build and report OK, publishing the last GOOD data as though it were the current
    data — the failure is invisible precisely because everything says OK.

    Hit twice in one session: once when a stale generator broke 13 rollups, and once while
    testing the data-version hash, where it produced a confidently wrong "the version did
    not change" result. The second time cost twenty minutes of debugging the wrong thing.
    """
    if not db_path.exists():
        raise SystemExit(f"{db_path} does not exist — run scripts.production.pipeline first")
    build_time = db_path.stat().st_mtime
    inputs = [_ROOT / "audit" / "blind-extraction", _ROOT / "data" / "production",
              _ROOT / "data" / "recovered"]
    newer = [
        path for root in inputs if root.exists()
        for path in root.rglob("*") if path.is_file() and path.stat().st_mtime > build_time
    ]
    if newer:
        shown = ", ".join(str(p.relative_to(_ROOT)) for p in sorted(newer)[:3])
        raise SystemExit(
            f"refusing to export: {len(newer)} input file(s) are newer than the build "
            f"({shown}{', …' if len(newer) > 3 else ''}).\n"
            "The pipeline either was not run or failed its gates and left the previous "
            "dist/ in place. Run `python3 -m scripts.production.pipeline` and read its output."
        )


def _default_paths() -> dict[str, Path]:
    return {
        "db": _ROOT / "dist" / "gc_budget.sqlite",
        "out": _ROOT / "web",
    }


def main(argv: list[str] | None = None) -> int:
    defaults = _default_paths()
    parser = argparse.ArgumentParser(
        description="Export dist/gc_budget.sqlite into web/data + web/public/downloads.")
    parser.add_argument("--db", type=Path, default=defaults["db"])
    parser.add_argument("--out", type=Path, default=defaults["out"])
    args = parser.parse_args(argv)

    if not args.db.exists():
        print(f"ERROR: {args.db} does not exist -- run the pipeline first "
              "(python3 -m scripts.production.pipeline)")
        return 1

    _assert_build_is_fresh(args.db)

    conn = sqlite3.connect(args.db)
    try:
        written = export_app(conn, args.out)
    finally:
        conn.close()

    print(f"OK: exported {len(written)} files to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
