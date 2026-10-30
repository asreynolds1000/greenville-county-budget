"""Field-by-field old/new report for a page-baseline migration, for a human to accept.

The committed fixtures are NOT touched. This renders the candidate capture for every
declared route, compares it against the committed fixture field by field, and prints what a
reviewer needs in order to accept or refuse the migration:

  * every changed field, named,
  * ordered diffs for the list fields (a token multiset would call a reordered qualification
    identical, and reordering changes meaning),
  * and the owner-reviewed FY2025 General Fund page first, because its test calls its output
    "the contract".

    python3 -m scripts.curation.diff_page_baselines            # all declared routes
    python3 -m scripts.curation.diff_page_baselines --json     # machine-readable

Exit status is 1 when anything differs. That is the point: a clean exit means there is no
migration to accept.
"""

from __future__ import annotations

import difflib
import json
import sys
from collections import Counter

from scripts.curation.capture_page_baseline import (
    BaselineSourceError,
    OUT_DIR,
    capture,
    declared_routes,
)

CONTRACT_ROUTE = "e/fund.general/2025"
LIST_FIELDS = ("money", "percentages", "headings", "text")


def fixture_for(route: str) -> dict | None:
    path = OUT_DIR / (route.strip("/").replace("/", "__") + ".json")
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def compare(route: str) -> dict:
    expected = fixture_for(route)
    if expected is None:
        return {"route": route, "status": "no-fixture"}
    try:
        actual = capture(route)
    except BaselineSourceError as error:
        return {"route": route, "status": "refused", "reason": str(error)}

    report: dict = {"route": route, "status": "unchanged", "fields": {}}
    if expected.get("title") != actual.get("title"):
        report["fields"]["title"] = {"old": expected.get("title"), "new": actual.get("title")}
    for field in LIST_FIELDS:
        old, new = expected.get(field, []), actual.get(field, [])
        if old == new:
            continue
        removed = list((Counter(old) - Counter(new)).elements())
        added = list((Counter(new) - Counter(old)).elements())
        report["fields"][field] = {
            "old_len": len(old),
            "new_len": len(new),
            "removed_tokens": removed,
            "added_tokens": added,
            "reordered_only": not removed and not added,
            "ordered_diff": [
                line for line in difflib.unified_diff(
                    [str(item) for item in old], [str(item) for item in new],
                    fromfile=f"{field} (committed)", tofile=f"{field} (candidate)", lineterm="", n=1,
                )
            ][:80],
        }
    if report["fields"]:
        report["status"] = "changed"
    return report


def render(report: dict) -> None:
    route = report["route"]
    if report["status"] == "unchanged":
        print(f"\n== {route}\n   UNCHANGED — every field is byte-identical to the committed fixture.")
        return
    if report["status"] == "refused":
        print(f"\n== {route}\n   REFUSED — {report['reason']}")
        return
    if report["status"] == "no-fixture":
        print(f"\n== {route}\n   NO COMMITTED FIXTURE — nothing to accept against.")
        return
    print(f"\n== {route}\n   CHANGED in: {', '.join(report['fields'])}")
    for field, detail in report["fields"].items():
        if field == "title":
            print(f"   title\n     committed: {detail['old']}\n     candidate: {detail['new']}")
            continue
        print(f"   {field}: {detail['old_len']} -> {detail['new_len']} entries"
              + ("  (REORDERED ONLY — same tokens, different order)" if detail["reordered_only"] else ""))
        if detail["removed_tokens"]:
            print(f"     removed ({len(detail['removed_tokens'])}): {detail['removed_tokens'][:20]}")
        if detail["added_tokens"]:
            print(f"     added   ({len(detail['added_tokens'])}): {detail['added_tokens'][:20]}")
        for line in detail["ordered_diff"]:
            print(f"     | {line}")


def main(argv: list[str]) -> int:
    as_json = "--json" in argv
    routes = [route for route in argv if not route.startswith("--")] or list(declared_routes())
    routes.sort(key=lambda route: (route != CONTRACT_ROUTE, route))

    reports = [compare(route) for route in routes]
    if as_json:
        print(json.dumps(reports, indent=1, ensure_ascii=False))
    else:
        print("Page-baseline migration report")
        print("The committed fixtures are not modified by this script.")
        print(f"The owner-reviewed contract page ({CONTRACT_ROUTE}) is reported first.")
        for report in reports:
            render(report)
        changed = [r["route"] for r in reports if r["status"] == "changed"]
        refused = [r["route"] for r in reports if r["status"] == "refused"]
        print("\n" + "-" * 72)
        print(f"{len(reports)} routes: {len(reports) - len(changed) - len(refused)} unchanged, "
              f"{len(changed)} changed, {len(refused)} refused")
        if changed:
            print("changed: " + ", ".join(changed))
        if refused:
            print("refused: " + ", ".join(refused))
        print("A human accepts or refuses these differences. Nothing here recaptures a fixture.")
    return 1 if any(r["status"] != "unchanged" for r in reports) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
