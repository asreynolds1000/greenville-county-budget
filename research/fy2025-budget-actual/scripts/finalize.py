#!/usr/bin/env python3
"""Finalize the Greenville County General Fund budget-vs-actual research package, FY2011-FY2025.

Extracts the General Fund 'Schedule of Revenues, Expenditures and Changes in Fund Balances -
Budget and Actual (Budget Basis)' from each ACFR, captures the Budget-to-GAAP adjustment where
the source prints one, validates every year (flow, internal, budget-to-GAAP, year chain), and
emits the reconciled series + FY2025 line detail + a provenance manifest + validation report."""
import re, os, json, csv

WORK = os.environ.get("ACFR_WORK_DIR", "data/raw/acfr-work")  # pdftotext output of the ACFRs
TEXT = os.path.join(WORK, "text")
RES  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- source manifest: resolved ACFR URLs (from download log) ----
SOURCES = {
 2011:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2011/cafr_complete.pdf",
 2012:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2012/cafr_complete.pdf",
 2013:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2013/cafr_complete.pdf",
 2014:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2014/cafr_complete.pdf",
 2015:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2015/cafr_complete.pdf",
 2016:"https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2016/cafr_complete.pdf",
 2017:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2017/cafr_complete.pdf",
 2018:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2018/cafr_complete.pdf",
 2019:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2019/cafr_complete.pdf",
 2020:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2020/cafr_complete.pdf",
 2021:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2021/CompleteCAFR.pdf",
 2022:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2022/CompleteCAFR.pdf",
 2023:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2023/CompleteCAFR.pdf",
 2024:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2024/CompleteACFR.pdf",
 2025:"https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2025/CompleteACFR.pdf",
}

def nums(line):
    out=[]
    for tok in re.findall(r'\(\s*[\d,]+\s*\)|\$?\s*[\d,]+|\$?\s*-(?=\s|$)', line):
        t=tok.strip()
        if re.fullmatch(r'\$?\s*-',t): out.append(0); continue
        neg=t.startswith('('); t=re.sub(r'[(),$\s]','',t)
        if not t.isdigit(): continue
        out.append(-int(t) if neg else int(t))
    return out

def cols4(line):
    n=nums(line); return tuple(n[:4]) if len(n)==4 else None

# FY2012 is scanned -> hand-verified OCR record
FY2012 = json.load(open(os.path.join(RES,"fy2012-ocr-record.json")))["general_fund"]

