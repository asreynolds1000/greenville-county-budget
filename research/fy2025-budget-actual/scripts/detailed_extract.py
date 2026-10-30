#!/usr/bin/env python3
"""Deterministic extractor for the Greenville County General Fund DETAILED budgetary
schedule ("SCHEDULE OF REVENUES AND EXPENDITURES / BUDGET AND ACTUAL (BUDGET BASIS)"),
FY2011, FY2013-FY2025 (FY2012 is OCR, attempted separately and flagged for reliability).

This is distinct from the SUMMARY schedule ("SCHEDULE OF REVENUES, EXPENDITURES AND
CHANGES IN FUND BALANCES") that `finalize.py` extracts. The detailed schedule breaks
revenue into 4 category rollups + office/source sublines, and expenditure into
department totals (including "Total elected officials - X" groupings) + sub-department
+ object (Salaries/Operations/Contractual agreements/Capital outlay) lines.

IMPORTANT GOTCHA: pdftotext inserts literal form-feed (\\x0c) characters at page breaks.
Python's str.splitlines() treats \\x0c as a line boundary, which silently desyncs line
indices from grep/wc -l (which only count '\\n'). This script ALWAYS splits on '\\n'
only -- never use .splitlines() here.

Two formatting eras observed in the source:
  - Newer years (confirmed FY2025): every rollup row -- category, sub-department, AND
    department -- is explicitly labeled "Total <name>".
  - Older years (confirmed FY2011): department-level rollups are always labeled
    "Total <name>", but sub-department/category-level rollups are frequently an
    UNLABELED row (just 4 numbers, no leading text).
  - A handful of "single-line" categories (e.g. "Property taxes", which has exactly one
    subline and no total line at all in any observed year) never get an explicit close;
    their rollup is synthesized from the lone subline when the next category header (or
    end of section) appears.
  - Revenue can carry a THIRD, purely cosmetic nesting level (e.g. "State of South
    Carolina:" grouping several state sources inside "Intergovernmental"). This level is
    intentionally flattened away for output: revenue rows are always (category, subline)
    with the subline attributed directly to its enclosing top-level category.

Output CSVs (blank subline/subdepartment/object marks rollup/total rows so both totals
and leaf lines are present and identifiable):
  detailed-revenue-by-year.csv:
      fiscal_year, category, subline, original_budget, final_budget, actual, variance
  detailed-expenditure-by-year.csv:
      fiscal_year, department, subdepartment, object, original_budget, final_budget, actual, variance
"""
import re, os, csv, sys

WORK = os.environ.get("ACFR_WORK_DIR", "data/raw/acfr-work")  # pdftotext output of the ACFRs
TEXT = os.path.join(WORK, "text")
RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROD_CSV = os.path.join(RES, "..", "..", "data", "production", "general_fund_budget_actual_comparison.csv")

YEARS = [2011] + list(range(2013, 2026))  # FY2012 handled separately (OCR)

# ---------------------------------------------------------------------------
# Low-level line parsing (reused pattern from finalize.py's nums()/cols4())
# ---------------------------------------------------------------------------
## The bare-dash zero-placeholder alternative must NOT match a hyphen used as a word
## separator inside a label (e.g. "Total elected officials - Judicial", "Code enforcement
## - zoning"). Those have exactly one space on each side. A real zero-placeholder dash in
## a number column is preceded by wide column-alignment whitespace (2+ spaces) or a "$",
## and followed by either 2+ spaces (another column follows) or end of line.
NUM_TOKEN = re.compile(
    r'\(\s*[\d,]+\s*\)'
    r'|\$?\s*[\d,]+'
    r'|(?:\$\s*|\s{2,})-(?=\s{2,}|$)'
)


def parse_data_line(line):
    """Return (label, (original, final, actual, variance)) if the line carries exactly
    4 numeric columns, else None. label is the raw text before the first numeric token,
    stripped (may be empty for unlabeled rollup rows)."""
    valid = []
    for m in NUM_TOKEN.finditer(line):
        t = m.group().strip()
        if re.fullmatch(r'\$?\s*-', t):
            valid.append((m, 0))
            continue
        neg = t.startswith('(')
        t2 = re.sub(r'[(),$\s]', '', t)
        if not t2.isdigit():
            continue
        valid.append((m, -int(t2) if neg else int(t2)))
    if len(valid) != 4:
        return None
    label = line[:valid[0][0].start()].strip()
    cols = tuple(v[1] for v in valid)
    return label, cols


