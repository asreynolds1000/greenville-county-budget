#!/usr/bin/env python3
"""Validate the built database against reconciliation and provenance invariants.

Errors fail the build. Warnings (unmapped labels, disputed canonical values,
marked coverage gaps) are expected during incremental curation and do not.
Reconciliation is checked at the observation level, independent of curation, so
a mapping mistake cannot mask a broken total.
"""

from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from scripts.production.dimensions import CONFIRMED_MATCH_SQL
from scripts.production.labels import normalize_label

_SR_TOTAL_KEY = normalize_label("TOTAL SPECIAL REVENUE FUND")
_REV_TOTAL_KEY = normalize_label("Total Estimated Financial Sources")
_GF_OPERATING_TOTAL_KEY = normalize_label("TOTAL OPERATING BUDGET")
_GF_OVERVIEW_NON_COMPONENT_KEYS = {
    normalize_label("Interfund Transfers"),
    normalize_label("TOTAL GENERAL FUND BUDGET"),
}
_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_UNMAPPED_ALLOWLIST = _ROOT / "data" / "production" / "unmapped_observation_allowlist.csv"
_UNMAPPED_ALLOWLIST_FIELDS = (
    "observation_id",
    "source_dataset",
    "source_row_ordinal",
    "fiscal_year",
    "original_label",
    "value",
    "source_code",
    "reason",
)


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _validate_unmapped_observations(
    conn, result: ValidationResult, allowlist_path: Path
) -> None:
    """Allow only the specifically reviewed, echo-checked unmapped observations.

    These rows are isolated component conflicts whose surrounding component series was not
    extracted. Mapping just the disagreement would publish a misleading fragment. The exact
    allowance keeps the frozen source evidence while making any new unmapped row an error.
    """
    if not allowlist_path.exists():
        result.errors.append(f"unmapped-observation allowlist is missing: {allowlist_path}")
        return

    with allowlist_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != _UNMAPPED_ALLOWLIST_FIELDS:
            result.errors.append(
                "unmapped-observation allowlist has unexpected columns: "
                f"{reader.fieldnames!r}"
            )
            return
        allowed: dict[str, tuple] = {}
        for line_number, row in enumerate(reader, 2):
            observation_id = row["observation_id"]
            if not observation_id or observation_id in allowed:
                result.errors.append(
                    f"unmapped-observation allowlist line {line_number} has a blank or duplicate id"
                )
                continue
            if not row["reason"].strip():
                result.errors.append(
                    f"unmapped-observation allowlist line {line_number} lacks a reason"
                )
            try:
                allowed[observation_id] = (
                    row["source_dataset"],
                    int(row["source_row_ordinal"]),
                    int(row["fiscal_year"]),
                    row["original_label"],
                    int(row["value"]),
                    row["source_code"],
                )
            except ValueError:
                result.errors.append(
                    f"unmapped-observation allowlist line {line_number} has a non-integer echo"
                )

    rows = conn.execute(
        f"SELECT o.observation_id,o.source_dataset,o.source_row_ordinal,o.fiscal_year,"
        f"o.original_label,o.value,o.source_code FROM observation o WHERE NOT EXISTS "
        f"(SELECT 1 FROM label_map lm WHERE {CONFIRMED_MATCH_SQL}) ORDER BY o.observation_id"
    ).fetchall()
    unmapped = {row[0]: tuple(row[1:]) for row in rows}

    unexpected = sorted(set(unmapped) - set(allowed))
    if unexpected:
        result.errors.append(
            f"{len(unexpected)} unreviewed observations have no confirmed entity mapping: "
            + ", ".join(unexpected)
        )

    stale = sorted(set(allowed) - set(unmapped))
    if stale:
        result.errors.append(
            f"{len(stale)} unmapped-observation allowances are stale or no longer unmapped: "
            + ", ".join(stale)
        )

    for observation_id in sorted(set(allowed) & set(unmapped)):
        if allowed[observation_id] != unmapped[observation_id]:
            result.errors.append(
                f"unmapped-observation allowance echo mismatch for {observation_id}: "
                f"allowlist={allowed[observation_id]!r}, observation={unmapped[observation_id]!r}"
            )


