"""One prerequisite check for tests that re-extract from the source PDFs.

The fund-coverage extraction tests call ``extract_all()``, which shells out to ``pdftotext``
against the budget books under ``data/raw/``. Neither is available everywhere:

* ``data/raw/`` is gitignored — the corpus is 215MB and one file is 98 MiB against GitHub's
  100 MiB hard block, so the repository tracks hashes rather than documents
  (``docs/source-corpus-and-restore.md``).
* ``pdftotext`` is a system dependency (poppler), not a Python one, and CI installs neither.

Without a guard those tests raise ``FileNotFoundError`` in ``setUpClass`` and the whole suite
reports errors — which is what happened on the first CI run after the fund-coverage expansion
landed (2026-08-02). They pass on a developer machine that has both, which is exactly the
shape this project's napkin warns about: a check that passes where it was written and fails
where it runs.

**This guard is deliberately narrow, because a skip is the other way to be wrong.** The napkin
records audited-equation checks that silently skipped themselves when a measure was missing. So
this only skips on the two prerequisites being genuinely absent, and it names which one. Any
other failure inside extraction is a real failure and must surface as one — never wrap
``extract_all()`` itself in a try/except that turns a broken extractor into a skip.
"""

from __future__ import annotations

import shutil
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require_source_corpus(relative_pdfs: tuple[str, ...] | list[str]) -> None:
    """Skip the calling test class unless pdftotext AND the cited PDFs are both present.

    Call from ``setUpClass`` before any extraction. Raises ``unittest.SkipTest`` with a
    message naming the missing prerequisite, so a skip in a CI log says why.
    """
    if shutil.which("pdftotext") is None:
        raise unittest.SkipTest(
            "pdftotext (poppler) is not installed; source re-extraction cannot run here. "
            "This test verifies extraction against the county's PDFs and is expected to skip "
            "in CI. Run it locally with the corpus restored."
        )

    missing = [rel for rel in relative_pdfs if not (ROOT / rel).exists()]
    if missing:
        raise unittest.SkipTest(
            f"{len(missing)} of {len(relative_pdfs)} source PDFs are absent "
            f"(first: {missing[0]}). data/raw/ is gitignored — see "
            "docs/source-corpus-and-restore.md and run `python3 -m scripts.restore_sources`."
        )
