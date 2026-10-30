"""Set the resident-vocabulary aliases on existing entity rows.

Run:  python3 -m scripts.curation.gen_entity_aliases

Search over canonical names alone fails the people it is most meant to serve. Nobody types
"DETENTION CENTER" looking for the jail, and nobody types "REAL PROPERTY SERVICES" looking
for who decides what their house is worth for tax purposes.

## Why this is its own script

The obvious home for department aliases was `gen_departments.py`, which owns the department
rows and would wipe a hand edit to `entity.csv`. But that script is stale: running it
regresses the curated "as printed" parentage edges and fails the build (see its docstring).

So this one does the narrowest possible thing. It rewrites exactly ONE COLUMN,
`common_aliases`, on rows that already exist, and it fails rather than creating a row for an
entity_id it does not recognise. It cannot reorder, drop, or invent anything, which is what
makes it safe to run against curated files no generator owns end to end.

Idempotent: running it twice produces the same bytes. LF line endings, matching the
committed files -- `csv.writer` on a `newline=""` file emits CRLF on this platform, which is
how `gen_departments` came to show every line as changed.
"""

from __future__ import annotations

import csv
import pathlib

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_ENTITY = _ROOT / "data" / "production" / "entity.csv"

# Resident vocabulary. What someone types into a search box is almost never what a budget
# book calls a department, so search over canonical names alone fails the people it is most
# meant to serve: nobody searches "DETENTION CENTER" for the jail.
#
# Every entry here is a term a resident would plausibly use for that department, and each is
# either self-evident from the department's own name or verified against the county's
# description of what it does. Two were verified rather than assumed, from the FY2026 budget
# book's account of the tax division: Real Property Services is the ASSESSMENT function
# ("locating, appraising, and listing all real property", plus the five-year reassessment),
# and the Tax Collector is the COLLECTION function ("real, personal, motor vehicle, and
# other taxes are collected").
#
# Deliberately absent: "trash" and "garbage". Solid waste is not a General Fund department,
# and pointing those words at the nearest plausible line would be inventing an answer. A
# search that returns nothing is honest; one that returns the wrong department is not.
#
# These live here rather than in entity.csv because this script regenerates every dept row
# and would wipe a hand edit there (see napkin).
DEPT_ALIASES = {
    "dept.sheriff": ["deputies", "sheriff's office", "police", "law enforcement", "patrol"],
    "dept.detentioncenter": ["jail", "detention", "inmates"],
    "dept.emergencymedicalservices": ["ambulance", "EMS", "paramedics"],
    "dept.emergencymanagement": ["disaster", "emergency preparedness"],
    "dept.animalcareservices": ["animal shelter", "animal control", "pets", "strays"],
    "dept.coroner": ["coroner"],
    "dept.medicalexaminer": ["autopsy", "medical examiner"],
    "dept.forensics": ["crime lab", "forensics"],
    "dept.realpropertyservices": ["assessor", "property assessment", "appraisal", "reassessment"],
    "dept.taxcollector": ["tax bill", "paying taxes", "car taxes", "vehicle tax"],
    "dept.treasurer": ["treasurer"],
    "dept.auditor": ["auditor"],
    "dept.registerofdeeds": ["deeds", "property records", "mortgage records"],
    "dept.registrationandelection": ["elections", "voter registration", "polling places", "voting"],
    "dept.probatecourt": ["probate", "wills", "estates", "marriage licence", "marriage license"],
    "dept.magistrates": ["magistrate court", "traffic court"],
    "dept.clerkofcourt": ["court records", "clerk of court", "jury"],
    "dept.circuitsolicitor": ["prosecutor", "solicitor", "district attorney"],
    "dept.publicdefender": ["public defender"],
    "dept.indigentdefense": ["court-appointed lawyer", "indigent defense"],
    "dept.veteransaffairs": ["veterans"],
    # All three planning entities carry the same terms. The current one (FY2020-2026) had
    # none, so "zoning" returned only departments that stopped existing in 2013 — a search
    # that answers with defunct entities is worse than one that answers with nothing,
    # because the reader has no way to know the current department was omitted.
    "dept.planning": ["planning", "zoning", "land use"],
    "dept.departmentofplanning": ["planning", "zoning"],
    "dept.planningdepartment": ["planning", "zoning"],
    "dept.codeenforcement": ["code enforcement", "building inspections", "permits"],
    "dept.codesenforcement": ["code enforcement", "building inspections", "permits"],
    "dept.propertymanagement": ["county buildings", "facilities"],
    "dept.humanresources": ["HR", "hiring", "staff"],
    "dept.informationsystemsandservices": ["IT", "computers", "technology"],
    "dept.geographicinformationsystem": ["GIS", "maps", "mapping"],
    "dept.geographicinformationsystems": ["GIS", "maps", "mapping"],
    "dept.managementbudget": ["budget office"],
    "dept.countycouncil": ["council", "councilmembers"],
    "dept.countyadministrator": ["administrator", "county manager"],
    "dept.countyattorney": ["county lawyer", "legal"],
    "dept.soilandwater": ["soil and water", "conservation"],
    "dept.engineeringandroadbureaus": ["roads", "paving", "road maintenance"],
    "dept.publicworksadministration": ["public works"],
    "dept.outsideagencies": ["outside agencies", "nonprofit funding"],
    "dept.employeebenefitfund": ["employee benefits", "health insurance"],
    "dept.informationsytems": ["IT", "computers", "technology"],
    "dept.masterinequity": ["foreclosure", "master in equity"],
    "dept.procurementservices": ["procurement", "purchasing", "contracts"],
    "dept.financialoperations": ["finance", "accounting"],
    "dept.taxservices": ["tax services"],
    "dept.records": ["records"],
    "dept.humanrelations": ["human relations"],
    "dept.legislativedelegation": ["legislative delegation"],
    "dept.boardofappeals": ["board of appeals", "tax appeal", "assessment appeal"],

    # Named special revenue funds. "roads" deliberately reaches several lines rather than
    # one: road money genuinely sits in more than one fund and in a General Fund
    # department, and collapsing them to a single result would imply an undifferentiated
    # road budget that does not exist (spec Step 7's own example).
    "fund.sr.road-program": ["roads", "road program", "road maintenance"],
    "fund.sr.road-paving": ["roads", "paving", "resurfacing"],
    "fund.sr.e911": ["911", "dispatch", "emergency calls"],
    "fund.sr.parks-recreation-tourism": ["parks", "recreation", "trails"],
    "fund.sr.hospitality-tax": ["hospitality tax", "restaurant tax", "prepared food tax"],
    "fund.sr.local-accommodations-tax": ["accommodations tax", "hotel tax"],
    "fund.sr.state-accommodations-tax": ["accommodations tax", "hotel tax"],
    "fund.sr.victims-rights": ["victim services", "victims rights"],
    "fund.sr.affordable-housing": ["affordable housing", "housing"],
    "fund.sr.natural-resources": ["natural resources", "conservation"],
    "fund.sr.infrastructure-bank": ["infrastructure bank"],
    "fund.sr.medical-charities": ["medical charities"],
    "fund.sr.public-safety-interop": ["radios", "interoperable communications"],
}


def main() -> int:
    with _ENTITY.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    known = {row["entity_id"] for row in rows}
    unknown = sorted(set(DEPT_ALIASES) - known)
    if unknown:
        raise SystemExit(
            "refusing to write: these entity_ids do not exist, so their aliases would "
            f"silently reach nobody: {unknown}"
        )

    changed = 0
    for row in rows:
        aliases = DEPT_ALIASES.get(row["entity_id"])
        if aliases is None:
            continue
        joined = "; ".join(aliases)
        if row["common_aliases"] != joined:
            row["common_aliases"] = joined
            changed += 1

    # `newline=""` plus an explicit LF terminator. Setting `newline="\n"` alone is not
    # enough: csv.writer's own lineterminator defaults to CRLF, which is what rewrote every
    # line of this file the first time and buried the real diff.
    with _ENTITY.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    total = sum(len(v) for v in DEPT_ALIASES.values())
    print(f"set aliases on {changed} rows ({len(DEPT_ALIASES)} entities, {total} terms)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
