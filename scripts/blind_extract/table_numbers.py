"""Parse monetary cells from fixed-width budget-table text.

The source PDFs use a bare dash for a printed zero.  Department and transfer
labels also contain hyphens surrounded by spaces (for example,
``TRANSFERS - CAPITAL PROJECTS``).  A label hyphen is not a numeric cell and
must remain part of the label so column selection does not shift.
"""

from __future__ import annotations

import re


NUMBER = re.compile(
    r"(?<![\w.])"
    r"(?:\(\s*\$?\s*\d[\d,]*\s*\)|-\$?\s?\d[\d,]*|\$\s*\d[\d,]*|\d[\d,]*|--|-(?!\s*[A-Za-z]))"
    r"(?![\w.%])"
)


def value(raw: str) -> int:
    """Convert one printed monetary token to whole dollars."""
    cleaned = raw.replace("$", "").replace(",", "").replace(" ", "").strip()
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    if cleaned in ("", "-", "--"):
        return 0
    return -int(cleaned) if negative else int(cleaned)


def zero_printed_form(raw: str) -> str:
    """Normalize the source token for a zero-valued monetary cell.

    Currency signs, commas and spacing are typographic; the distinction that matters is
    whether the county printed a numeric zero, a parenthetical zero, or a dash token.
    """
    if value(raw) != 0:
        raise ValueError(f"not a zero-valued monetary token: {raw!r}")
    cleaned = raw.replace("$", "").replace(",", "").replace(" ", "").strip()
    if cleaned in {"-", "--"}:
        return cleaned
    if cleaned.startswith("(") and cleaned.endswith(")"):
        return "(0)"
    if cleaned.strip("+") == "0":
        return "0"
    raise ValueError(f"unrecognized zero-valued monetary token: {raw!r}")


def raw_tokens(line: str) -> list[tuple[int, int, str, int]]:
    """Return ``(start, end, printed token, value)`` for every monetary cell.

    Most extraction routes only need the normalized integer and use :func:`tokens` below.
    Source-form classification needs the token before normalization so a printed dash and a
    printed zero cannot collapse into the same evidence.
    """
    return [
        (match.start(), match.end(), match.group(), value(match.group()))
        for match in NUMBER.finditer(line)
    ]


def tokens(line: str) -> list[tuple[int, int, int]]:
    """Return ``(start, end, value)`` for numeric cells in one text line."""
    return [(start, end, amount) for start, end, _raw, amount in raw_tokens(line)]


def year_tokens(
    line: str,
    year_positions: list[int],
    sequence_indices: list[int] | None = None,
    complete_token_count: int | None = None,
    tolerance: int = 18,
) -> list[tuple[int, int, str, int] | None]:
    """Select the source token aligned to each fiscal-year column.

    This is the source-form-preserving twin of :func:`year_values`. Keeping the column
    algorithm in one place prevents a classifier from agreeing with the extraction only by
    accidentally selecting a different cell.
    """
    found = raw_tokens(line)
    if (
        sequence_indices is not None
        and complete_token_count is not None
        and len(found) >= complete_token_count
    ):
        return [found[index] for index in sequence_indices]

    selected: dict[int, tuple[int, tuple[int, int, str, int]]] = {}
    for token in found:
        start = token[0]
        distances = [abs(start - position) for position in year_positions]
        column = min(range(len(distances)), key=distances.__getitem__)
        distance = distances[column]
        if distance > tolerance:
            continue
        previous = selected.get(column)
        if previous is None or distance < previous[0]:
            selected[column] = (distance, token)
    return [selected[column][1] if column in selected else None for column in range(len(year_positions))]


def year_values(
    line: str,
    year_positions: list[int],
    sequence_indices: list[int] | None = None,
    complete_token_count: int | None = None,
    tolerance: int = 18,
) -> list[int | None]:
    """Select the monetary token aligned to each fiscal-year column.

    Change and percentage columns sit between the current and next fiscal year,
    so positional matching is safer than selecting the Nth numeric token.  A
    missing year cell remains ``None`` rather than shifting a neighboring change
    value into its place. Other year cells on the same row remain usable.
    """
    return [
        token[3] if token is not None else None
        for token in year_tokens(
            line,
            year_positions,
            sequence_indices,
            complete_token_count,
            tolerance,
        )
    ]
