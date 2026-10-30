#!/usr/bin/env python3
"""Re-fetch every cited source document and prove it still says what we transcribed.

This is the check that closes the one failure mode that makes this project's core claim
false while every visible signal stays green.

A 404 announces itself: the link breaks, a reader notices, someone fixes it. A county that
re-posts a *corrected* budget book at the same URL does not announce itself. The link keeps
returning 200, the page keeps rendering, and every citation on the site quietly starts
pointing at a page that no longer shows the figure we read from it. Nothing in the build,
the tests, or the browser suite can see that.

`fetch_sources.py` has recorded a sha256 per file since the beginning. Nothing ever compared
against them. This does.

    python3 -m scripts.verify_sources              # every manifest
    python3 -m scripts.verify_sources --local      # no network; check the files on disk
    python3 -m scripts.verify_sources --json       # machine-readable, for scheduled runs

A changed hash is NOT a failure. A county revising its own document is legitimate, and
frequently it is news this project should act on. It exits non-zero so a scheduled run
surfaces it, and the report says which document changed so a human can decide whether the
transcription needs re-reading.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Every manifest of source-document hashes, and where each one's files live locally once
# restored with `python3 -m scripts.restore_sources` (see docs/source-corpus-and-restore.md).
MANIFESTS = [
    {
        "name": "budget books",
        "path": ROOT / "audit" / "source-files.json",
        "local_root": ROOT / "data" / "raw",
        "path_key": "path",
        "url_key": "url",
    },
    {
        "name": "ACFRs",
        "path": ROOT / "data" / "production" / "acfr_source_files.json",
        "local_root": ROOT / "data" / "raw" / "acfr",
        "path_key": "filename",
        "url_key": "official_url",
    },
]

TIMEOUT = 120
USER_AGENT = (
    "gvl-county-budget source verifier "
    "(independent civic transcription project; contact via repository)"
)


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(chunk):
            digest.update(block)
    return digest.hexdigest()


def sha256_url(url: str) -> tuple[str | None, str | None]:
    """Download and hash, or return the reason it could not be done.

    Deliberately streams to a digest rather than holding the file: the largest source is
    98 MiB and there are 70 of them.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    digest = hashlib.sha256()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                return None, f"HTTP {response.status}"
            while block := response.read(1 << 20):
                digest.update(block)
    except urllib.error.HTTPError as err:
        return None, f"HTTP {err.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        return None, f"unreachable: {err}"
    return digest.hexdigest(), None


def _source_urls_by_code() -> dict[str, str]:
    """Official URL per source_code, from the frozen registry plus its extension."""
    import csv

    out: dict[str, str] = {}
    for rel in (
        Path("audit") / "blind-extraction" / "official-source-registry.csv",
        Path("data") / "production" / "source_registry_extension.csv",
    ):
        path = ROOT / rel
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                code = (row.get("source_code") or "").strip()
                url = (row.get("official_url") or "").strip()
                if code and url:
                    out.setdefault(code, url)
    return out


def verify(local_only: bool = False) -> dict:
    registry = _source_urls_by_code()
    results: list[dict] = []

    for manifest in MANIFESTS:
        if not manifest["path"].exists():
            results.append({
                "manifest": manifest["name"],
                "status": "manifest_missing",
                "detail": str(manifest["path"].relative_to(ROOT)),
            })
            continue

        files = json.loads(manifest["path"].read_text(encoding="utf-8"))["files"]
        for entry in files:
            name = entry[manifest["path_key"]]
            expected = entry["sha256"]
            record = {
                "manifest": manifest["name"],
                "file": name,
                "source_code": entry.get("source_code"),
            }

            local_root = manifest["local_root"]
            if local_root is not None:
                local = local_root / name
                if local.exists():
                    actual = sha256_file(local)
                    record["local"] = "match" if actual == expected else "CHANGED"
                else:
                    record["local"] = "absent"
            else:
                record["local"] = "not held locally"

            if local_only:
                results.append(record)
                continue

            url = entry.get(manifest["url_key"]) if manifest["url_key"] else None
            if not url and entry.get("source_code"):
                url = registry.get(entry["source_code"])
            if not url:
                record["remote"] = "no url in the registry"
                results.append(record)
                continue

            actual, problem = sha256_url(url)
            if problem:
                record["remote"] = problem
            elif actual == expected:
                record["remote"] = "match"
            else:
                record["remote"] = "CHANGED"
                record["published_sha256"] = actual
                record["recorded_sha256"] = expected
            record["url"] = url
            results.append(record)

    changed = [r for r in results if "CHANGED" in (r.get("remote"), r.get("local"))]
    unreachable = [
        r for r in results
        if isinstance(r.get("remote"), str)
        and r["remote"] not in ("match", "CHANGED")
        and not r["remote"].startswith("no url")
    ]
    return {
        "checked": len(results),
        "changed": changed,
        "unreachable": unreachable,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true",
                        help="check the files on disk only; no network")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    report = verify(local_only=args.local)

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"checked {report['checked']} source document(s)")
        for record in report["changed"]:
            where = "on disk" if record.get("local") == "CHANGED" else "as published"
            print(f"\n  CHANGED {where}: {record['file']}")
            if record.get("url"):
                print(f"      {record['url']}")
            if record.get("published_sha256"):
                print(f"      recorded  {record['recorded_sha256']}")
                print(f"      published {record['published_sha256']}")
        for record in report["unreachable"]:
            print(f"  unreachable: {record['file']} — {record['remote']}")
        if not report["changed"] and not report["unreachable"]:
            print("every source document still matches its recorded hash")

    if report["changed"]:
        print(
            f"\n{len(report['changed'])} document(s) changed. This is not necessarily an "
            "error — the county may have revised its own document, which is news this "
            "project should act on. Re-read the affected figures, then update the manifest "
            "in the same commit as the re-read.",
            file=sys.stderr,
        )
        return 1
    if report["unreachable"]:
        print(f"\n{len(report['unreachable'])} document(s) unreachable.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