def _reconcile_whole_budget(conn, result: ValidationResult) -> None:
    funds: dict[tuple[int, str], int] = defaultdict(int)
    totals: dict[tuple[int, str], int] = {}
    for fy, sc, ft, inc, val in conn.execute(
        "SELECT fiscal_year, status_class, raw_fund_type, included_in_reported_total_budget, value "
        "FROM observation WHERE source_dataset='whole-budget-major-funds'"
    ):
        if ft == "Whole Budget":
            totals[(fy, sc)] = val
        elif inc == "yes":
            funds[(fy, sc)] += val
    for key in funds:
        if key not in totals:
            result.errors.append(
                f"whole-budget FY{key[0]} ({key[1]}): included funds present but no TOTAL BUDGET row")
    for key, total in totals.items():
        if funds.get(key, 0) != total:
            result.errors.append(
                f"whole-budget reconciliation FY{key[0]} ({key[1]}): "
                f"included funds {funds.get(key, 0)} != TOTAL BUDGET {total}")


def _reconcile_components(conn, dataset: str, total_key: str, label: str, result: ValidationResult) -> None:
    totals: dict[tuple[int, str], int] = {}
    comps: dict[tuple[int, str], int] = defaultdict(int)
    for fy, sc, lab, val in conn.execute(
        "SELECT fiscal_year, status_class, original_label, value FROM observation WHERE source_dataset=?",
        (dataset,),
    ):
        if normalize_label(lab) == total_key:
            totals[(fy, sc)] = val
        else:
            comps[(fy, sc)] += val
    for key in comps:
        if key not in totals:
            result.errors.append(
                f"{label} FY{key[0]} ({key[1]}): components present but no total row")
    for key, total in totals.items():
        if comps.get(key, 0) != total:
            result.errors.append(
                f"{label} reconciliation FY{key[0]} ({key[1]}): "
                f"components {comps.get(key, 0)} != total {total}")


def _reconcile_gf_operating_overview(conn, result: ValidationResult) -> None:
    """Validate the source-printed broad categories independently of curation.

    The overview also contains Interfund Transfers and the all-in General Fund
    total. Those reconcile in ``gf.outflow`` and are intentionally excluded
    from this operating-category subtotal.
    """
    totals: dict[tuple[int, str], int] = {}
    components: dict[tuple[int, str], int] = defaultdict(int)
    for fy, status_class, label, value in conn.execute(
        "SELECT fiscal_year, status_class, original_label, value FROM observation "
        "WHERE source_dataset='general-fund-operating-categories-and-transfers'"
    ):
        key = (fy, status_class)
        normalized = normalize_label(label)
        if normalized == _GF_OPERATING_TOTAL_KEY:
            totals[key] = value
        elif normalized not in _GF_OVERVIEW_NON_COMPONENT_KEYS:
            components[key] += value
    for key, total in totals.items():
        if components.get(key, 0) != total:
            result.errors.append(
                f"general-fund operating overview reconciliation FY{key[0]} "
                f"({key[1]}): components {components.get(key, 0)} != total {total}"
            )


def _statement_total(
    conn,
    statement_id: str,
    fiscal_year: int,
    source_code: str | None = None,
    instance_status_class: str | None = None,
) -> tuple[int, list[str]]:
    """Return the signed statement total and any member-resolution errors.

    A blank member ``status_class`` normally means the source publishes exactly
    one canonical status for that entity/year. If later actuals introduce a
    second status, the statement instance's controlled source selects the value
    from the document the statement represents.
    """
    total = 0
    errors: list[str] = []
    if source_code is None or instance_status_class is None:
        instance = conn.execute(
            "SELECT source_code,status_class FROM statement_instance "
            "WHERE statement_id=? AND fiscal_year=?",
            (statement_id, fiscal_year),
        ).fetchone()
        if instance:
            source_code = source_code or instance[0]
            instance_status_class = instance_status_class or instance[1]
    members = conn.execute(
        "SELECT entity_id, member_role, arithmetic_sign, status_class, is_required "
        "FROM statement_member WHERE statement_id=? "
        "AND (effective_from_fy IS NULL OR ? >= effective_from_fy) "
        "AND (effective_to_fy IS NULL OR ? <= effective_to_fy) "
        "ORDER BY display_order, entity_id",
        (statement_id, fiscal_year, fiscal_year),
    ).fetchall()
    for entity_id, member_role, sign, status_class, required in members:
        sql = (
            "SELECT cv.value, o.source_code FROM canonical_value cv "
            "LEFT JOIN observation o ON o.observation_id=cv.chosen_observation_id "
            "WHERE cv.entity_id=? AND cv.fiscal_year=? AND cv.measure_type='dollars' "
            "AND cv.value IS NOT NULL"
        )
        params: list = [entity_id, fiscal_year]
        resolved_status_class = status_class or instance_status_class
        if resolved_status_class:
            sql += " AND cv.status_class=?"
            params.append(resolved_status_class)
        rows = conn.execute(sql, params).fetchall()
        if not rows:
            if required:
                errors.append(
                    f"{statement_id} FY{fiscal_year}: required member {entity_id} "
                    f"({member_role}) has no canonical value"
                )
            continue
        if len(rows) > 1 and not resolved_status_class:
            source_rows = [row for row in rows if row[1] == source_code]
            if len(source_rows) == 1:
                rows = source_rows
        if len(rows) > 1:
            errors.append(
                f"{statement_id} FY{fiscal_year}: member {entity_id} ({member_role}) "
                "matches multiple status classes"
            )
            continue
        total += sign * rows[0][0]
    return total, errors


