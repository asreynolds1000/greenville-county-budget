"""Check exported HTML links, fragments, and referenced static assets without network access."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit


class Document(HTMLParser):
    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.links: set[str] = set()
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "a" and attributes.get("name"):
            self.ids.add(attributes["name"])
        for name in ("href", "src"):
            if attributes.get(name):
                self.links.add(attributes[name])


def check(root: Path, origin: str) -> tuple[int, int, list[str]]:
    root = root.resolve()
    pages = sorted(root.rglob("*.html"))
    if not pages:
        raise ValueError(f"No exported HTML pages in {root}; build the site first")
    documents = {page: Document(page.read_text(encoding="utf-8")) for page in pages}
    errors: list[str] = []
    checked = 0
    origin_parts = urlsplit(origin)
    for page, document in documents.items():
        route = "/" + page.relative_to(root).as_posix()
        if route.endswith("/index.html"):
            route = route[:-10]
        base = urljoin(origin, route)
        for link in sorted(document.links):
            target = urlsplit(urljoin(base, link))
            if target.scheme not in ("http", "https") or target.netloc != origin_parts.netloc:
                continue
            checked += 1
            candidate = (root / unquote(target.path).lstrip("/")).resolve()
            if not candidate.is_relative_to(root):
                errors.append(f"{route}: {link} escapes export directory")
                continue
            candidates = [candidate, candidate / "index.html", Path(str(candidate) + ".html")]
            destination = next((item for item in candidates if item.is_file()), None)
            if destination is None:
                errors.append(f"{route}: missing file for {link}")
                continue
            if destination.suffix == ".html" and target.fragment:
                # Text fragments are a browser search instruction, not element IDs.
                fragment = unquote(target.fragment.split(":~:text=", 1)[0])
                if fragment and fragment not in documents[destination].ids:
                    errors.append(f"{route}: missing fragment for {link}")
    return len(pages), checked, errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1] / "web/out")
    parser.add_argument("--origin", default="https://gcb.alexreynolds.com")
    args = parser.parse_args()
    try:
        pages, links, errors = check(args.root, args.origin)
    except ValueError as error:
        print(error)
        return 1
    print(f"Checked {pages:,} HTML pages and {links:,} internal link/asset references.")
    for error in errors[:50]:
        print(error)
    if errors:
        print(f"FAILED: {len(errors):,} broken references")
        return 1
    print("No broken internal links, fragments, or referenced assets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