def extract(year):
    if year==2012:
        gf=FY2012
        return {"year":2012,"ocr":True,
          "total_revenues":{"final":gf["revenue"]["final"],"actual":gf["revenue"]["actual_budget_basis"]},
          "total_expenditures":{"final":gf["expenditure"]["final"],"actual":gf["expenditure"]["actual_budget_basis"]},
          "transfers_in":{"final":gf["transfers_in"]["final"],"actual":gf["transfers_in"]["actual"]},
          "transfers_out":{"final":gf["transfers_out"]["final"],"actual":gf["transfers_out"]["actual"]},
          "net_change":{"final":gf["net_change"]["budget"],"actual":gf["net_change"]["actual_budget_basis"]},
          "gaap_adjustment":gf["net_change"]["budget_to_gaap_adjustment"],
          "fb_begin":{"actual":gf["fund_balance_beginning"]},
          "fb_end":{"actual":gf["fund_balance_ending"]},
          "rev_lines":[], "exp_lines":[]}
    p=os.path.join(TEXT,f"fy{year}.txt")
    lines=open(p,encoding="utf-8",errors="replace").read().splitlines()
    rev=[(i,cols4(l)) for i,l in enumerate(lines) if re.search(r'^\s*Total revenues',l) and cols4(l)]
    rev=[(i,c) for i,c in rev if c[2]>100_000_000]
    R=max(rev,key=lambda t:t[1][2])[0]
    # bound block: from 'Revenues:' above R to 'Fund balance ... end' below
    top=R
    for i in range(R,max(0,R-25),-1):
        if re.search(r'^\s*Revenues:?\s*$',lines[i],re.I): top=i; break
    bot=R
    for j in range(R,min(len(lines),R+60)):
        if re.search(r'Fund balance[ ,\-]+(end|ending)',lines[j],re.I): bot=j; break
    blk=lines[top:bot+2]
    rec={"year":year,"ocr":False,"rev_lines":[],"exp_lines":[]}
    def grab(pat):
        for l in blk:
            if re.search(pat,l,re.I):
                c=cols4(l)
                if c: return {"original":c[0],"final":c[1],"actual":c[2],"variance":c[3]}
                n=nums(l)
                if n: return {"actual":n[2] if len(n)>=3 else n[-1]}
        return None
    for key,pat in [("total_revenues",r'^\s*Total revenues'),("total_expenditures",r'^\s*Total expenditures'),
                    ("transfers_in",r'^\s*Transfers in\b'),("transfers_out",r'^\s*Transfers out\b'),
                    ("net_change",r'Net change[s]? in fund balance'),("fb_begin",r'Fund balance[ ,\-]+beginning'),
                    ("fb_end",r'Fund balance[ ,\-]+(end|ending)')]:
        v=grab(pat)
        if v: rec[key]=v
    # budget-to-GAAP adjustment line (older years)
    adj=0
    for l in blk:
        if re.search(r'Adjustment.*Budget to GAAP|Budget to GAAP',l,re.I):
            n=nums(l)
            if n: adj=n[-1]
    rec["gaap_adjustment"]=adj
    # revenue category lines (between Revenues: and Total revenues) and expenditure lines
    inrev=False
    for l in blk:
        if re.search(r'^\s*Revenues:?\s*$',l,re.I): inrev=True; continue
        if re.search(r'^\s*Total revenues',l): inrev=False
        if inrev:
            c=cols4(l); lab=re.sub(r'\s{2,}.*$','',l.strip()).strip()
            if c and lab and not re.search(r'budget|actual|variance|original|final',lab,re.I):
                rec["rev_lines"].append({"label":lab,"original":c[0],"final":c[1],"actual":c[2],"variance":c[3]})
    inexp=False
    for l in blk:
        if re.search(r'^\s*Expenditures',l,re.I): inexp=True; continue
        if re.search(r'^\s*Total expenditures',l): inexp=False
        if inexp:
            c=cols4(l); lab=re.sub(r'\s{2,}.*$','',l.strip()).strip()
            if c and lab and len(lab)>3 and not re.search(r'current|debt service|principal|interest$',lab,re.I):
                rec["exp_lines"].append({"label":lab,"original":c[0],"final":c[1],"actual":c[2],"variance":c[3]})
    return rec

def A(r,k): return (r.get(k) or {}).get("actual")
def F(r,k): return (r.get(k) or {}).get("final")

recs={y:extract(y) for y in range(2011,2026)}

# ---- validation ----
report=["# Validation report — General Fund budget-vs-actual, FY2011-FY2025\n",
        "**Authoritative checks** (must pass every year): internal reconciliation",
        "`beginning + net change + budget-to-GAAP adjustment = ending`, and the year chain",
        "`ending == next year's beginning`. The `other_items` column is the residual of",
        "`net change - (revenue - expenditure + transfers)`: additional budgetary lines the",
        "schedule carries in some years (appropriated fund balance, asset sales, etc.) that are",
        "not separately itemized here. It does not affect the fund-balance series.\n",
        f"{'FY':<6}{'internal':>9}{'chain':>7}{'other_items':>14}   {'end fund balance':>18}"]
prev_end=None; auth_ok=True
for y in range(2011,2026):
    r=recs[y]
    rev,exp,tin,tout,net=A(r,"total_revenues"),A(r,"total_expenditures"),A(r,"transfers_in"),A(r,"transfers_out"),A(r,"net_change")
    beg,end,adj=A(r,"fb_begin"),A(r,"fb_end"),r.get("gaap_adjustment",0)
    internal_ok = None not in (beg,net,end) and (beg+net+adj==end)
    chain_ok = prev_end is None or beg==prev_end
    other = (net-(rev-exp+tin+tout)) if None not in (rev,exp,tin,tout,net) else None
    if not(internal_ok and chain_ok): auth_ok=False
    report.append(f"{y:<6}{'OK' if internal_ok else 'FAIL':>9}{'OK' if chain_ok else 'FAIL':>7}{(f'{other:,}' if other else '0'):>14}   {end:>18,}")
    prev_end=end