def _validate_accounting_statements(conn, result: ValidationResult) -> None:
    for statement_id, fiscal_year, source_code, status_class, expected_status in conn.execute(
        "SELECT statement_id, fiscal_year, source_code, status_class, validation_status "
        "FROM statement_instance "
        "ORDER BY statement_id, fiscal_year"
    ):
        if expected_status in ("not_applicable", "source_exception"):
            continue
        if expected_status == "pending":
            result.warnings.append(f"{statement_id} FY{fiscal_year} reconciliation is pending")
            continue
        total, member_errors = _statement_total(
            conn, statement_id, fiscal_year, source_code, status_class
        )
        result.errors.extend(member_errors)
        if not member_errors and total != 0:
            result.errors.append(
                f"{statement_id} FY{fiscal_year} declared reconciled but signed delta is {total}"
            )


# --- county-overview coverage honesty -------------------------------------------------
#
# The scopes the county overview renders. Every one of these must carry an explicit
# coverage state for every domain in every published year: a region with no data must say
# so in words, never render empty. A new fund group added to the overview belongs here, and
# the build will then refuse to ship until its coverage is stated.
OVERVIEW_SCOPES = (
    "budget.total",
    "fund.general",
    "fund.special-revenue",
    "fund.debt-service",
    "fund.enterprise",
    "fund.internal-service",
)
OVERVIEW_DOMAINS = ("inflow", "position", "outflow")

# Which accounting roles constitute money in, money out, and where it sits.
#
# `container` and `scope_total` map to outflow because a fund's figure in the county's
# Budget Expenditure Overview is its appropriation — what it is authorised to spend — not
# what it holds or receives. Verified against the printed table section for every fund.
#
# `informational_total` is deliberately absent. Today exactly one entity carries it (the
# General Fund revenue total) and it is plainly money in, but the role name does not carry
# a direction, so mapping it here would be an assumption about entities that do not exist
# yet. The revenue categories beneath it are `revenue` and already back every claim that
# total would back, so nothing is lost by leaving it out.
_ROLE_DOMAIN = {
    "revenue": "inflow",
    "financing_in": "inflow",
    "beginning_position": "position",
    "ending_position": "position",
    "net_position_change": "position",
    "position_adjustment": "position",
    "position_component": "position",
    "operating_use": "outflow",
    "financing_out": "outflow",
    "net_financing": "outflow",
    "container": "outflow",
    "scope_total": "outflow",
}


@dataclass(frozen=True)
class BackingValue:
    """One canonical value standing behind a coverage claim."""

    entity_id: str
    status_class: str
    source_code: str | None


