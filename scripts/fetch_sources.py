#!/usr/bin/env python3
"""Download official budget source documents and record file hashes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import tempfile
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


USER_AGENT = "gvl-county-budget-audit/0.1 (public-source verification)"


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for name, value in attrs:
            if name.lower() == "href" and value:
                self.links.append(value)


def request_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def is_official_budget_pdf(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    hostname = (parsed.hostname or "").lower()
    path = urllib.parse.unquote(parsed.path).lower()
    return (
        hostname in {"greenvillecounty.org", "www.greenvillecounty.org"}
        and path.endswith(".pdf")
        and "/managementandbudget/pdf/" in path
        and not path.endswith("/foiafees.pdf")
    )


def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(
        urllib.parse.unquote(parsed.path), safe="/:@-._~!$&'()*+,;="
    )
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, path, parsed.query, parsed.fragment)
    )


def discover_budget_pdfs(index_url: str, html: bytes) -> list[str]:
    parser = LinkParser()
    parser.feed(html.decode("utf-8", errors="replace"))
    urls = {
        normalize_url(urllib.parse.urljoin(index_url, href))
        for href in parser.links
        if is_official_budget_pdf(urllib.parse.urljoin(index_url, href))
    }
    return sorted(urls)


def safe_filename(url: str) -> str:
    basename = Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).name.strip()
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", basename).strip("-.")
    return cleaned or "source.pdf"


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def write_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def source_urls(row: dict[str, str]) -> list[str]:
    if row["document_url"]:
        return [row["document_url"]]
    if not row["index_url"]:
        return []
    html = request_bytes(row["index_url"])
    return discover_budget_pdfs(row["index_url"], html)


def fetch(manifest: Path, output_dir: Path, receipt_path: Path) -> dict[str, object]:
    with manifest.open(newline="", encoding="utf-8") as handle:
        source_rows = list(csv.DictReader(handle))

    receipt_rows: list[dict[str, object]] = []
    missing: list[dict[str, str]] = []
    for source in source_rows:
        urls = source_urls(source)
        if not urls:
            missing.append(
                {
                    "source_id": source["source_id"],
                    "status": source["status"],
                    "reason": "No downloadable official document URL",
                }
            )
            continue
        for ordinal, url in enumerate(urls, start=1):
            content = request_bytes(url)
            filename = safe_filename(url)
            if len(urls) > 1:
                filename = f"{ordinal:02d}-{filename}"
            relative_path = Path(source["source_id"]) / filename
            destination = output_dir / relative_path
            write_atomic(destination, content)
            receipt_rows.append(
                {
                    "source_id": source["source_id"],
                    "fiscal_year_start": int(source["fiscal_year_start"]),
                    "fiscal_year_end": int(source["fiscal_year_end"]),
                    "source_status": source["status"],
                    "url": url,
                    "path": str(relative_path),
                    "bytes": len(content),
                    "sha256": sha256_bytes(content),
                }
            )

    receipt: dict[str, object] = {
        "manifest": str(manifest),
        "output_directory": str(output_dir),
        "file_count": len(receipt_rows),
        "total_bytes": sum(int(row["bytes"]) for row in receipt_rows),
        "files": receipt_rows,
        "missing_sources": missing,
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    write_atomic(
        receipt_path,
        (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=Path("data/source-manifest.csv")
    )
    parser.add_argument("--output", type=Path, default=Path("data/raw"))
    parser.add_argument(
        "--receipt", type=Path, default=Path("audit/source-files.json")
    )
    args = parser.parse_args()

    receipt = fetch(args.manifest, args.output, args.receipt)
    print(
        f"Downloaded {receipt['file_count']} files "
        f"({int(receipt['total_bytes']):,} bytes) to {args.output}"
    )
    missing = receipt["missing_sources"]
    assert isinstance(missing, list)
    for source in missing:
        print(f"Missing: {source['source_id']} — {source['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
