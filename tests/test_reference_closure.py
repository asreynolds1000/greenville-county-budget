"""Every repository path the project points a reader at must exist in the repository.

Three kinds of pointer are checked:
  1. Markdown links in any tracked .md file, resolved relative to that file.
  2. Repository paths written in backticks in .md files (`docs/...`, `research/...`).
  3. `source_ref` values in data notes, which the site and the downloads publish as citations.

A dangling pointer in (3) is a broken citation on the live site, which is why this is a test
rather than a lint. Paths that are generated or restored locally (data/raw/, web/out/, dist/ ...)
are allowed to be absent.
"""
import csv
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "node_modules", ".next", "out", ".baselines", "playwright-report", "dist", "build",
             "var", "tmp", ".claude", "raw", ".vercel"}
LOCAL_ONLY = ("data/raw/", "web/out/", "web/.next/", "web/.baselines/", "web/.vercel/", "dist/", "build/",
              "web/playwright-report/", "web/node_modules/")
TOP = r"(?:docs|research|audit|data|scripts|tests|web|\.github)"
BACKTICKED = re.compile(rf"`({TOP}/[A-Za-z0-9_./-]+)`")
MDLINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


def tracked_markdown():
    for path in ROOT.rglob("*.md"):
        rel = path.relative_to(ROOT)
        if not set(rel.parts[:-1]) & SKIP_DIRS:
            yield path


def is_local_only(rel: str) -> bool:
    return rel.startswith(LOCAL_ONLY) or rel.rstrip("/") + "/" in LOCAL_ONLY


def exists(rel: str) -> bool:
    rel = rel.rstrip("/").rstrip(".")
    if any(ch in rel for ch in "*{<…") or rel.endswith("..."):
        return True  # a pattern, not a path
    return (ROOT / rel).exists()


class ReferenceClosureTest(unittest.TestCase):
    def test_markdown_links_resolve(self):
        broken = []
        for md in tracked_markdown():
            for n, line in enumerate(md.read_text(encoding="utf-8").splitlines(), 1):
                for target in MDLINK.findall(line):
                    target = target.split("#", 1)[0]
                    if not target or "://" in target or target.startswith("mailto:"):
                        continue
                    resolved = (md.parent / target).resolve()
                    try:
                        rel = resolved.relative_to(ROOT).as_posix()
                    except ValueError:
                        broken.append(f"{md.relative_to(ROOT)}:{n} -> {target} (outside the repo)")
                        continue
                    if not is_local_only(rel) and not resolved.exists():
                        broken.append(f"{md.relative_to(ROOT)}:{n} -> {target}")
        self.assertEqual(broken, [], "Markdown links to files that are not in the repository")

    def test_backticked_repository_paths_exist(self):
        broken = []
        for md in tracked_markdown():
            for n, line in enumerate(md.read_text(encoding="utf-8").splitlines(), 1):
                for rel in BACKTICKED.findall(line):
                    # Also accept a path written relative to the document's own package
                    # (web/README.md naming `scripts/x.ts` means web/scripts/x.ts).
                    bases = [md.parent, *md.parent.parents]
                    if any((b / rel).exists() for b in bases if ROOT in (b, *b.parents)):
                        continue
                    if not is_local_only(rel) and not exists(rel):
                        broken.append(f"{md.relative_to(ROOT)}:{n} -> {rel}")
        self.assertEqual(broken, [], "Backticked repository paths that do not exist")

    def test_published_note_citations_exist(self):
        broken = []
        for path in (ROOT / "data" / "production").glob("*.csv"):
            with path.open(newline="", encoding="utf-8-sig") as handle:
                reader = csv.DictReader(handle)
                if "source_ref" not in (reader.fieldnames or []):
                    continue
                for row in reader:
                    ref = (row.get("source_ref") or "").strip()
                    for rel in re.findall(rf"{TOP}/[A-Za-z0-9_./-]+", ref):
                        if not is_local_only(rel) and not exists(rel):
                            broken.append(f"{path.name}: {row.get('note_id') or row.get('id')} -> {rel}")
        self.assertEqual(broken, [], "Published notes cite files that are not in the repository")


if __name__ == "__main__":
    unittest.main()
