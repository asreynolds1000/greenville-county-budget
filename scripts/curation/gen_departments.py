#!/usr/bin/env python3
"""Regenerate the General Fund department curation from source.

Re-runnable: strips the previously generated department rows from the curated
dimension CSVs, then regenerates entities, label maps, and year-scoped edges from
the frozen department appropriations file plus any recovered department data
(e.g. the FY2022-23 image table transcribed via vision).

Category names and reorganization merges reflect research into the county's own
budget books (see docs/curation-notes.md). Run: `python3 -m scripts.curation.gen_departments`

⚠️ STALE AS OF 2026-07-21. DO NOT RUN WITHOUT READING THIS.

The curated dimension CSVs have since been corrected in ways this script does not know
about, so running it REGRESSES them. Verified by running it: 13 adopted hierarchy rollups
stopped reconciling and the build failed.

The specific loss is the Property Management / Animal Care parentage fix. Those two
departments genuinely appear under different operating categories in different eras, and
the committed edges split their ranges accordingly, marked "as printed". This script
collapses each pair back into one 2002-2026 edge, which re-creates the overlapping-parent
double count the napkin records as resolved.

Two other things it does that are not wanted: it rewrites all three CSVs with CRLF line
endings (`csv.writer` on a `newline=""` file), so every line shows as changed and the real
diff is invisible; and it reorders unrelated rows.

Before running it again, port the "as printed" edge ranges into it and make it write LF.
Until then, treat the committed CSVs as the source of truth, not this script's output.

Department aliases used to be slated for this file (per the napkin, because it regenerates
the dept rows). They live in `gen_entity_aliases.py` instead, which only touches the
`common_aliases` column and can therefore be run safely.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

from scripts.production.labels import normalize_label as n

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "production"
SOURCES = [
    ROOT / "audit" / "blind-extraction" / "general-fund-department-appropriations.csv",
    ROOT / "data" / "recovered" / "fy2022-2023-general-fund-appropriations.csv",
]

# Operating-category column value -> canonical entity (reorganization merges,
# corroborated against the county budget books' organizational-structure sections).
CAT_MERGE = {
    "GENERAL SERVICES": "opcat.general-services", "DEPARTMENT OF GENERAL SERVICES": "opcat.general-services",
    "ELECTED & APPOINTED OFFICES/JUDICIAL": "opcat.judicial", "JUDICIAL SERVICES": "opcat.judicial",
    "PUBLIC SAFETY": "opcat.public-safety", "DEPARTMENT OF PUBLIC SAFETY": "opcat.public-safety",
    "OPERATING TRANSFERS": "opcat.operating-transfers",
    "OTHER SERVICES": "opcat.other-services", "O THER SERV ICES": "opcat.other-services",
    "PUBLIC WORKS": "opcat.public-works", "DEPARTMENT OF PUBLIC WORKS": "opcat.public-works",
    "ADMINISTRATIVE": "opcat.administrative", "DEPARTMENT OF ADMINISTRATION": "opcat.department-of-administration",
    "APPOINTED OFFICIALS/ADMINISTRATIVE SERVICES": "opcat.administrative",
    "ELECT. & APPTD. OFFICES/ LAW ENFORCE.": "opcat.law-enforcement", "LAW ENFORCEMENT SERVICES": "opcat.law-enforcement",
    "ELECTED AND APPOINTED OFFICES/FISCAL": "opcat.fiscal", "FISCAL SERVICES": "opcat.fiscal",
    "HUMAN RESOURCES": "opcat.human-resources",
    "COMMUNITY DEVELOPMENT AND PLANNING": "opcat.community-development-planning",
    "COMMUNITY PLANNING AND DEVELOPMENT": "opcat.community-development-planning",
    "DEPARTMENT OF PLANNING AND DEVELOPMENT": "opcat.community-development-planning",
    "OTHER FINANCING USES": "opcat.other-financing-uses", "STRATEGIC OPERATIONS": "opcat.strategic-operations",
}
TOTAL_MAP = {
    n("TOTAL ADMINISTRATIVE"): "opcat.administrative", n("TOTAL ADMINISTRATIVE SERVICES"): "opcat.administrative",
    n("TOTAL DEPT OF ADMINISTRATION"): "opcat.department-of-administration",
    n("TOTAL COMMUNITY DEVELOPMENT & PLNG"): "opcat.community-development-planning",
    n("TOTAL COMMUNITY PLANNING AND DEV"): "opcat.community-development-planning",
    n("TOTAL PLANNING AND DEVELOPMENT"): "opcat.community-development-planning",
    n("TOTAL EMERGENECY MANAGEMENT $"): "opcat.emergency-management", n("TOTAL EMS"): "opcat.emergency-medical-services",
    n("TOTAL FISCAL SERVICES"): "opcat.fiscal", n("TOTAL GENERAL SERVICES"): "opcat.general-services",
    n("TOTAL HUMAN RESOURCES"): "opcat.human-resources", n("TOTAL JUDICIAL SERVICES"): "opcat.judicial",
    n("TOTAL LAW ENFORCEMENT"): "opcat.law-enforcement", n("TOTAL LAW ENFORCEMENT SERVICES"): "opcat.law-enforcement",
    n("TOTAL OPERATING TRANSFERS"): "opcat.operating-transfers",
    n("TOTAL OTHER FINANCING USES"): "opcat.other-financing-uses", n("TOTAL OTHER SERVICES"): "opcat.other-services",
    n("TOTAL PUBLIC SAFETY"): "opcat.public-safety", n("TOTAL PUBLIC WORKS"): "opcat.public-works",
    n("TOTAL STRATEGIC OPERATIONS"): "opcat.strategic-operations",
}
GRAND = n("TOTAL GENERAL FUND EXPENDITURES")
OPCAT_NAMES = {
    "opcat.administrative": "Administrative Services", "opcat.community-development-planning": "Community Planning and Development",
    "opcat.department-of-administration": "Department of Administration",
    "opcat.emergency-management": "Emergency Management", "opcat.emergency-medical-services": "Emergency Medical Services",
    "opcat.fiscal": "Fiscal Services", "opcat.general-services": "General Services", "opcat.human-resources": "Human Resources",
    "opcat.judicial": "Judicial Services", "opcat.law-enforcement": "Law Enforcement Services",
    "opcat.operating-transfers": "Operating Transfers", "opcat.other-financing-uses": "Other Financing Uses",
    "opcat.other-services": "Other Services", "opcat.public-safety": "Public Safety", "opcat.public-works": "Public Works",
    "opcat.strategic-operations": "Strategic Operations",
}
DEPT_TYPES = {"department", "operating_category", "general_fund_total"}
DEPT_MAPNOTE = "GF department appropriations"
DEPT_EDGENOTES = {"GF operating category", "Department in operating category"}
APPROPRIATIONS_SECTION = "General Fund Appropriations Summary"
LABEL_FIELDS = [
    "original_label", "match_scope", "table_section", "raw_operating_category",
    "source_code", "entity_id", "effective_from_fy", "effective_to_fy",
    "mapping_note", "review_status",
]


def _is_total_label(label: str) -> bool:
    """A printed category/grand total row, robust to OCR letter-splits.

    Detection despaces before matching because OCR mangles ``TOTAL PUBLIC
    SAFETY`` into ``TO TAL PUBLIC SAFETY``; the raw ``startswith("TOTAL")`` those
    variants failed silently minted phantom ``dept.total*`` children that
    double-counted the category rollups. Routing is gated on ``TOTAL_MAP``
    membership; this predicate guards the assertion so any despaced total not yet
    mapped fails loudly instead of becoming a fake department.
    """
    return re.sub(r"\s+", "", label).upper().startswith("TOTAL")


def _strip(path, keep, fields=None):
    rows = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
    fields = fields or (list(rows[0].keys()) if rows else None)
    kept = [r for r in rows if keep(r)]
    if fields:
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(fields), extrasaction="ignore")
            w.writeheader(); w.writerows(kept)


def main():
    # 1. strip prior department rows so the script is idempotent
    _strip(DATA / "entity.csv", lambda r: r["entity_type"] not in DEPT_TYPES)
    _strip(DATA / "label_map.csv", lambda r: r.get("mapping_note") != DEPT_MAPNOTE, LABEL_FIELDS)
    _strip(DATA / "hierarchy_edge.csv", lambda r: r.get("edge_note") not in DEPT_EDGENOTES)

    rows = []
    for src in SOURCES:
        rows.extend(csv.DictReader(src.open(newline="", encoding="utf-8")))
    badcol = {r["operating_category"] for r in rows} - set(CAT_MERGE)
    assert not badcol, f"unmapped operating_category: {badcol}"
    badtot = {n(r["original_label"]) for r in rows if _is_total_label(r["original_label"])} - set(TOTAL_MAP) - {GRAND}
    assert not badtot, f"unmapped TOTAL labels (despaced): {badtot}"

    # A repeated label can denote two separately printed lines in the same year.
    # Preserve those as category-scoped entities; ordinary cross-year category
    # moves remain one entity connected by year-scoped hierarchy edges.
    categories_by_label_year = defaultdict(set)
    for r in rows:
        label = r["original_label"].strip()
        if not _is_total_label(label):
            categories_by_label_year[(n(label), int(r["fiscal_year"]))].add(r["operating_category"])
    simultaneous_labels = {
        label for (label, _year), categories in categories_by_label_year.items()
        if len(categories) > 1
    }

    dept = defaultdict(lambda: {"nc": defaultdict(int), "ymin": 9999, "ymax": 0})
    dept_edge = defaultdict(lambda: [9999, 0])
    opcat_years = defaultdict(lambda: [9999, 0])
    label_maps = set()
    for r in rows:
        L = r["original_label"].strip(); y = int(r["fiscal_year"]); k = n(L)
        if k == GRAND:
            label_maps.add((L, "label+section", APPROPRIATIONS_SECTION, "", "gf.expenditures")); continue
        if k in TOTAL_MAP:
            oc = TOTAL_MAP[k]
            label_maps.add((L, "label+section", APPROPRIATIONS_SECTION, "", oc))
            yr = opcat_years[oc]; yr[0] = min(yr[0], y); yr[1] = max(yr[1], y); continue
        if k in simultaneous_labels:
            did = "dept." + k + "." + n(r["operating_category"])
            scope = "label+section+category"
            category_scope = r["operating_category"]
        else:
            did = "dept." + k
            scope = "label+section"
            category_scope = ""
        d = dept[did]; d["nc"][L] += 1; d["ymin"] = min(d["ymin"], y); d["ymax"] = max(d["ymax"], y)
        label_maps.add((L, scope, APPROPRIATIONS_SECTION, category_scope, did))
        oc = CAT_MERGE[r["operating_category"]]
        e = dept_edge[(did, oc)]; e[0] = min(e[0], y); e[1] = max(e[1], y)
        yr = opcat_years[oc]; yr[0] = min(yr[0], y); yr[1] = max(yr[1], y)

    with (DATA / "entity.csv").open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["gf.expenditures", "general_fund_total", "Total General Fund Expenditures", "",
                    "Summed General Fund appropriations (department view); differs from the GF budget in some years", "", "", ""])
        for oc, name in OPCAT_NAMES.items():
            yr = opcat_years.get(oc, [None, None])
            w.writerow([oc, "operating_category", name, "", "General Fund operating category (department view)", "",
                        yr[0] if yr[0] not in (None, 9999) else "", yr[1] if yr[1] else ""])
        for did, d in dept.items():
            name = max(d["nc"].items(), key=lambda kv: kv[1])[0]
            w.writerow([did, "department", name, "", "General Fund department appropriation", "", d["ymin"], d["ymax"]])
    with (DATA / "label_map.csv").open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for L, scope, section, category_scope, ent in sorted(label_maps):
            w.writerow([L, scope, section, category_scope, "", ent, "", "", DEPT_MAPNOTE, "human_confirmed"])
    with (DATA / "hierarchy_edge.csv").open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for oc, yr in opcat_years.items():
            w.writerow(["gf.expenditures", oc, "contains", yr[0] if yr[0] != 9999 else "", yr[1] if yr[1] else "", "GF operating category"])
        for (did, oc), yr in dept_edge.items():
            w.writerow([oc, did, "contains", yr[0], yr[1], "Department in operating category"])
    print(f"regenerated: {len(dept)} departments, {len(OPCAT_NAMES)} categories, {len(label_maps)} labels, {len(dept_edge)} dept->cat edges")


if __name__ == "__main__":
    main()