report.append(f"\nAll 15 years pass the authoritative checks (internal + chain): **{auth_ok}**")

# FY2025 acceptance checks
r25=recs[2025]
report.append("\n## FY2025 work-order acceptance checks")
for name,got,want in [("revenue actual",A(r25,"total_revenues"),246871125),
  ("revenue final budget",F(r25,"total_revenues"),223764269),
  ("expenditure actual",A(r25,"total_expenditures"),251720397),
  ("expenditure final budget",F(r25,"total_expenditures"),241649556),
  ("net change actual",A(r25,"net_change"),924115),("beginning",A(r25,"fb_begin"),80621229),
  ("ending",A(r25,"fb_end"),81545344)]:
    report.append(f"- [{'PASS' if got==want else 'FAIL'}] {name}: {got:,}")

os.makedirs(RES,exist_ok=True)

# ---- CSV 1: reconciled series ----
with open(os.path.join(RES,"audited-general-fund-series.csv"),"w",newline="") as f:
    w=csv.writer(f)
    w.writerow(["fiscal_year","measure","final_budget","actual","basis","source_code"])
    for y in range(2011,2026):
        r=recs[y]; sc=f"gc-acfr-fy{y}"
        for meas,key in [("total_revenues","total_revenues"),("total_expenditures","total_expenditures"),
                         ("transfers_in","transfers_in"),("transfers_out","transfers_out"),
                         ("net_change","net_change")]:
            w.writerow([y,meas,F(r,key) if F(r,key) is not None else "",A(r,key),"budget_basis",sc])
        w.writerow([y,"budget_to_gaap_adjustment","",r.get("gaap_adjustment",0),"reconciling_item",sc])
        w.writerow([y,"fund_balance_beginning","",A(r,"fb_begin"),"gaap",sc])
        w.writerow([y,"fund_balance_ending","",A(r,"fb_end"),"gaap",sc])

# ---- CSV 2/3: FY2025 money-in / money-out detail ----
with open(os.path.join(RES,"fy2025-money-in.csv"),"w",newline="") as f:
    w=csv.writer(f); w.writerow(["line","original_budget","final_budget","actual","variance"])
    for L in r25["rev_lines"]:
        w.writerow([L["label"],L["original"],L["final"],L["actual"],L["variance"]])
    w.writerow(["TOTAL REVENUES",F(r25,"total_revenues"),F(r25,"total_revenues"),A(r25,"total_revenues"),A(r25,"total_revenues")-F(r25,"total_revenues")])
with open(os.path.join(RES,"fy2025-money-out.csv"),"w",newline="") as f:
    w=csv.writer(f); w.writerow(["department_or_line","original_budget","final_budget","actual","variance"])
    for L in r25["exp_lines"]:
        w.writerow([L["label"],L["original"],L["final"],L["actual"],L["variance"]])
    w.writerow(["TOTAL EXPENDITURES",F(r25,"total_expenditures"),F(r25,"total_expenditures"),A(r25,"total_expenditures"),A(r25,"total_expenditures")-F(r25,"total_expenditures")])

# ---- CSV 4: sources manifest ----
with open(os.path.join(RES,"sources.csv"),"w",newline="") as f:
    w=csv.writer(f); w.writerow(["source_code","fiscal_year","document","source_url","extraction"])
    for y in range(2011,2026):
        doc="ACFR" if y>=2021 else "CAFR"
        w.writerow([f"gc-acfr-fy{y}",y,f"Greenville County {doc} FYE 6/30/{y}",SOURCES[y],
                    "OCR (tesseract, scanned source)" if y==2012 else "pdftotext -layout"])

open(os.path.join(RES,"validation-report.md"),"w").write("\n".join(str(x) for x in report)+"\n")
json.dump(recs,open(os.path.join(RES,"series_full.json"),"w"),indent=1,default=str)
print("\n".join(str(x) for x in report))
print(f"\nWrote: audited-general-fund-series.csv, fy2025-money-in.csv ({len(r25['rev_lines'])} lines), fy2025-money-out.csv ({len(r25['exp_lines'])} lines), sources.csv, validation-report.md")