FURNITURE_RES = [re.compile(p, re.I) for p in [
    r'GREENVILLE COUNTY',
    r'^\s*GENERAL FUND\s*$',
    r'SCHEDULE OF REVENUE',  # matches both "...REVENUES..." and "...REVENUE AND EXPENDITURES..." (some years drop the S)
    r'BUDGET AND ACTUAL',
    r'FOR THE FISCAL YEAR ENDED',
    r'YEAR ENDED JUNE',
    r'Budgeted Amounts',
    r'^\s*Original\s+Final\s*$',
    r'^\s*Actual\s*$',
    r'^\s*Variance\s*$',
    r'with Final',
    r'^\s*Budget\s*$',
    r'\(Continued\)\s*$',
    r'^\s*Positive\s*$',
    r'\(Negative\)\s*$',
    r'Positive\s*\(Negative\)',
    r'^\s*\d+\s*$',
    r'^\s*(Current\s+)?Expenditures\s*(\(Continued\))?\s*:?\s*$',
    r'^\s*Revenues\s*:?\s*$',
    r'^\s*OTHER SUPPLEMENTARY INFORMATION\s*$',
    r'^\s*Notes to the schedule',
]]


COLUMN_HEADER_WORDS = {'original', 'final', 'actual', 'variance', 'budget', 'budgeted',
                        'amounts', 'positive', 'negative', 'with', 'basis'}


def looks_like_column_header(stripped):
    """Catches multi-row column-header continuations (e.g. 'Budget   Budget   (Budget
    Basis)   Variance' or 'Original   Final   Actual   Budget') that carry no digits and
    so would otherwise be misread as a department/category header line, seeding the
    depth-detection indent with a bogus value."""
    words = re.findall(r"[A-Za-z]+", stripped.lower())
    if not words:
        return False
    hits = sum(1 for w in words if w in COLUMN_HEADER_WORDS)
    return hits >= 2 and hits >= len(words) - 1


def is_furniture(stripped):
    return any(p.search(stripped) for p in FURNITURE_RES) or looks_like_column_header(stripped)


def norm(s):
    s = s.strip()
    s = re.sub(r'\(continued\)', '', s, flags=re.I)
    s = s.rstrip(':').strip()
    s = s.replace('–', '-').replace('—', '-')
    s = re.sub(r'\s+', ' ', s)
    return s.lower()


def strip_total_prefix(label_norm):
    if label_norm.startswith('total '):
        return label_norm[6:].strip()
    return label_norm


def label_matches(target_norm, header_raw):
    h = norm(header_raw)
    if not h or not target_norm:
        return False
    return target_norm == h or target_norm in h or h in target_norm


# ---------------------------------------------------------------------------
# Locate the detailed schedule's revenue/expenditure block for a year
# ---------------------------------------------------------------------------
def find_block(lines):
    """Returns (start_idx, rev_total_idx, exp_total_idx) 0-indexed into `lines`, or None."""
    candidates = []
    for i, l in enumerate(lines):
        if re.match(r'^\s*Total revenues\b', l, re.I):
            parsed = parse_data_line(l)
            if parsed and parsed[1][2] > 100_000_000:
                candidates.append(i)
    if not candidates:
        return None
    best, best_score = None, -1
    for i in candidates:
        window = lines[i:i + 450]
        score = sum(1 for w in window if re.match(r'^\s*Salaries\b', w.strip()))
        if score > best_score:
            best_score, best = score, i
    if best is None or best_score < 5:
        return None
    rev_total_idx = best

    start_idx = None
    for j in range(rev_total_idx, max(0, rev_total_idx - 300), -1):
        if re.match(r'^\s*Property\s+taxes\s*$', lines[j].strip(), re.I):
            start_idx = j
            break
    if start_idx is None:
        for j in range(rev_total_idx, max(0, rev_total_idx - 300), -1):
            if re.match(r'^\s*Revenues\s*:?\s*$', lines[j].strip(), re.I):
                start_idx = j + 1
                break
    if start_idx is None:
        start_idx = max(0, rev_total_idx - 250)

    end_idx = None
    for j in range(rev_total_idx, min(len(lines), rev_total_idx + 700)):
        if re.match(r'^\s*Total expenditures\b', lines[j], re.I):
            parsed = parse_data_line(lines[j])
            if parsed and parsed[1][2] > 50_000_000:
                end_idx = j
                break
    if end_idx is None:
        return None
    return start_idx, rev_total_idx, end_idx


