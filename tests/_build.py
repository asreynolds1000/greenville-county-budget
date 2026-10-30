"""One in-memory build shared by every test, mirroring the real pipeline exactly.

Four test modules each hand-rolled their own build, and each omitted stages
``run_pipeline`` performs: the recovery datasets, the post-freeze observation extension, and
the source-registry extension. The tests were therefore validating a build that is not the
one that ships, and the divergence surfaced the only way it can, as a foreign-key failure
the day production grew an input the fixtures did not know about.

If ``run_pipeline`` gains a stage, add it here, not in the individual test modules.
"""

from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from scripts.production.canonical import build_canonical, build_rollups
from scripts.production.dimensions import load_coverage, load_dimensions, load_sources
from scripts.production.ingest import ingest_observations
from scripts.production.schema import create_schema

ROOT = Path(__file__).resolve().parents[1]
BLIND = ROOT / "audit" / "blind-extraction"
DATA = ROOT / "data" / "production"
RECOVERED = ROOT / "data" / "recovered"


def full_build(conn: sqlite3.Connection | None = None) -> sqlite3.Connection:
    conn = conn or sqlite3.connect(":memory:")
    create_schema(conn)
    ingest_observations(
        conn,
        BLIND,
        recovery_dir=RECOVERED,
        extended_dir=DATA / "observations",
        printed_forms_path=DATA / "printed_cell_forms.csv",
    )
    load_sources(
        conn,
        BLIND / "official-source-registry.csv",
        extension_path=DATA / "source_registry_extension.csv",
    )
    load_coverage(conn, BLIND / "coverage-by-fiscal-year.csv")
    with tempfile.TemporaryDirectory() as tmp:
        load_dimensions(conn, DATA, BLIND, Path(tmp))
    build_canonical(conn)
    build_rollups(conn)
    return conn
