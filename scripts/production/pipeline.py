#!/usr/bin/env python3
"""Run the full production pipeline: build, validate, and materialize.

Usage:
    python3 -m scripts.production.pipeline

The build database is disposable; the git-tracked source of truth is the
extraction CSVs plus the curated dimension CSVs under ``data/production``.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

from scripts.production.schema import create_schema
from scripts.production.ingest import ingest_observations
from scripts.production.dimensions import load_sources, load_coverage, load_dimensions
from scripts.production.canonical import build_canonical, build_rollups
from scripts.production.validate import validate, ValidationResult
from scripts.production.validate_sources import validate_sources
from scripts.production.materialize import materialize

_ROOT = Path(__file__).resolve().parents[2]


def run_pipeline(blind_dir: Path, data_dir: Path, build_dir: Path, dist_dir: Path) -> ValidationResult:
    build_dir.mkdir(parents=True, exist_ok=True)
    db_path = build_dir / "gc_budget_build.sqlite"
    if db_path.exists():
        db_path.unlink()

    # Source gates run BEFORE the dimensional model is built. The model can only reconcile
    # what it ingests, so a defect in the frozen source CSVs survives every downstream check
    # by being internally consistent. Failing here costs a second; failing after publication
    # costs the project's credibility.
    source_errors = validate_sources(data_dir)
    if source_errors:
        result = ValidationResult()
        result.errors.extend(source_errors)
        return result

    conn = sqlite3.connect(db_path)
    try:
        create_schema(conn)
        ingest_observations(
            conn,
            blind_dir,
            recovery_dir=data_dir.parent / "recovered",
            extended_dir=data_dir / "observations",
            printed_forms_path=data_dir / "printed_cell_forms.csv",
        )
        load_sources(
            conn,
            blind_dir / "official-source-registry.csv",
            extension_path=data_dir / "source_registry_extension.csv",
        )
        load_coverage(conn, blind_dir / "coverage-by-fiscal-year.csv")
        load_dimensions(conn, data_dir, blind_dir, build_dir / "reports")
        build_canonical(conn)
        build_rollups(conn)
        result = validate(conn, data_dir / "unmapped_observation_allowlist.csv")
        if result.ok:
            materialize(conn, dist_dir)
        return result
    finally:
        conn.close()


def _default_paths() -> dict[str, Path]:
    return {
        "blind_dir": _ROOT / "audit" / "blind-extraction",
        "data_dir": _ROOT / "data" / "production",
        "build_dir": _ROOT / "build",
        "dist_dir": _ROOT / "dist",
    }


def main(argv: list[str] | None = None) -> int:
    defaults = _default_paths()
    parser = argparse.ArgumentParser(description="Build the Greenville County budget production data.")
    for name, default in defaults.items():
        parser.add_argument(f"--{name.replace('_', '-')}", type=Path, default=default)
    args = parser.parse_args(argv)

    result = run_pipeline(args.blind_dir, args.data_dir, args.build_dir, args.dist_dir)

    for w in result.warnings:
        print(f"WARN: {w}")
    for e in result.errors:
        print(f"ERROR: {e}")
    if result.ok:
        print(f"OK: build validated and materialized to {args.dist_dir}")
        return 0
    print(f"FAILED: {len(result.errors)} error(s); artifacts not written")
    return 1


if __name__ == "__main__":
    sys.exit(main())