def _scope_members(conn) -> dict[str, set[str]]:
    """Every entity whose values speak for a scope.

    Two edges reach a scope's data and both are needed. Hierarchy edges carry the funds and
    their named sub-funds; statement membership carries the revenue categories and balance
    components, which hang off accounting statements rather than the containment tree —
    `rev.total-estimated-financial-sources` has no parent edge to the General Fund at all.
    Miss the second and every inflow claim looks unbacked.
    """
    children: dict[str, set[str]] = defaultdict(set)
    for parent, child in conn.execute(
        "SELECT parent_entity_id, child_entity_id FROM hierarchy_edge"
    ):
        children[parent].add(child)
    for scope, member in conn.execute(
        "SELECT s.scope_entity_id, m.entity_id FROM accounting_statement s "
        "JOIN statement_member m ON m.statement_id = s.statement_id"
    ):
        children[scope].add(member)

    scopes = set(OVERVIEW_SCOPES) | {
        row[0] for row in conn.execute("SELECT DISTINCT scope_entity_id FROM scope_coverage")
    }
    members: dict[str, set[str]] = {}
    for scope in scopes:
        seen = {scope}
        frontier = [scope]
        while frontier:
            current = frontier.pop()
            for child in children.get(current, ()):
                if child not in seen:
                    seen.add(child)
                    frontier.append(child)
        members[scope] = seen
    return members


def scope_domain_backing(conn) -> dict[tuple[str, str, int], list[BackingValue]]:
    """Canonical values grouped by (scope, domain, fiscal year).

    Shared with `scripts.curation.gen_scope_coverage` so the generator and the gate that
    judges it agree on what "backed by data" means. They must not agree on what the
    coverage LEVEL is — that stays hand-authored, or the gate checks nothing.
    """
    members = _scope_members(conn)
    domain_of = {
        entity_id: _ROLE_DOMAIN[role]
        for entity_id, role in conn.execute(
            "SELECT entity_id, accounting_role FROM entity_accounting"
        )
        if role in _ROLE_DOMAIN
    }

    values: dict[str, list[tuple[int, str, str | None]]] = defaultdict(list)
    for entity_id, fiscal_year, status_class, source_code in conn.execute(
        "SELECT cv.entity_id, cv.fiscal_year, cv.status_class, o.source_code "
        "FROM canonical_value cv "
        "LEFT JOIN observation o ON o.observation_id = cv.chosen_observation_id "
        "WHERE cv.value IS NOT NULL"
    ):
        values[entity_id].append((fiscal_year, status_class, source_code))

    backing: dict[tuple[str, str, int], list[BackingValue]] = defaultdict(list)
    for scope, member_ids in members.items():
        for member_id in member_ids:
            domain = domain_of.get(member_id)
            if domain is None:
                continue
            for fiscal_year, status_class, source_code in values.get(member_id, ()):
                backing[(scope, domain, fiscal_year)].append(
                    BackingValue(member_id, status_class, source_code)
                )
    return backing


def _check_scope_coverage(conn, result: ValidationResult) -> None:
    """Coverage claims must be true in both directions.

    Claiming coverage that does not exist misleads a reader. Claiming absence that does
    exist is the subtler failure and the one this project has already shipped once: a page
    printed "not published" over four revenue components the same build was serving two
    clicks away. A gate that only checked for overclaiming would have passed that.
    """
    year_row = conn.execute(
        "SELECT MIN(fiscal_year), MAX(fiscal_year) FROM canonical_value "
        "WHERE entity_id='budget.total'"
    ).fetchone()
    if not year_row or year_row[0] is None:
        result.errors.append("no budget.total canonical values; cannot check coverage")
        return
    first_year, last_year = int(year_row[0]), int(year_row[1])

    rows = {}
    wordless = []
    for scope, domain, fiscal_year, level, gap_note in conn.execute(
        "SELECT scope_entity_id, domain, fiscal_year, coverage_level, gap_note "
        "FROM scope_coverage"
    ):
        rows[(scope, domain, fiscal_year)] = level
        if not (gap_note or "").strip():
            wordless.append(f"{scope}/{domain}/FY{fiscal_year}")

    # A level on its own is a badge. "Covered" without saying covered AT WHAT LEVEL is the
    # overclaim this project keeps producing, and on an `unavailable` region the note is
    # the only thing there is to read.
    if wordless:
        result.errors.append(
            f"{len(wordless)} coverage states have no note saying what is and is not "
            f"there: {', '.join(sorted(wordless)[:5])}"
            f"{', …' if len(wordless) > 5 else ''}"
        )
    backing = scope_domain_backing(conn)

    missing = [
        (scope, domain, fy)
        for scope in OVERVIEW_SCOPES
        for domain in OVERVIEW_DOMAINS
        for fy in range(first_year, last_year + 1)
        if (scope, domain, fy) not in rows
    ]
    if missing:
        shown = ", ".join(f"{s}/{d}/FY{y}" for s, d, y in missing[:5])
        result.errors.append(
            f"{len(missing)} county-overview coverage states are missing ({shown}"
            f"{', …' if len(missing) > 5 else ''}). Absence must be stated, not rendered empty."
        )

    overclaimed: list[str] = []
    underclaimed: list[str] = []
    for (scope, domain, fiscal_year), level in sorted(rows.items()):
        count = len(backing.get((scope, domain, fiscal_year), ()))
        if level == "unavailable" and count:
            underclaimed.append(f"{scope}/{domain}/FY{fiscal_year} ({count} values)")
        elif level != "unavailable" and not count:
            overclaimed.append(f"{scope}/{domain}/FY{fiscal_year} ({level})")

    if underclaimed:
        result.errors.append(
            f"{len(underclaimed)} coverage states claim 'unavailable' but the build has "
            f"values for them: {', '.join(underclaimed[:5])}"
            f"{', …' if len(underclaimed) > 5 else ''}"
        )
    if overclaimed:
        result.errors.append(
            f"{len(overclaimed)} coverage states claim coverage nothing backs: "
            f"{', '.join(overclaimed[:5])}{', …' if len(overclaimed) > 5 else ''}"
        )


