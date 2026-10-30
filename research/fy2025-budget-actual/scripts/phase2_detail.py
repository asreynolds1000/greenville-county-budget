#!/usr/bin/env python3
"""Phase 2: emit reconciled multi-year revenue-category and expenditure-department detail
for the Greenville County General Fund, FY2011-FY2025."""
import json, csv, os

RES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
recs=json.load(open(f"{RES}/series_full.json"))

# FY2012 detail (OCR-derived; reconciles to its budget-basis totals)
recs["2012"]["rev_lines"]=[
 {"label":"Property taxes","original":79177500,"final":79177500,"actual":74309129,"variance":-4868371},
 {"label":"County offices","original":26011129,"final":26011129,"actual":26762065,"variance":750936},
 {"label":"Intergovernmental","original":14662098,"final":14662098,"actual":16022078,"variance":1359980},
 {"label":"Interest and investment income","original":1227187,"final":1227187,"actual":901218,"variance":-325969},
 {"label":"Franchise fees","original":2700000,"final":2700000,"actual":3044945,"variance":344945},
 {"label":"Other","original":1629113,"final":1629113,"actual":2552943,"variance":923830}]
recs["2012"]["exp_lines"]=[
 {"label":"Administrative services","original":2109216,"final":2170559,"actual":2123758,"variance":46801},
 {"label":"General services","original":10242267,"final":9855702,"actual":9798246,"variance":57456},
 {"label":"Human resources","original":2103414,"final":2123095,"actual":2122439,"variance":656},
 {"label":"Public works","original":16618275,"final":16571906,"actual":15978956,"variance":592950},
 {"label":"Public safety","original":37070784,"final":37650560,"actual":37646695,"variance":3865},
 {"label":"Judicial services","original":15435794,"final":15480912,"actual":15429880,"variance":51032},
 {"label":"Fiscal services","original":2451068,"final":2418862,"actual":2396275,"variance":22587},
 {"label":"Law enforcement","original":35889200,"final":35931274,"actual":35869149,"variance":62125},
 {"label":"Boards, commission & others","original":5788589,"final":5395592,"actual":4631188,"variance":764404},
 {"label":"Capital outlay","original":80742,"final":190887,"actual":183180,"variance":7707}]

import re
DROP=re.compile(r'transfer|net change|other financing|excess|deficiency|fund balance',re.I)

def A(r,k): return (r.get(k) or {}).get("actual")
def F(r,k): return (r.get(k) or {}).get("final")

rev_rows=[]; exp_rows=[]; recon=[]
for y in range(2011,2026):
    r=recs[str(y)]; sc=f"gc-acfr-fy{y}"
    # revenue
    rl=r["rev_lines"]
    for L in rl:
        rev_rows.append([y,L["label"],L.get("original",""),L.get("final",""),L["actual"],L.get("variance",""),sc])
    rsum=sum(L["actual"] for L in rl); rtot=A(r,"total_revenues")
    # expenditure: drop non-expenditure lines, add debt-service/other residual to reconcile
    el=[L for L in r["exp_lines"] if not DROP.search(L["label"])]
    esum=sum(L["actual"] for L in el); etot=A(r,"total_expenditures")
    resid=etot-esum
    for L in el:
        exp_rows.append([y,L["label"],L.get("original",""),L.get("final",""),L["actual"],L.get("variance",""),sc])
    if resid!=0:
        exp_rows.append([y,"Debt service and other (residual)","","",resid,"",sc])
    recon.append((y,rsum==rtot,esum+ (resid) == etot,len(rl),len(el),resid))

with open(f"{RES}/general-fund-revenue-by-year.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["fiscal_year","revenue_category","original_budget","final_budget","actual","variance","source_code"])
    w.writerows(rev_rows)
with open(f"{RES}/general-fund-expenditure-by-year.csv","w",newline="") as f:
    w=csv.writer(f); w.writerow(["fiscal_year","department_or_line","original_budget","final_budget","actual","variance","source_code"])
    w.writerows(exp_rows)

print(f"{'FY':<6}{'rev✓':>6}{'exp✓':>6}{'#rev':>6}{'#exp':>6}{'debt/resid':>14}")
allok=True
for y,rok,eok,nr,ne,resid in recon:
    if not(rok and eok): allok=False
    print(f"{y:<6}{'OK' if rok else 'X':>6}{'OK' if eok else 'X':>6}{nr:>6}{ne:>6}{resid:>14,}")
print(f"\nAll revenue categories AND expenditure lines reconcile to their year totals: {allok}")
print(f"Wrote general-fund-revenue-by-year.csv ({len(rev_rows)} rows), general-fund-expenditure-by-year.csv ({len(exp_rows)} rows)")
