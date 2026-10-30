#!/usr/bin/env python3
"""Extract the General Fund Budget & Actual (Budget Basis) schedule from Greenville County
ACFR/CAFR text and validate via year-over-year fund-balance chaining.

The General Fund is isolated as the single-fund (4-column: Original/Final/Actual/Variance)
budgetary schedule whose Total revenues is the largest in the document (>$100M; every other
fund < $50M). Self-validates internally (begin + net = end) and across years (end == next begin)."""
import re, os, json

WORK = os.environ.get("ACFR_WORK_DIR", "data/raw/acfr-work")  # pdftotext output of the ACFRs
TEXT = os.path.join(WORK, "text")

def nums(line):
    out = []
    # tokens: (parenthesized) or $-prefixed integers; bare '-' -> 0
    for tok in re.findall(r'\(\s*[\d,]+\s*\)|\$?\s*[\d,]+|\$?\s*-(?=\s|$)', line):
        t = tok.strip()
        if re.fullmatch(r'\$?\s*-', t):
            out.append(0); continue
        neg = t.startswith('(')
        t = re.sub(r'[(),$\s]', '', t)
        if not t.isdigit():
            continue
        out.append(-int(t) if neg else int(t))
    return out

def cols(line):
    """Return (original, final, actual, variance) for a 4-column schedule row, else None."""
    n = nums(line)
    return tuple(n[:4]) if len(n) == 4 else None

ROWLABELS = {
    "total_revenues":     r'^\s*Total revenues',
    "total_expenditures": r'^\s*Total expenditures',
    "transfers_in":       r'^\s*Transfers in\b',
    "transfers_out":      r'^\s*Transfers out\b',
    "net_change":         r'Net change[s]? in fund balance',
    "fb_begin":           r'Fund balance[ ,\-]+beginning',
    "fb_end":             r'Fund balance[ ,\-]+(end|ending)',
}

def extract_year(year):
    p = os.path.join(TEXT, f"fy{year}.txt")
    if not os.path.exists(p):
        return {"year": year, "error": "no text file"}
    lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
    # locate GF: 4-column 'Total revenues' with the largest actual value
    rev = [(i, cols(ln)) for i, ln in enumerate(lines) if re.search(ROWLABELS["total_revenues"], ln) and cols(ln)]
    rev = [(i, c) for i, c in rev if c[2] > 100_000_000]
    if not rev:
        return {"year": year, "error": "no GF total-revenue line >$100M found"}
    R, revc = max(rev, key=lambda t: t[1][2])
    win = lines[max(0, R-3):R+40]
    rec = {"year": year, "gf_line": R}
    for key, pat in ROWLABELS.items():
        for ln in win:
            if re.search(pat, ln, re.I):
                c = cols(ln)
                if c:
                    rec[key] = {"original": c[0], "final": c[1], "actual": c[2], "variance": c[3]}
                    break
                n = nums(ln)  # fb_begin sometimes single/dup value
                if key in ("fb_begin", "fb_end") and n:
                    v = n[2] if len(n) >= 3 else n[-1]
                    rec[key] = {"original": n[0] if n else None, "final": n[1] if len(n)>1 else None, "actual": v, "variance": None}
                    break
    return rec

years = list(range(2011, 2026))
recs = {y: extract_year(y) for y in years}

def A(rec, key):
    return rec.get(key, {}).get("actual") if rec.get(key) else None

print(f"{'FY':<6}{'Revenue':>15}{'Expend':>15}{'TransIn':>13}{'TransOut':>13}{'NetChg':>13}{'Begin':>14}{'End':>14}  checks")
prev_end = None; all_ok = True
for y in years:
    r = recs[y]
    if r.get("error"):
        print(f"{y:<6}  ERROR: {r['error']}"); all_ok = False; continue
    beg, net, end = A(r,"fb_begin"), A(r,"net_change"), A(r,"fb_end")
    math_ok = (None not in (beg,net,end)) and (beg + net == end)
    chain_ok = (prev_end is None) or (beg == prev_end)
    if not (math_ok and chain_ok): all_ok = False
    tag = ("+" if math_ok else "MATH✗") + ("+" if chain_ok else " CHAIN✗")
    print(f"{y:<6}{A(r,'total_revenues'):>15,}{A(r,'total_expenditures'):>15,}{A(r,'transfers_in'):>13,}{A(r,'transfers_out'):>13,}{net:>13,}{beg:>14,}{end:>14,}  {tag}")
    prev_end = end

r25 = recs[2025]
print("\nFY2025 acceptance checks:")
for name, got, want in [
    ("revenue actual", A(r25,"total_revenues"), 246871125),
    ("revenue final budget", r25.get("total_revenues",{}).get("final"), 223764269),
    ("expenditure actual", A(r25,"total_expenditures"), 251720397),
    ("expenditure final budget", r25.get("total_expenditures",{}).get("final"), 241649556),
    ("transfers-in variance", r25.get("transfers_in",{}).get("variance"), 167902),
    ("transfers-out variance", r25.get("transfers_out",{}).get("variance"), 138299),
    ("net change budget", r25.get("net_change",{}).get("final"), -12418101),
    ("net change actual", A(r25,"net_change"), 924115),
    ("beginning actual", A(r25,"fb_begin"), 80621229),
    ("ending actual", A(r25,"fb_end"), 81545344),
]:
    print(f"  [{'PASS' if got==want else 'FAIL'}] {name}: {got:,} (want {want:,})")

print(f"\nAll 15 years internally reconcile AND chain: {all_ok}")
json.dump(recs, open(os.path.join(WORK,"series_extracted.json"),"w"), indent=1, default=str)
