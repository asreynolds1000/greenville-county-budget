#!/usr/bin/env python3
"""#7 Department crosswalk: map each year's source department label to a canonical key,
with comparability notes for the FY2013 reorganization and the FY2026 budget-book taxonomy."""
import csv, os, re
RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def norm(s): return re.sub(r'[:\s]+$','',s.strip()).lower()

# canonical key per normalized ACFR label
CANON={
 "administrative":"administrative_services","administrative services":"administrative_services",
 "general services":"general_services",
 "human resources":"human_resources",
 "public works":"public_works",
 "public safety":"public_safety",
 "community development and planning":"community_development_planning",
 "emergency medical services":"emergency_medical_services",
 "elected officials - judicial":"judicial_services","elected officials - judicial services":"judicial_services",
 "elected officials - fiscal":"fiscal_services","elected officials - fiscal services":"fiscal_services",
 "elected officials - law enforcement":"law_enforcement",
 "boards, commissions and others":"boards_commissions_others",
 "debt service":"debt_service",
}
REORG_NOTE="FY2011-12 only. The FY2013 reorganization replaced {human_resources, public_works} with {community_development_planning, emergency_medical_services}; these four are a REORGANIZATION, not renames, so pre-2013 vs post-2013 comparison of these lines is a break (the stable 7 depts compare cleanly)."
NEW_NOTE="FY2013+ (created in the 2013 reorganization; see human_resources/public_works)."

rows=[]
exp=list(csv.DictReader(open(f"{RES}/detailed-expenditure-by-year.csv")))
seen=set()
for r in exp:
    if r['subdepartment'].strip() or r['object'].strip(): continue
    fy=r['fiscal_year']; src=r['department']; key=(fy,src)
    if key in seen: continue
    seen.add(key)
    ck=CANON.get(norm(src),"UNMAPPED")
    note=""
    if ck in ("human_resources","public_works"): note=REORG_NOTE
    elif ck in ("community_development_planning","emergency_medical_services") and int(fy)>=2013: note=NEW_NOTE
    elif ck=="debt_service": note="Broken out as its own line FY2022+; earlier years carry debt-service principal inside total expenditures without a department line."
    rows.append(["ACFR",fy,src,ck,note])

# FY2026 budget book (Agent 4) — a THIRD taxonomy
BUDGET26=[
 ("Administrative services","administrative_services",""),
 ("Department of Administration","COMPOSITE","Budget-book grouping; NOT 1:1 with ACFR. Contains human_resources + information systems + emergency management + emergency_medical_services ($32,783,093 of $44,035,256 is EMS). To compare EMS across years, pull the $32.78M sub-line, not this total."),
 ("General services","general_services","Budget-book composition differs (e.g. Tax Services sits here, not under fiscal_services)."),
 ("Public works","public_works","Budget book retains a Public Works dept (Animal Care/Engineering/Roads/Property Mgmt); in the ACFR these functions sit under community_development_planning / general_services. p.37 label transposed with Planning (use p.57)."),
 ("Planning and development","community_development_planning","Budget-book label; ~maps to ACFR community_development_planning. p.37/p.57 transposition applies."),
 ("Public safety","public_safety","Narrower than ACFR public_safety (Detention/Forensics/Records/Indigent Defense only); Sheriff/Coroner/ME are under law_enforcement here."),
 ("Judicial services","judicial_services",""),
 ("Fiscal services","fiscal_services",""),
 ("Law enforcement services","law_enforcement",""),
 ("Boards, commissions & others","boards_commissions_others","Printed as 'OTHER SERVICES' in the itemized p.57 table."),
]
for src,ck,note in BUDGET26:
    rows.append(["FY2026-budget-book","2026",src,ck,note])

with open(f"{RES}/department-crosswalk.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["source_type","fiscal_year","source_department","canonical_key","comparability_note"])
    w.writerows(rows)

unmapped=[r for r in rows if r[3]=="UNMAPPED"]
print(f"Wrote department-crosswalk.csv: {len(rows)} rows, {len(unmapped)} UNMAPPED")
for r in unmapped: print("  UNMAPPED:",r)
# distinct canonical keys
print("canonical keys:", sorted(set(r[3] for r in rows)))