# ---------------------------------------------------------------------------
# Revenue parser: category (flat) + subline
# ---------------------------------------------------------------------------
def parse_revenue(lines, start_idx, rev_total_idx, year, warnings):
    rows = []
    category_indent = None
    current_category = None
    sublines = []
    closed_explicitly = False

    def close_category():
        nonlocal current_category, sublines, closed_explicitly
        if current_category is None:
            return
        if not closed_explicitly:
            if len(sublines) == 1:
                cols = sublines[0][1]
            elif len(sublines) > 1:
                cols = tuple(sum(c[k] for _, c in sublines) for k in range(4))
                warnings.append(f"FY{year} revenue: synthesized multi-line rollup for "
                                 f"'{current_category}' from {len(sublines)} sublines (no explicit total row)")
            else:
                cols = None
                warnings.append(f"FY{year} revenue: category '{current_category}' closed with no data")
            if cols is not None:
                rows.append({"category": current_category, "subline": "", "cols": cols})
        current_category = None
        sublines = []
        closed_explicitly = False

    for idx in range(start_idx, rev_total_idx + 1):
        raw = lines[idx]
        stripped = raw.strip(' \x0c\t')
        if not stripped or is_furniture(stripped):
            continue
        parsed = parse_data_line(raw)
        if parsed is None:
            if re.search(r'\d', stripped):
                continue  # ambiguous numeric-ish furniture; skip defensively
            indent = len(raw) - len(raw.lstrip(' '))
            if category_indent is None:
                category_indent = indent
            if indent <= category_indent:
                close_category()
                current_category = stripped
            # else: cosmetic sub-group header (e.g. "State of South Carolina:") -- ignore
            continue
        label, cols = parsed
        lo = label.strip().lower()
        if lo == 'total revenues':
            close_category()
            break
        elif lo == '' or lo.startswith('total '):
            if current_category is not None:
                rows.append({"category": current_category, "subline": "", "cols": cols})
                closed_explicitly = True
                sublines = []
        else:
            rows.append({"category": current_category or "(unassigned)", "subline": label, "cols": cols})
            sublines.append((label, cols))
    close_category()
    return rows


