#!/usr/bin/env python3
"""Task A: GASB 54 fund-balance classifications, General Fund column, FY2011-FY2024.

General Fund is always the FIRST data column in the governmental-funds BALANCE SHEET.
pdftotext -layout preserves character-grid alignment, so a column's numeric tokens end
at a consistent character offset within a contiguous table block. We anchor on a known
"full" row (Total assets / Total liabilities...) to get that offset, then pull the token
nearest that offset (within tolerance) from each classification line. Blank cells (no
"-" placeholder printed) are legitimate zeros, not missing data -- handled by tolerance
matching rather than positional token-counting.
"""
import re, os, csv, sys

WORK = os.environ.get("ACFR_WORK_DIR", "data/raw/acfr-work")  # pdftotext output of the ACFRs
TEXT = os.path.join(WORK, "text")
RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

YEARS = [2011] + list(range(2013, 2025))  # 2012 handled separately (OCR), 2025 copied from existing file

NUM_RE = re.compile(r'\(\s*[\d,]+(?:\.\d+)?\s*\)|[\d,]+(?:\.\d+)?')
DATE_RE = re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}', re.I)

def num_tokens(line):
    out = []
    for m in NUM_RE.finditer(line):
        tok = m.group()
        neg = tok.strip().startswith('(')
        digits = re.sub(r'[(),\s]', '', tok)
        if not digits or not re.match(r'^\d+(\.\d+)?$', digits):
            continue
        val = float(digits) if '.' in digits else int(digits)
        if neg:
            val = -val
        out.append((m.start(), m.end(), val))
    return out

def gf_value(line, boundary, tol=3):
    """Return the numeric value in `line` whose token END position is nearest `boundary`
    (within tol chars), else 0.0 if no token falls in range (blank cell = 0)."""
    if boundary is None:
        return None
    best = None
    for s, e, v in num_tokens(line):
        d = abs(e - boundary)
        if d <= tol and (best is None or d < best[0]):
            best = (d, v)
    return best[1] if best else 0

def find_boundary(lines, idx, label_pat, direction=-1, max_scan=100):
    """Scan from idx in `direction` (-1 back, +1 fwd) up to max_scan lines for a line
    matching label_pat; return (line_index, first_token_end_position) or (None, None)."""
    i = idx
    steps = 0
    while 0 <= i < len(lines) and steps < max_scan:
        if re.search(label_pat, lines[i]):
            toks = num_tokens(lines[i])
            if toks:
                return i, toks[0][1]
        i += direction
        steps += 1
    return None, None

BREAK_RE = re.compile(r'^\s*\d{1,3}\s*$|See notes to financial statements|^\s*(GREENVILLE COUNTY|Greenville County),?\s*(SOUTH CAROLINA|South Carolina)?\s*$', re.I)
HDR_START_RE = {
    'Nonspendable': re.compile(r'^Nonspendable:?$', re.I),
    'Restricted': re.compile(r'^Restricted( for)?:?$', re.I),
    'Committed': re.compile(r'^Committed( to)?:?$', re.I),
    'Assigned': re.compile(r'^Assigned( to)?:?$', re.I),
}
UNASSIGNED_RE = re.compile(r'^Unassigned\b', re.I)
TOTAL_FB_RE = re.compile(r'Total fund balance', re.I)
TOTAL_ASSETS_RE = re.compile(r'^\s*Total assets\b')
TOTAL_LIAB_FB_RE = re.compile(r'Total liabilities.*fund balance', re.I)

def extract_year(year, path=None):
    p = path or os.path.join(TEXT, f"fy{year}.txt")
    lines = open(p, encoding="utf-8", errors="replace").read().split("\n")
    starts = [i for i, ln in enumerate(lines) if re.match(r'^\s*Nonspendable:\s*$', ln, re.I)]
    if not starts:
        return {"year": year, "error": "no 'Nonspendable:' header found"}
    START = starts[0]
    # find END = first 'Total fund balance' at/after START
    END = None
    for i in range(START, min(START + 200, len(lines))):
        if TOTAL_FB_RE.search(lines[i]):
            END = i
            break
    if END is None:
        return {"year": year, "error": "no 'Total fund balance' terminator found"}
    # the total line's numbers sometimes wrap onto the next 1-2 lines (e.g. "Total fund
    # balances" / "(deficits)  50,553,012 ..."); extend END to include that continuation
    # so the main loop below actually sees the numbers.
    j = END
    while j < min(END + 3, len(lines)) and not num_tokens(lines[j]):
        j += 1
    if j != END and num_tokens(lines[j]):
        END = j

    # reference boundaries
    ref1_i, ref1_b = find_boundary(lines, START, TOTAL_ASSETS_RE, direction=-1, max_scan=120)
    ref2_i, ref2_b = find_boundary(lines, END, TOTAL_LIAB_FB_RE, direction=+1, max_scan=10)
    if ref2_b is None:
        # fall back to END line itself if it's a full row
        toks = num_tokens(lines[END])
        ref2_b = toks[0][1] if toks else ref1_b

    # detect a page-break split point between START and END
    breakpoints = [i for i in range(START, END + 1) if BREAK_RE.search(lines[i])]
    split = breakpoints[0] if breakpoints else None

    def boundary_for(i):
        if split is not None and i >= split:
            return ref2_b
        return ref1_b

    rows = []  # (bucket, label, amount)
    bucket = None
    total_check = None
    pending_label = None   # holds a label fragment that wrapped onto the next line
    pending_is_total = False
    i = START
    while i <= END:
        ln = lines[i]
        stripped = ln.strip()

        matched_hdr = False
        for b, pat in HDR_START_RE.items():
            if pat.match(stripped):
                bucket = b
                matched_hdr = True
                break
        if matched_hdr:
            pending_label = None
            pending_is_total = False
            i += 1
            continue

        if not stripped or DATE_RE.search(ln) or BREAK_RE.search(ln):
            i += 1
            continue

        toks = num_tokens(ln)
        is_total_line = bool(TOTAL_FB_RE.search(ln))
        is_unassigned_line = bool(UNASSIGNED_RE.match(stripped))

        if not toks:
            # pure label fragment (wraps onto the next line, e.g. "Agency -" / "Total fund balances")
            if is_total_line:
                pending_is_total = True
                pending_label = stripped
            else:
                pending_label = (pending_label + " " + stripped) if pending_label else stripped
            i += 1
            continue

        label_text = re.split(r'\s{2,}', stripped)[0].rstrip(':').strip()
        full_label = (pending_label + " " + label_text) if pending_label else label_text
        v = gf_value(ln, boundary_for(i))

        if pending_is_total or is_total_line:
            total_check = v
        elif is_unassigned_line:
            rows.append(("Unassigned", "Unassigned", v))
        elif bucket and full_label and not re.match(r'^[\d.,()$-]+$', full_label):
            rows.append((bucket, full_label, v))

        pending_label = None
        pending_is_total = False
        i += 1

    return {
        "year": year, "start": START, "end": END, "split": split,
        "ref1": (ref1_i, ref1_b), "ref2": (ref2_i, ref2_b),
        "rows": rows, "total_check": total_check,
    }

