#!/usr/bin/env python3
import csv
import re
from pathlib import Path

ROOT=Path('/tmp/gvl-budget-blind-extract'); TEXT=ROOT/'text'

SOURCES=[
 dict(code='FY2004-05',file='02-Approvedc_Highlights.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/Approvedc_Highlights.pdf',title='County of Greenville Operating and Capital Budget Fiscal Years 2004 and 2005 — Budget Highlights',years=[2002,2003,2004,2005],statuses=['ACTUAL','PROJECTED','BUDGET','BUDGET']),
 dict(code='FY2006-07',file='07-final_A013_highlights_pages37-58.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2006/final_A013_highlights_pages37-58.pdf',title='County of Greenville Operating and Capital Budget Fiscal Years 2006 and 2007 — Budget Highlights',years=[2006,2007]),
 dict(code='FY2008-09',file='12-budget_highlights.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/budget_highlights.pdf',title='County of Greenville Operating and Capital Budget Fiscal Years 2008 and 2009 — Budget Highlights',years=[2008,2009]),
 dict(code='FY2010-11',file='17-budget_highlights.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2010/budget_highlights.pdf',title='County of Greenville Operating and Capital Budget Fiscal Years 2010 and 2011 — Budget Highlights',years=[2010,2011]),
 dict(code='FY2012-13',file='21-budget_combined2012.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/budget_combined2012.pdf',title='County of Greenville Budget Document Fiscal Years 2012 and 2013',years=[2012,2013]),
 dict(code='FY2014-15',file='22-budget_combined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2014/budget_combined.pdf',title='County of Greenville Budget Document Fiscal Years 2014 and 2015',years=[2014,2015]),
 dict(code='FY2016-17',file='23-budget_combined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf',title='County of Greenville Budget Document Fiscal Years 2016 and 2017',years=[2016,2017]),
 dict(code='FY2018-19',file='24-BudgetCombined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf',title='County of Greenville Budget Document Fiscal Years 2018 and 2019',years=[2018,2019]),
 dict(code='FY2020-21',file='25-BudgetCombined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2019/BudgetCombined.pdf',title='County of Greenville Budget Document Fiscal Years 2020 and 2021',years=[2020,2021]),
 dict(code='FY2022-23',file='26-BudgetCombined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2022/BudgetCombined.pdf',title='County of Greenville Budget Document Fiscal Years 2022 and 2023',years=[2022,2023]),
 dict(code='FY2024-25',file='27-BudgetCombined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2024/BudgetCombined.pdf',title='County of Greenville Budget Document Fiscal Years 2024 and 2025',years=[2024,2025]),
 dict(code='FY2026',file='28-BudgetCombined.txt',url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf',title='County of Greenville Budget Document Fiscal Year 2026',years=[2026]),
]

MONEY=re.compile(r'(?<![\w.])(?:\(\s*\$?\s*\d[\d,]*\s*\)|-?\$?\s*\d[\d,]*|--)(?![\w.%])')

def val(s):
 t=s.replace('$','').replace(',','').replace(' ','').strip(); neg=t.startswith('(') and t.endswith(')'); t=t.strip('()')
 if t in ('','-','--'): return 0
 return -int(t) if neg else int(t)

def nums(line):
 return [(m.start(),m.end(),val(m.group(0))) for m in MONEY.finditer(line)]

def printed(page):
 for line in page.splitlines()[:10]+page.splitlines()[-10:]:
  m=re.search(r'^\s*(\d{1,3})\s*$',line)
  if m:return m.group(1)
  m=re.search(r'\b(\d{1,3})\s*$',line)
  if m and ('Budget' in line or 'Years' in line):return m.group(1)
 return ''

def rowbase(src,year,value,status,label,section,pageno,page,amb='',notes=''):
 return dict(fiscal_year=year,value=value,status=status,original_label=label,source_url=src['url'],document_title_version=src['title'],pdf_page=pageno,printed_page=printed(page),table_section=section,source_code=src['code'],ambiguity_flag=amb,notes=notes)

revenues=[]; financing=[]; checkpoints=[]

# Special four-column page covering FY2002-FY2005.
src=SOURCES[0]; ps=(TEXT/src['file']).read_text(errors='replace').split('\f')
pi,page=next((i,p) for i,p in enumerate(ps,1) if '2002-2005 SUMMARY OF ESTIMATED FINANCIAL SOURCES AND USES' in p)
lines=page.splitlines(); anchor_line=next(x for x in lines if 'Total Estimated Financial Sources' in x); anchors=[x[1] for x in nums(anchor_line)[:4]]
phase=''
for line in lines:
 u=line.upper().strip()
 if u=='FINANCIAL SOURCES': phase='revenue'; continue
 if u=='EXPENDITURES': phase=''; continue
 if u=='OTHER FINANCING SOURCES AND USES': phase='financing'; continue
 if u.startswith('NET INCREASE'): phase='financing'
 if not phase: continue
 ns=nums(line)
 if not ns: continue
 mapped={}
 for st,en,v in ns:
  j=min(range(4),key=lambda k:abs(en-anchors[k]))
  if abs(en-anchors[j])<=10:mapped[j]=v
 usable=[x for x in ns if any(abs(x[1]-a)<=10 for a in anchors)]
 if not usable: continue
 label=line[:min(x[0] for x in usable)].strip(); label=re.sub(r'\s+',' ',label).rstrip(' $-')
 if not label: continue
 for j,v in mapped.items():
  r=rowbase(src,src['years'][j],v,src['statuses'][j],label,'Governmental Funds: 2002-2005 Summary of Estimated Financial Sources and Uses',pi,page)
  checkpoints.append(r)
  if phase=='revenue':revenues.append(r)
  elif label.startswith(('Other Transfers','Transfers','Total Other','Net Increase','Fund Balance')):financing.append(r)

# One-page-per-year consolidated summaries, FY2006 onward.
for src in SOURCES[1:]:
 ps=(TEXT/src['file']).read_text(errors='replace').split('\f')
 for year in src['years']:
  matches=[]
  for i,p in enumerate(ps,1):
   if 'Financial Sources' in p and 'Fund Balance June 30' in p and re.search(rf'(?:FISCAL YEAR|FY)\s*{year}\b',p,re.I): matches.append((i,p))
  if not matches:
   # FY2023's numeric table is an embedded raster image. It is extracted below
   # from a 300-dpi rendering of official PDF physical page 40 (printed page 39).
   if src['code']=='FY2022-23' and year==2023: continue
   raise RuntimeError(f'consolidated page missing {src["code"]} {year}')
  pi,page=matches[0]; phase=''; pending=''
  total_line=next(x for x in page.splitlines() if 'Total Estimated Financial Sources' in x and nums(x))
  gf_anchor=nums(total_line)[0][1]
  for line in page.splitlines():
   u=line.upper().strip()
   if u=='FINANCIAL SOURCES': phase='revenue'; continue
   if u=='EXPENDITURES': phase=''; continue
   if u=='OTHER FINANCING SOURCES AND USES': phase='financing'; continue
   if u.startswith('NET INCREASE'): phase='financing'
   ns=nums(line)
   if not ns: continue
   candidates=[x for x in ns if abs(x[1]-gf_anchor)<=12]
   if not candidates: continue
   cell=min(candidates,key=lambda x:abs(x[1]-gf_anchor))
   label=line[:cell[0]].strip(); label=re.sub(r'\s+',' ',label).rstrip(' $-')
   if not label: continue
   # First numeric column in every consolidated table is General Fund.
   v=cell[2]
   status='ESTIMATED' if phase=='revenue' or label.startswith(('Fund Balance','Net Increase','Estimated Revenue','Reserved for')) else 'BUDGETED FINANCING'
   r=rowbase(src,year,v,status,label,'Consolidated Fund Summary',pi,page)
   checkpoints.append(r)
   if phase=='revenue': revenues.append(r)
   elif phase=='financing' and label.startswith(('Sale of Property','Capital Lease Issuance','Bonded Sale','Other Transfers','Transfers','Total Other','Net Increase','Fund Balance','Estimated Revenue','Reserved for')): financing.append(r)

# Visual transcription of the FY2023 embedded table. Values were read from a
# 300-dpi rendering; sums were checked against the printed General Fund totals.
src=next(s for s in SOURCES if s['code']=='FY2022-23'); ps=(TEXT/src['file']).read_text(errors='replace').split('\f'); page=ps[39]; pi=40
visnote='Visually transcribed from the embedded raster table on official PDF physical page 40 (printed page 39); General Fund component sums checked to the printed totals.'
for label,v in [
 ('Property Taxes',118806164),('County Offices/Fees',38684570),('Intergovernmental',24553808),
 ('Charges for Services',0),('Premiums',0),('Capital Projects Reserve',0),('Stormwater Fees',0),
 ('Other',8700791),('Total Estimated Financial Sources',190745333)]:
 r=rowbase(src,2023,v,'ESTIMATED',label,'Consolidated Fund Summary',pi,page,notes=visnote); checkpoints.append(r); revenues.append(r)
for label,v,status in [
 ('Sale of Property',0,'BUDGETED FINANCING'),('Capital Lease Issuance',0,'BUDGETED FINANCING'),
 ('Transfers In',14697405,'BUDGETED FINANCING'),('Transfers Out',-5002027,'BUDGETED FINANCING'),
 ('Total Other Sources (Uses)',9695378,'BUDGETED FINANCING'),
 ('Net Increase (Decrease) in Fund Balance',-8233935,'ESTIMATED'),
 ('Fund Balance July 1',73174639,'ESTIMATED'),('Reserved for Encumbrances',0,'ESTIMATED'),
 ('Fund Balance June 30',64940704,'ESTIMATED')]:
 r=rowbase(src,2023,v,status,label,'Consolidated Fund Summary',pi,page,notes=visnote); checkpoints.append(r); financing.append(r)

fields=['fiscal_year','value','status','original_label','source_url','document_title_version','pdf_page','printed_page','table_section','source_code','ambiguity_flag','notes']
def write(name,rows):
 with (ROOT/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(sorted(rows,key=lambda r:(r['fiscal_year'],r['pdf_page'],r['original_label'])))
write('checkpoints/checkpoint-02-consolidated-general-fund-rows.csv',checkpoints)
write('general-fund-broad-revenues.csv',revenues)
write('general-fund-balances-and-financing.csv',financing)
print(f'checkpoint={len(checkpoints)} revenues={len(revenues)} financing={len(financing)}')