def validate(conn, unmapped_allowlist_path: Path | None = None) -> ValidationResult:
    result = ValidationResult()

    unclassified = conn.execute(
        "SELECT COUNT(*) FROM entity e WHERE NOT EXISTS "
        "(SELECT 1 FROM entity_accounting ea WHERE ea.entity_id=e.entity_id)"
    ).fetchone()[0]
    if unclassified:
        result.errors.append(f"{unclassified} entities lack controlled accounting semantics")

    legacy_edges = conn.execute("SELECT COUNT(*) FROM hierarchy_edge").fetchone()[0]
    migrated_edges = conn.execute(
        "SELECT COUNT(*) FROM entity_relationship WHERE relationship_id LIKE 'hierarchy.%'"
    ).fetchone()[0]
    if migrated_edges != legacy_edges:
        result.errors.append(
            f"generalized relationship migration has {migrated_edges} hierarchy rows; "
            f"expected {legacy_edges}"
        )

    additive_stocks = conn.execute(
        "SELECT COUNT(*) FROM entity_relationship er "
        "JOIN entity_accounting ea ON ea.entity_id=er.to_entity_id "
        "WHERE er.is_additive=1 AND ea.value_semantics='stock'"
    ).fetchone()[0]
    if additive_stocks:
        result.errors.append(f"{additive_stocks} stock entities appear in additive flow relationships")

    missing_prov = conn.execute(
        "SELECT COUNT(*) FROM observation WHERE source_url IS NULL OR pdf_page IS NULL"
    ).fetchone()[0]
    if missing_prov:
        result.errors.append(f"{missing_prov} observations missing source_url or pdf_page")

    unclassified_zeros = conn.execute(
        "SELECT observation_id FROM observation "
        "WHERE value=0 AND (printed_form IS NULL OR printed_form_review_status IS NULL) "
        "ORDER BY observation_id"
    ).fetchall()
    if unclassified_zeros:
        shown = ", ".join(row[0] for row in unclassified_zeros[:5])
        result.errors.append(
            f"{len(unclassified_zeros)} zero-valued observations lack a reviewed printed-form "
            f"classification ({shown}{', …' if len(unclassified_zeros) > 5 else ''})"
        )

    classified_nonzeros = conn.execute(
        "SELECT observation_id FROM observation "
        "WHERE value<>0 AND (printed_form IS NOT NULL OR printed_form_review_status IS NOT NULL) "
        "ORDER BY observation_id"
    ).fetchall()
    if classified_nonzeros:
        shown = ", ".join(row[0] for row in classified_nonzeros[:5])
        result.errors.append(
            f"{len(classified_nonzeros)} nonzero observations have zero-cell printed-form "
            f"classifications ({shown}{', …' if len(classified_nonzeros) > 5 else ''})"
        )

    mismatched_canonical_forms = conn.execute(
        "SELECT cv.chosen_observation_id FROM canonical_value cv "
        "JOIN observation o ON o.observation_id=cv.chosen_observation_id "
        "WHERE cv.value=0 AND cv.printed_form IS NOT o.printed_form "
        "ORDER BY cv.chosen_observation_id"
    ).fetchall()
    if mismatched_canonical_forms:
        shown = ", ".join(row[0] for row in mismatched_canonical_forms[:5])
        result.errors.append(
            f"{len(mismatched_canonical_forms)} canonical zero values lost their chosen "
            f"observation's printed form ({shown}"
            f"{', …' if len(mismatched_canonical_forms) > 5 else ''})"
        )

    dangling_choice = conn.execute(
        "SELECT COUNT(*) FROM canonical_value cv WHERE cv.chosen_observation_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM observation o WHERE o.observation_id=cv.chosen_observation_id)"
    ).fetchone()[0]
    if dangling_choice:
        result.errors.append(f"{dangling_choice} canonical rows point at a missing observation")

    unknown_source = conn.execute(
        "SELECT COUNT(*) FROM observation WHERE source_code NOT IN (SELECT source_code FROM source)"
    ).fetchone()[0]
    if unknown_source:
        result.errors.append(f"{unknown_source} observations reference a source_code absent from the registry")

    isf_included = conn.execute(
        "SELECT COUNT(*) FROM observation WHERE raw_fund_type='Internal Service Fund' "
        "AND included_in_reported_total_budget='yes'"
    ).fetchone()[0]
    if isf_included:
        result.errors.append(f"{isf_included} Internal Service Fund rows are marked included in TOTAL BUDGET")

    ambiguous = conn.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT o.observation_id
            FROM observation o JOIN label_map lm ON {CONFIRMED_MATCH_SQL}
            GROUP BY o.observation_id
            HAVING COUNT(DISTINCT lm.entity_id) > 1
        )
        """
    ).fetchone()[0]
    if ambiguous:
        result.errors.append(
            f"{ambiguous} observations match more than one confirmed entity (ambiguous label_map)")

    _reconcile_whole_budget(conn, result)
    _reconcile_components(conn, "named-special-revenue-funds", _SR_TOTAL_KEY, "special-revenue", result)
    _reconcile_components(conn, "general-fund-broad-revenues", _REV_TOTAL_KEY, "broad-revenue", result)
    _reconcile_gf_operating_overview(conn, result)
    _validate_accounting_statements(conn, result)
    _check_scope_coverage(conn, result)

    # FY2022-FY2023 department detail must be a *marked* gap, never fabricated.
    for fy in (2022, 2023):
        row = conn.execute(
            "SELECT has_detail FROM coverage WHERE fiscal_year=? "
            "AND dataset='general-fund-department-appropriations'", (fy,)
        ).fetchone()
        if row is None:
            result.errors.append(f"FY{fy} department coverage marker is missing")
        elif row[0] == 0:
            result.warnings.append(f"FY{fy} General Fund department detail is a marked image-table gap")
        # has_detail == 1 means the detail is present (recovered or native) — no issue.

    _validate_unmapped_observations(
        conn, result, unmapped_allowlist_path or _DEFAULT_UNMAPPED_ALLOWLIST
    )

    disputed = conn.execute(
        "SELECT COUNT(*) FROM canonical_value WHERE canonical_status='disputed'"
    ).fetchone()[0]
    if disputed:
        result.warnings.append(f"{disputed} canonical values are disputed (unresolved cross-book tie)")

    adopted_nonrecon = conn.execute(
        "SELECT COUNT(*) FROM hierarchy_rollup WHERE reconciles=0 AND status_class='adopted'"
    ).fetchone()[0]
    if adopted_nonrecon:
        result.errors.append(
            f"{adopted_nonrecon} adopted hierarchy rollups do not reconcile")

    non_adopted_partial = conn.execute(
        "SELECT COUNT(*) FROM hierarchy_rollup WHERE reconciles=0 AND status_class<>'adopted'"
    ).fetchone()[0]
    if non_adopted_partial:
        result.warnings.append(
            f"{non_adopted_partial} non-adopted hierarchy rollups have partial coverage "
            "(retained for audit; outside the adopted publication gate)")

    return result