DASH_RE = re.compile(r'\(\s*[\d,]+(?:\.\d+)?\s*\)|[\d,]+(?:\.\d+)?|(?<!\S)-(?!\S)')

def num_tokens_ocr(line):
    """Like num_tokens, but also captures a standalone '-' as an explicit 0 token.
    FY2012's tesseract OCR text does NOT preserve pdftotext's fixed character grid (so the
    column-position technique used for every other year doesn't apply here) -- but it DOES
    reliably OCR the '-' zero-placeholder character, so every column has an explicit token
    and simple left-to-right ORDINAL position (1st token = General Fund) works instead."""
    out = []
    for m in DASH_RE.finditer(line):
        tok = m.group()
        if tok == '-':
            out.append((m.start(), m.end(), 0))
            continue
        neg = tok.strip().startswith('(')
        digits = re.sub(r'[(),\s]', '', tok)
        if not digits or not re.match(r'^\d+(\.\d+)?$', digits):
            continue
        val = float(digits) if '.' in digits else int(digits)
        if neg:
            val = -val
        out.append((m.start(), m.end(), val))
    return out

def extract_2012_ocr(path):
    lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
    starts = [i for i, ln in enumerate(lines) if re.match(r'^\s*Nonspendable:\s*$', ln, re.I)]
    if not starts:
        return {"year": 2012, "error": "no 'Nonspendable:' header found in OCR text"}
    START = starts[0]
    END = None
    for i in range(START, min(START + 60, len(lines))):
        if TOTAL_FB_RE.search(lines[i]):
            END = i
            break
    if END is None:
        return {"year": 2012, "error": "no 'Total fund balance' terminator found in OCR text"}

    rows, bucket, total_check = [], None, None
    i = START
    while i <= END:
        ln = lines[i]
        stripped = ln.strip()
        matched_hdr = False
        for b, pat in HDR_START_RE.items():
            if pat.match(stripped):
                bucket = b
                matched_hdr = True
                break
        if matched_hdr:
            i += 1
            continue
        if not stripped:
            i += 1
            continue
        toks = num_tokens_ocr(ln)
        if not toks:
            i += 1
            continue
        label = re.split(r'\s{2,}', stripped)[0].rstrip(':').strip()
        v = toks[0][2]  # first token, left to right = General Fund (ordinal, not position-matched)
        if TOTAL_FB_RE.search(ln):
            total_check = v
        elif UNASSIGNED_RE.match(stripped):
            rows.append(("Unassigned", "Unassigned", v))
        elif bucket and label and not re.match(r'^[\d.,()$-]+$', label):
            rows.append((bucket, label, v))
        i += 1

    return {"year": 2012, "start": START, "end": END, "rows": rows, "total_check": total_check}

if __name__ == "__main__":
    import json
    for y in YEARS:
        r = extract_year(y)
        print(f"\n=== FY{y} ===")
        if r.get("error"):
            print("ERROR:", r["error"])
            continue
        print(f"start={r['start']+1} end={r['end']+1} split={r['split']+1 if r['split'] else None} ref1={r['ref1']} ref2={r['ref2']}")
        for b, lab, v in r["rows"]:
            print(f"  {b:<12} {lab:<45} {v:>15,}")
        print(f"  TOTAL_CHECK line value: {r['total_check']:,}" if r['total_check'] is not None else "  TOTAL_CHECK: MISSING")
        s = sum(v for _, _, v in r["rows"])
        print(f"  SUM of rows: {s:,}  {'MATCH' if s == r['total_check'] else 'MISMATCH'}")
