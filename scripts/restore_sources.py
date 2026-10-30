#!/usr/bin/env python3
"""Restore the source PDFs into data/raw/ and prove every file matches its recorded hash.

The repository tracks the county's documents by hash, not by bytes. This puts the bytes back:

    python3 -m scripts.restore_sources            # fetch whatever is missing, then verify all
    python3 -m scripts.restore_sources --check    # no network; fail if any file is absent or differs

For each document it tries the county's official URL first, then the byte-identical Internet
Archive capture recorded in `data/production/source_archive_captures.csv`. A download is kept
only if its sha256 equals the hash already committed in the manifest. The manifests are the
trusted record: this tool never writes them. (`scripts/fetch_sources.py` is a different tool:
it acquires NEW documents and records their hashes. Do not use it to restore.)

Budget books land in `data/raw/<path>`; ACFRs land in `data/raw/acfr/<filename>`.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from scripts.verify_sources import MANIFESTS, ROOT, TIMEOUT, USER_AGENT, sha256_file

CAPTURES = ROOT / "data" / "production" / "source_archive_captures.csv"

Fetch = Callable[[str, Path], None]


def http_fetch(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response, dest.open("wb") as out:
        while block := response.read(1 << 20):
            out.write(block)


def load_captures(path: Path = CAPTURES) -> dict[tuple[str, str], str]:
    """(manifest name, file) -> raw-bytes Wayback URL."""
    out: dict[tuple[str, str], str] = {}
    if not path.exists():
        return out
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            out[(row["manifest"], row["file"])] = (
                f"https://web.archive.org/web/{row['wayback_timestamp']}id_/{row['wayback_original']}"
            )
    return out


def candidate_urls(manifest: dict, entry: dict, captures: dict) -> list[str]:
    urls = []
    official = entry.get(manifest["url_key"]) if manifest["url_key"] else None
    if official:
        urls.append(official)
    archived = captures.get((manifest["name"], entry[manifest["path_key"]]))
    if archived:
        urls.append(archived)
    return urls


def restore(manifests: list[dict] = MANIFESTS, captures: dict | None = None,
            fetch: Fetch = http_fetch, check_only: bool = False) -> dict:
    captures = load_captures() if captures is None else captures
    report = {"present": [], "restored": [], "failed": []}
    for manifest in manifests:
        files = json.loads(Path(manifest["path"]).read_text(encoding="utf-8"))["files"]
        for entry in files:
            name, expected = entry[manifest["path_key"]], entry["sha256"]
            dest = Path(manifest["local_root"]) / name
            if dest.exists() and sha256_file(dest) == expected:
                report["present"].append(name)
                continue
            if check_only:
                reason = "absent" if not dest.exists() else "hash differs from the manifest"
                report["failed"].append({"file": name, "reasons": [reason]})
                continue
            reasons = []
            dest.parent.mkdir(parents=True, exist_ok=True)
            part = dest.with_name(dest.name + ".part")
            for url in candidate_urls(manifest, entry, captures):
                try:
                    fetch(url, part)
                except (urllib.error.URLError, TimeoutError, OSError) as err:
                    reasons.append(f"{url}: {err}")
                    continue
                actual = sha256_file(part)
                if actual == expected:
                    part.replace(dest)
                    report["restored"].append(name)
                    break
                reasons.append(f"{url}: sha256 {actual[:12]}… does not match the manifest")
            else:
                part.unlink(missing_ok=True)
                report["failed"].append({"file": name, "reasons": reasons or ["no URL known"]})
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true",
                        help="no network: fail if any document is absent or differs")
    args = parser.parse_args()
    report = restore(check_only=args.check)
    total = len(report["present"]) + len(report["restored"]) + len(report["failed"])
    print(f"{total} documents: {len(report['present'])} already present, "
          f"{len(report['restored'])} restored, {len(report['failed'])} failed")
    for failure in report["failed"]:
        print(f"  FAILED {failure['file']}")
        for reason in failure["reasons"]:
            print(f"      {reason}")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
