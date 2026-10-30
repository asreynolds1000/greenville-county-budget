#!/usr/bin/env python3
"""Build the canonical layer from mapped observations.

For each (entity, fiscal year, status class, measure) group of confirmed-mapped
observations:

- one distinct value (from any number of sources) -> ``single``, with the other
  sources recorded as corroboration, never as conflict;
- several distinct values -> the value from the latest-published book wins
  (``resolved``), and the beaten distinct values are retained as alternatives;
- a tie between differing values at the top publication order -> ``disputed``
  with a null value and every distinct value retained.
"""

from __future__ import annotations

from collections import defaultdict

from scripts.production.dimensions import CONFIRMED_MATCH_SQL

_MAPPED_QUERY = f"""
SELECT DISTINCT lm.entity_id, o.fiscal_year, o.status_class, o.measure_type,
       o.observation_id, o.value, o.printed_form, o.source_code, s.publication_order
FROM observation o
JOIN label_map lm ON {CONFIRMED_MATCH_SQL}
LEFT JOIN source s ON s.source_code = o.source_code
"""


def _rep_by_value(members: list[dict]) -> dict[int, dict]:
    """Reduce members to one representative per distinct value (highest order)."""
    best: dict[int, dict] = {}
    for m in members:
        v = m["value"]
        if v not in best or (m["order"] or -1) > (best[v]["order"] or -1):
            best[v] = m
    return best


def build_canonical(conn) -> None:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for entity_id, fy, sc, mt, oid, value, printed_form, code, order in conn.execute(_MAPPED_QUERY):
        groups[(entity_id, fy, sc, mt)].append(
            {
                "observation_id": oid,
                "value": value,
                "printed_form": printed_form,
                "source_code": code,
                "order": order,
            }
        )

    for (entity_id, fy, sc, mt), members in groups.items():
        by_value = _rep_by_value(members)
        alternatives: list[dict] = []
        corroborating = None

        if len(by_value) == 1:
            value = next(iter(by_value))
            chosen_member = by_value[value]
            chosen = chosen_member["observation_id"]
            status, rule = "single", None
            # Corroboration is agreement from a DIFFERENT source; the same printed
            # line extracted into two datasets shares one source_code and is not
            # cross-source corroboration.
            others = sorted({m["source_code"] for m in members} - {chosen_member["source_code"]})
            corroborating = ",".join(others) if others else None
        else:
            max_order = max((m["order"] or -1) for m in members)
            top_values = {m["value"] for m in members if (m["order"] or -1) == max_order}
            if len(top_values) == 1:
                value = next(iter(top_values))
                chosen = by_value[value]["observation_id"]
                status, rule = "resolved", "latest_book_wins"
                alternatives = [m for v, m in by_value.items() if v != value]
            else:
                value, chosen = None, None
                status, rule = "disputed", "latest_book_wins"
                alternatives = list(by_value.values())

        conn.execute(
            "INSERT INTO canonical_value(entity_id, fiscal_year, status_class, measure_type, "
            "value, printed_form, chosen_observation_id, canonical_status, selection_rule, "
            "corroborating_source_codes) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                entity_id,
                fy,
                sc,
                mt,
                value,
                by_value[value]["printed_form"] if chosen is not None else None,
                chosen,
                status,
                rule,
                corroborating,
            ),
        )
        for m in alternatives:
            conn.execute(
                "INSERT INTO canonical_alternative(entity_id, fiscal_year, status_class, "
                "measure_type, observation_id, value, printed_form, source_code, "
                "publication_order) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    entity_id,
                    fy,
                    sc,
                    mt,
                    m["observation_id"],
                    m["value"],
                    m["printed_form"],
                    m["source_code"],
                    m["order"],
                ),
            )
    conn.commit()


def build_rollups(conn) -> None:
    """Sum canonical children under year-scoped ``contains`` edges into rollups.

    Each parent gets a rollup per (fiscal year, status class) present among its
    children, compared to its own direct canonical total where one exists. Sums
    never cross status classes.
    """
    edges = conn.execute(
        "SELECT parent_entity_id, child_entity_id, effective_from_fy, effective_to_fy "
        "FROM hierarchy_edge WHERE relationship='contains'"
    ).fetchall()

    parent_children: dict[str, list[tuple]] = defaultdict(list)
    for parent, child, ef, et in edges:
        parent_children[parent].append((child, ef, et))

    for parent, children in parent_children.items():
        sums: dict[tuple[int, str], int] = defaultdict(int)
        contributors: dict[tuple[int, str], set] = defaultdict(set)
        for child, ef, et in children:
            for fy, sc, val in conn.execute(
                "SELECT fiscal_year, status_class, value FROM canonical_value "
                "WHERE entity_id=? AND value IS NOT NULL", (child,)
            ):
                if ef is not None and fy < ef:
                    continue
                if et is not None and fy > et:
                    continue
                sums[(fy, sc)] += val
                contributors[(fy, sc)].add(child)

        for (fy, sc), total in sums.items():
            potential = sum(
                1 for _child, ef, et in children
                if (ef is None or fy >= ef) and (et is None or fy <= et))
            contributed = len(contributors[(fy, sc)])
            partial = contributed < potential
            direct = conn.execute(
                "SELECT value FROM canonical_value WHERE entity_id=? AND fiscal_year=? "
                "AND status_class=? AND measure_type='dollars'", (parent, fy, sc)
            ).fetchone()
            direct_val = direct[0] if direct else None
            if direct_val is None:
                reconciles, note = None, "No direct reported total for comparison"
            elif direct_val == total:
                # Reconciles even if the roster has funds that don't exist every year.
                reconciles, note = 1, None
            elif partial:
                # Missing/disputed children explain the gap: coverage, not a book discrepancy.
                reconciles, note = 0, f"partial coverage: {contributed} of {potential} children present for {sc}"
            else:
                reconciles, note = 0, f"rollup {total} != reported {direct_val}"
            conn.execute(
                "INSERT OR REPLACE INTO hierarchy_rollup(entity_id, fiscal_year, status_class, "
                "rolled_up_value, direct_value, reconciles, reconciliation_note) VALUES (?,?,?,?,?,?,?)",
                (parent, fy, sc, total, direct_val, reconciles, note),
            )
    conn.commit()
