#!/usr/bin/env python3
"""Production build-database schema for the Greenville County Budget Explorer.

The schema realizes the three-layer design: immutable source observations, the
human-curated interpretation dimensions, and the regenerated canonical layer.
It is created in a disposable in-process SQLite database on every pipeline run;
the git-tracked source of truth is the extraction CSVs plus curated dimension
CSVs, not this database.
"""

from __future__ import annotations

import sqlite3

TABLES: tuple[str, ...] = (
    "source",
    "status_class",
    "observation",
    "entity",
    "entity_type_accounting",
    "entity_accounting",
    "label_map",
    "hierarchy_edge",
    "entity_relationship",
    "accounting_statement",
    "statement_member",
    "statement_instance",
    "canonical_value",
    "canonical_alternative",
    "hierarchy_rollup",
    "coverage",
    "scope_coverage",
    "correction_log",
)

_DDL = """
CREATE TABLE source (
    source_code            TEXT PRIMARY KEY,
    document_title_version TEXT,
    official_url           TEXT,
    role                   TEXT,
    publication_order      INTEGER
);

CREATE TABLE status_class (
    status_class       TEXT PRIMARY KEY,
    is_comparable_group TEXT,
    display_label      TEXT
);

CREATE TABLE observation (
    observation_id                     TEXT PRIMARY KEY,
    fiscal_year                        INTEGER NOT NULL,
    value                              INTEGER NOT NULL,
    printed_form                       TEXT CHECK(printed_form IN ('0', '-', '--', '(0)', 'missing')),
    printed_form_review_status         TEXT CHECK(printed_form_review_status IN (
        'machine_classified', 'human_confirmed'
    )),
    measure_type                       TEXT NOT NULL DEFAULT 'dollars',
    status                             TEXT,
    status_class                       TEXT,
    original_label                     TEXT NOT NULL,
    table_section                      TEXT,
    raw_fund_type                      TEXT,
    raw_operating_category             TEXT,
    included_in_reported_total_budget  TEXT,
    source_code                        TEXT NOT NULL,
    document_title_version             TEXT,
    source_url                         TEXT,
    pdf_page                           INTEGER,
    printed_page                       INTEGER,
    ambiguity_flag                     TEXT,
    notes                              TEXT,
    treatment_note                     TEXT,
    conflict_group                     TEXT,
    conflict_note                      TEXT,
    source_dataset                     TEXT NOT NULL,
    source_row_ordinal                 INTEGER NOT NULL
);

CREATE TABLE entity (
    entity_id                 TEXT PRIMARY KEY,
    entity_type               TEXT NOT NULL,
    canonical_name            TEXT NOT NULL,
    common_aliases            TEXT,
    plain_language_description TEXT,
    restriction_note          TEXT,
    active_from_fy            INTEGER,
    active_to_fy              INTEGER
);

CREATE TABLE entity_presentation (
    entity_id                 TEXT PRIMARY KEY REFERENCES entity(entity_id),
    display_name              TEXT NOT NULL
);

CREATE TABLE entity_type_accounting (
    entity_type               TEXT PRIMARY KEY,
    accounting_role           TEXT NOT NULL CHECK(accounting_role IN (
        'scope_total', 'container', 'revenue', 'financing_in',
        'beginning_position', 'ending_position', 'net_position_change',
        'position_adjustment', 'position_component', 'operating_use',
        'financing_out', 'net_financing', 'informational_total'
    )),
    value_semantics           TEXT NOT NULL CHECK(value_semantics IN (
        'flow', 'stock', 'derived_change'
    )),
    normal_sign               TEXT NOT NULL CHECK(normal_sign IN (
        'positive', 'negative', 'source_signed'
    )),
    included_in_scope_total_default TEXT NOT NULL CHECK(
        included_in_scope_total_default IN ('yes', 'no', 'context_only')
    )
);

CREATE TABLE entity_accounting (
    entity_id                 TEXT PRIMARY KEY REFERENCES entity(entity_id),
    accounting_role           TEXT NOT NULL CHECK(accounting_role IN (
        'scope_total', 'container', 'revenue', 'financing_in',
        'beginning_position', 'ending_position', 'net_position_change',
        'position_adjustment', 'position_component', 'operating_use',
        'financing_out', 'net_financing', 'informational_total'
    )),
    value_semantics           TEXT NOT NULL CHECK(value_semantics IN (
        'flow', 'stock', 'derived_change'
    )),
    normal_sign               TEXT NOT NULL CHECK(normal_sign IN (
        'positive', 'negative', 'source_signed'
    )),
    included_in_scope_total   TEXT NOT NULL CHECK(
        included_in_scope_total IN ('yes', 'no', 'context_only')
    )
);

CREATE TABLE label_map (
    label_map_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    original_label   TEXT NOT NULL,
    match_scope      TEXT NOT NULL,
    table_section    TEXT,
    raw_operating_category TEXT,
    source_code      TEXT,
    entity_id        TEXT NOT NULL REFERENCES entity(entity_id),
    effective_from_fy INTEGER,
    effective_to_fy  INTEGER,
    mapping_note     TEXT,
    review_status    TEXT NOT NULL
);

CREATE TABLE hierarchy_edge (
    edge_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_entity_id TEXT NOT NULL REFERENCES entity(entity_id),
    child_entity_id  TEXT NOT NULL REFERENCES entity(entity_id),
    relationship     TEXT NOT NULL,
    effective_from_fy INTEGER,
    effective_to_fy  INTEGER,
    edge_note        TEXT
);

CREATE TABLE entity_relationship (
    relationship_id    TEXT PRIMARY KEY,
    from_entity_id     TEXT NOT NULL REFERENCES entity(entity_id),
    to_entity_id       TEXT NOT NULL REFERENCES entity(entity_id),
    relationship_type  TEXT NOT NULL CHECK(relationship_type IN (
        'contains', 'detail_view', 'inflow_to', 'position_of',
        'outflow_from', 'transfer_to', 'supports', 'related_to',
        -- The same work continuing under a different name, in a later year. Deliberately
        -- NOT additive and NOT a containment: it lets a reader follow a line across a
        -- rename without the site claiming the figures on either side are one series.
        -- Whether they are comparable is a separate question, answered by a data note.
        'succeeded_by'
    )),
    traceability_level TEXT NOT NULL CHECK(traceability_level IN (
        'exact', 'documented_association', 'structural', 'editorial_related'
    )),
    is_additive         INTEGER NOT NULL CHECK(is_additive IN (0, 1)),
    effective_from_fy   INTEGER,
    effective_to_fy     INTEGER,
    restriction_note    TEXT,
    relationship_note   TEXT,
    source_code          TEXT REFERENCES source(source_code),
    CHECK(is_additive = 0 OR relationship_type = 'contains'),
    CHECK(traceability_level IN ('structural', 'editorial_related') OR source_code IS NOT NULL)
);

CREATE TABLE accounting_statement (
    statement_id       TEXT PRIMARY KEY,
    canonical_name     TEXT NOT NULL,
    scope_entity_id    TEXT NOT NULL REFERENCES entity(entity_id),
    statement_type     TEXT NOT NULL CHECK(statement_type IN (
        'sources_and_uses', 'position_reconciliation', 'outflow_reconciliation',
        'financing_reconciliation', 'inflow_reconciliation'
    )),
    effective_from_fy  INTEGER,
    effective_to_fy    INTEGER,
    statement_note     TEXT
);

CREATE TABLE statement_member (
    statement_id       TEXT NOT NULL REFERENCES accounting_statement(statement_id),
    entity_id          TEXT NOT NULL REFERENCES entity(entity_id),
    member_role        TEXT NOT NULL,
    display_order      INTEGER NOT NULL,
    arithmetic_sign    INTEGER NOT NULL CHECK(arithmetic_sign IN (-1, 1)),
    subtotal_group     TEXT,
    status_class       TEXT,
    is_required        INTEGER NOT NULL CHECK(is_required IN (0, 1)),
    effective_from_fy  INTEGER,
    effective_to_fy    INTEGER,
    PRIMARY KEY (statement_id, entity_id, member_role)
);

CREATE TABLE statement_instance (
    statement_id       TEXT NOT NULL REFERENCES accounting_statement(statement_id),
    fiscal_year        INTEGER NOT NULL,
    source_code        TEXT NOT NULL REFERENCES source(source_code),
    status_class       TEXT REFERENCES status_class(status_class),
    validation_status  TEXT NOT NULL CHECK(validation_status IN (
        'pending', 'reconciled', 'not_applicable', 'source_exception'
    )),
    validation_note    TEXT,
    PRIMARY KEY (statement_id, fiscal_year)
);

CREATE TABLE canonical_value (
    entity_id               TEXT NOT NULL REFERENCES entity(entity_id),
    fiscal_year             INTEGER NOT NULL,
    status_class            TEXT NOT NULL,
    measure_type            TEXT NOT NULL,
    value                   INTEGER,
    printed_form            TEXT CHECK(printed_form IN ('0', '-', '--', '(0)', 'missing')),
    chosen_observation_id   TEXT REFERENCES observation(observation_id),
    canonical_status        TEXT NOT NULL,
    selection_rule          TEXT,
    corroborating_source_codes TEXT,
    PRIMARY KEY (entity_id, fiscal_year, status_class, measure_type)
);

CREATE TABLE canonical_alternative (
    entity_id        TEXT NOT NULL REFERENCES entity(entity_id),
    fiscal_year      INTEGER NOT NULL,
    status_class     TEXT NOT NULL,
    measure_type     TEXT NOT NULL,
    observation_id   TEXT NOT NULL REFERENCES observation(observation_id),
    value            INTEGER,
    printed_form     TEXT CHECK(printed_form IN ('0', '-', '--', '(0)', 'missing')),
    source_code      TEXT,
    publication_order INTEGER
);

CREATE TABLE hierarchy_rollup (
    entity_id           TEXT NOT NULL REFERENCES entity(entity_id),
    fiscal_year         INTEGER NOT NULL,
    status_class        TEXT NOT NULL,
    rolled_up_value     INTEGER,
    direct_value        INTEGER,
    reconciles          INTEGER,
    reconciliation_note TEXT,
    PRIMARY KEY (entity_id, fiscal_year, status_class)
);

CREATE TABLE coverage (
    fiscal_year INTEGER NOT NULL,
    dataset     TEXT NOT NULL,
    has_detail  INTEGER NOT NULL,
    gap_note    TEXT,
    PRIMARY KEY (fiscal_year, dataset)
);

CREATE TABLE scope_coverage (
    scope_entity_id TEXT NOT NULL REFERENCES entity(entity_id),
    domain          TEXT NOT NULL CHECK(domain IN (
        'inflow', 'position', 'outflow', 'relationship'
    )),
    fiscal_year     INTEGER NOT NULL,
    coverage_level  TEXT NOT NULL CHECK(coverage_level IN (
        'complete', 'partial', 'total_only', 'unavailable'
    )),
    status_classes  TEXT,
    gap_note        TEXT,
    source_code     TEXT REFERENCES source(source_code),
    PRIMARY KEY (scope_entity_id, domain, fiscal_year)
);

CREATE TABLE correction_log (
    correction_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    superseded_observation_id TEXT REFERENCES observation(observation_id),
    replacement_observation_id TEXT REFERENCES observation(observation_id),
    reason                  TEXT,
    corrected_at            TEXT
);
"""


def create_schema(conn: sqlite3.Connection) -> None:
    """Create every production table on ``conn`` and enable foreign keys."""
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_DDL)
    conn.commit()