# ---------------------------------------------------------------------------
# Expenditure parser: department + subdepartment + object
# ---------------------------------------------------------------------------
def parse_expenditure(lines, rev_total_idx, exp_total_idx, year, warnings):
    """Depth (department vs sub-department) is decided by STATE, not indentation:
    every department always closes via an explicit text-matched 'Total <dept>' row (never
    implicitly), so whenever current_department is None the next header MUST be a new
    department -- regardless of its printed indent. This matters because a handful of
    single-purpose "departments" (e.g. Emergency medical services in FY2013-2018) are
    typeset at a deeper indent than their sibling departments, which an indent-threshold
    approach misreads as a sub-department of nothing."""
    rows = []
    current_department = None
    current_subdept = None
    subdept_rows = []

    def close_subdept(explicit_cols=None):
        nonlocal current_subdept, subdept_rows
        if current_subdept is None:
            return
        if explicit_cols is not None:
            cols = explicit_cols
        elif len(subdept_rows) == 1:
            cols = subdept_rows[0][1]
        elif len(subdept_rows) > 1:
            cols = tuple(sum(c[k] for _, c in subdept_rows) for k in range(4))
            warnings.append(f"FY{year} expenditure: synthesized multi-line rollup for "
                             f"subdept '{current_subdept}' under '{current_department}'")
        else:
            cols = None
        if cols is not None:
            rows.append({"department": current_department, "subdepartment": current_subdept,
                         "object": "", "cols": cols})
        current_subdept = None
        subdept_rows = []

    for idx in range(rev_total_idx + 1, exp_total_idx + 1):
        raw = lines[idx]
        stripped = raw.strip(' \x0c\t')
        if not stripped or is_furniture(stripped):
            continue
        parsed = parse_data_line(raw)
        if parsed is None:
            if re.search(r'\d', stripped):
                continue
            n = norm(stripped)
            # Only treat a repeated header as a page-break reopening banner when the raw
            # text actually carries a "(continued)" marker -- a name MATCH alone is not
            # enough, since a department and its first sub-department can legitimately
            # share the exact same name (e.g. "Human resources" dept containing a
            # "Human resources" division).
            if 'continued' in stripped.lower():
                if current_department is not None and n == norm(current_department):
                    continue
                if current_subdept is not None and n == norm(current_subdept):
                    continue
            if current_department is None:
                close_subdept()  # defensive; should already be closed
                current_department = stripped
                current_subdept = None
            else:
                close_subdept()
                current_subdept = stripped
                subdept_rows = []
            continue
        label, cols = parsed
        lo = label.strip().lower()
        if lo == 'total expenditures':
            close_subdept()
            break
        elif lo.startswith('total '):
            target = strip_total_prefix(lo)
            if current_subdept and label_matches(target, current_subdept):
                rows.append({"department": current_department, "subdepartment": current_subdept,
                             "object": "", "cols": cols})
                current_subdept, subdept_rows = None, []
            elif current_department and label_matches(target, current_department):
                if current_subdept:
                    close_subdept()
                rows.append({"department": current_department, "subdepartment": "",
                             "object": "", "cols": cols})
                current_department = None
            else:
                warnings.append(f"FY{year} expenditure: 'Total {target}' matched neither "
                                 f"subdept '{current_subdept}' nor dept '{current_department}' -- best-effort close")
                if current_subdept:
                    rows.append({"department": current_department, "subdepartment": current_subdept,
                                 "object": "", "cols": cols})
                    current_subdept, subdept_rows = None, []
                elif current_department:
                    rows.append({"department": current_department, "subdepartment": "",
                                 "object": "", "cols": cols})
                    current_department = None
        elif lo == '':
            if current_subdept:
                rows.append({"department": current_department, "subdepartment": current_subdept,
                             "object": "", "cols": cols})
                current_subdept, subdept_rows = None, []
            elif current_department:
                rows.append({"department": current_department, "subdepartment": "",
                             "object": "", "cols": cols})
        else:
            rows.append({"department": current_department or "(unassigned)",
                         "subdepartment": current_subdept or "", "object": label, "cols": cols})
            if current_subdept:
                subdept_rows.append((label, cols))
    return rows


# ---------------------------------------------------------------------------
# FY2012 (OCR) — attempt with the same pipeline; flag reliability
# ---------------------------------------------------------------------------
def extract_year(year, path, warnings):
    raw = open(path, encoding="utf-8", errors="replace").read()
    lines = raw.split('\n')
    block = find_block(lines)
    if block is None:
        warnings.append(f"FY{year}: detailed schedule NOT FOUND / not confidently located -- SKIPPED")
        return None
    start_idx, rev_total_idx, exp_total_idx = block
    rev_rows = parse_revenue(lines, start_idx, rev_total_idx, year, warnings)
    exp_rows = parse_expenditure(lines, rev_total_idx, exp_total_idx, year, warnings)
    rev_total = parse_data_line(lines[rev_total_idx])[1]
    exp_total = parse_data_line(lines[exp_total_idx])[1]
    return {"rev_rows": rev_rows, "exp_rows": exp_rows,
            "rev_total": rev_total, "exp_total": exp_total,
            "start_idx": start_idx, "rev_total_idx": rev_total_idx, "exp_total_idx": exp_total_idx}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    warnings = []
    results = {}

    for year in YEARS:
        path = os.path.join(TEXT, f"fy{year}.txt")
        if not os.path.exists(path):
            warnings.append(f"FY{year}: source text file missing -- SKIPPED")
            continue
        try:
            results[year] = extract_year(year, path, warnings)
        except Exception as e:
            warnings.append(f"FY{year}: extraction raised {type(e).__name__}: {e} -- SKIPPED")
            results[year] = None

    # FY2012 OCR attempt
    ocr_path = os.path.join(TEXT, "fy2012_ocr.txt")
    fy2012_result = None
    fy2012_note = ""
    if os.path.exists(ocr_path):
        try:
            fy2012_result = extract_year(2012, ocr_path, warnings)
            if fy2012_result is None:
                fy2012_note = "FY2012 (OCR): detailed schedule not cleanly locatable in OCR text -- SKIPPED, budget-book/summary fallback needed."
            else:
                fy2012_note = "FY2012 (OCR): extracted but UNVERIFIED reliability -- OCR text is noisy; treat with caution, spot-check before use."
        except Exception as e:
            fy2012_note = f"FY2012 (OCR): extraction raised {type(e).__name__}: {e} -- SKIPPED."
    else:
        fy2012_note = "FY2012 (OCR): source text file missing -- SKIPPED."
    warnings.append(fy2012_note)

    # ---- write CSVs ----
    rev_csv_path = os.path.join(RES, "detailed-revenue-by-year.csv")
    exp_csv_path = os.path.join(RES, "detailed-expenditure-by-year.csv")

    rev_row_count = 0
    exp_row_count = 0
    with open(rev_csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fiscal_year", "category", "subline", "original_budget", "final_budget", "actual", "variance"])
        for year in sorted([y for y in results if results[y]] + ([2012] if fy2012_result else [])):
            r = fy2012_result if year == 2012 else results.get(year)
            if not r:
                continue
            for row in r["rev_rows"]:
                w.writerow([year, row["category"], row["subline"], *row["cols"]])
                rev_row_count += 1
    with open(exp_csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["fiscal_year", "department", "subdepartment", "object", "original_budget", "final_budget", "actual", "variance"])
        for year in sorted([y for y in results if results[y]] + ([2012] if fy2012_result else [])):
            r = fy2012_result if year == 2012 else results.get(year)
            if not r:
                continue
            for row in r["exp_rows"]:
                w.writerow([year, row["department"], row["subdepartment"], row["object"], *row["cols"]])
                exp_row_count += 1

    # ---- GATE 1: FY2025 department totals vs Codex production CSV ----
    print("=" * 100)
    print("GATE 1 — FY2025 department TOTAL rows vs Codex production CSV (spending_categories)")
    print("=" * 100)
    codex_dept = {}
    if os.path.exists(PROD_CSV):
        with open(PROD_CSV) as f:
            for row in csv.DictReader(f):
                if row["fiscal_year"] == "2025" and row["section"] == "spending_categories":
                    codex_dept[row["label"]] = (int(row["budget"]), int(row["actual"]))
    r25 = results.get(2025)
    our_dept_totals = {}
    if r25:
        for row in r25["exp_rows"]:
            if row["subdepartment"] == "" and row["object"] == "":
                our_dept_totals[row["department"]] = row["cols"]  # (orig, final, actual, variance)

    def find_our_match(codex_label):
        # try direct/fuzzy match against our raw (verbatim) department labels
        cl = norm(codex_label)
        for dept, cols in our_dept_totals.items():
            dn = norm(dept)
            if cl == dn or cl in dn or dn in cl:
                return dept, cols
            # "Total elected officials - X" groupings vs Codex's bare label (e.g. "Judicial services")
            if cl.split()[0] in dn and any(w in dn for w in cl.split()):
                pass
        # special-case the elected-officials groupings
        mapping_hints = {
            "law enforcement": "elected officials - law enforcement",
            "judicial services": "elected officials - judicial services",
            "fiscal services": "elected officials - fiscal services",
        }
        if cl in mapping_hints:
            for dept, cols in our_dept_totals.items():
                if norm(mapping_hints[cl]) in norm(dept):
                    return dept, cols
        return None, None

    gate1_pass = True
    print(f"{'Codex label':<38}{'Codex final':>14}{'Codex actual':>14}   {'Our label':<40}{'Our final':>14}{'Our actual':>14}  match")
    for label, (cbudget, cactual) in sorted(codex_dept.items()):
        our_label, our_cols = find_our_match(label)
        if our_cols is None:
            print(f"{label:<38}{cbudget:>14,}{cactual:>14,}   {'NOT FOUND':<40}{'':>14}{'':>14}  FAIL")
            gate1_pass = False
            continue
        _, ofinal, oactual, _ = our_cols
        ok = (ofinal == cbudget and oactual == cactual)
        if not ok:
            gate1_pass = False
        print(f"{label:<38}{cbudget:>14,}{cactual:>14,}   {our_label:<40}{ofinal:>14,}{oactual:>14,}  {'PASS' if ok else 'FAIL'}")
    print(f"\nGATE 1 OVERALL: {'PASS' if gate1_pass and codex_dept else 'FAIL'}")

    # ---- GATE 2 & 3: per-year reconciliation ----
    print()
    print("=" * 100)
    print("GATE 2 & 3 — per-year reconciliation")
    print("  Gate 2: revenue categories sum to total revenue; department totals (+debt) sum to total expenditure")
    print("  Gate 3: object lines sum to subdept total; subdept totals sum to dept total")
    print("=" * 100)
    print(f"{'FY':<6}{'rev_cat_sum==total':>20}{'exp_dept_sum==total':>22}{'gate3_internal':>16}{'warnings':>10}")

    all_years_for_report = sorted([y for y in results if results[y]] + ([2012] if fy2012_result else []))
    gate_summary = {}
    for year in all_years_for_report:
        r = fy2012_result if year == 2012 else results[year]
        rev_rows = r["rev_rows"]
        exp_rows = r["exp_rows"]
        rev_total_actual = r["rev_total"][2]
        exp_total_actual = r["exp_total"][2]

        cat_sum = sum(row["cols"][2] for row in rev_rows if row["subline"] == "")
        gate2_rev = (cat_sum == rev_total_actual)

        dept_sum = sum(row["cols"][2] for row in exp_rows if row["subdepartment"] == "" and row["object"] == "")
        gate2_exp = (dept_sum == exp_total_actual)

        # gate 3: object lines sum to subdept; subdept sums to dept
        by_dept_subdept_objects = {}
        subdept_totals = {}
        dept_totals = {}
        for row in exp_rows:
            key = (row["department"], row["subdepartment"])
            if row["object"] != "":
                by_dept_subdept_objects.setdefault(key, 0)
                by_dept_subdept_objects[key] += row["cols"][2]
            elif row["subdepartment"] != "":
                subdept_totals[key] = row["cols"][2]
            else:
                dept_totals[row["department"]] = row["cols"][2]

        gate3_ok = True
        gate3_fail_detail = []
        for key, objsum in by_dept_subdept_objects.items():
            dept, subdept = key
            if subdept == "":
                # objects direct under department (EMS-style); should sum to dept total
                dt = dept_totals.get(dept)
                if dt is None or dt != objsum:
                    gate3_ok = False
                    gate3_fail_detail.append(f"{dept} (direct objects) sum {objsum:,} != dept total {dt}")
            else:
                st = subdept_totals.get(key)
                if st is None or st != objsum:
                    gate3_ok = False
                    gate3_fail_detail.append(f"{dept}/{subdept} objects sum {objsum:,} != subdept total {st}")
        dept_subdept_sums = {}
        for (dept, subdept), st in subdept_totals.items():
            dept_subdept_sums.setdefault(dept, 0)
            dept_subdept_sums[dept] += st
        for dept, ssum in dept_subdept_sums.items():
            dt = dept_totals.get(dept)
            if dt is None or dt != ssum:
                gate3_ok = False
                gate3_fail_detail.append(f"{dept} subdept sum {ssum:,} != dept total {dt}")

        n_warn = sum(1 for w in warnings if w.startswith(f"FY{year} "))
        gate_summary[year] = (gate2_rev, gate2_exp, gate3_ok, n_warn, gate3_fail_detail)
        tag = "(OCR)" if year == 2012 else ""
        print(f"{year}{tag:<6}{('PASS' if gate2_rev else 'FAIL '+str(cat_sum)+'!='+str(rev_total_actual)):>20}"
              f"{('PASS' if gate2_exp else 'FAIL '+str(dept_sum)+'!='+str(exp_total_actual)):>22}"
              f"{('PASS' if gate3_ok else 'FAIL'):>16}{n_warn:>10}")
        if gate3_fail_detail:
            for d in gate3_fail_detail[:6]:
                print(f"       gate3 detail: {d}")

    # ---- summary ----
    print()
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    print(f"Years extracted: {sorted([y for y in results if results[y]])}")
    print(f"Years skipped/missing: {sorted([y for y in YEARS if results.get(y) is None])}")
    print(fy2012_note)
    print(f"\nRow counts: detailed-revenue-by-year.csv = {rev_row_count} rows, "
          f"detailed-expenditure-by-year.csv = {exp_row_count} rows")
    print(f"Wrote: {rev_csv_path}")
    print(f"Wrote: {exp_csv_path}")

    if warnings:
        print(f"\n{len(warnings)} warnings/flags:")
        for w in warnings:
            print(f"  - {w}")


if __name__ == "__main__":
    main()
