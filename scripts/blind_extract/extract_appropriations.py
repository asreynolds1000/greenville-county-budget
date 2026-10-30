#!/usr/bin/env python3
import csv,re
from pathlib import Path

from scripts.blind_extract.table_numbers import tokens, year_values
ROOT=Path('/tmp/gvl-budget-blind-extract'); TEXT=ROOT/'text'

S=[
 ('FY2004-05','03-Approvedd_GeneralFund1.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/Approvedd_GeneralFund1.pdf','County of Greenville Operating and Capital Budget Fiscal Years 2004 and 2005 — General Fund Part 1',[2002,2003,2004,2005],['ACTUAL','PROJECTED','APPROVED BUDGET','APPROVED BUDGET']),
 ('FY2006-07','08-final_A014_generalfund1_pages59-109.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2006/final_A014_generalfund1_pages59-109.pdf','County of Greenville Operating and Capital Budget Fiscal Years 2006 and 2007 — General Fund Part 1',[2004,2005,2006,2007],['ACTUAL','PROJECTED','APPROVED BUDGET','APPROVED BUDGET']),
 ('FY2008-09','13-general_fund_part1.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/general_fund_part1.pdf','County of Greenville Operating and Capital Budget Fiscal Years 2008 and 2009 — General Fund Part 1',[2006,2007,2008,2009],['ACTUAL','PROJECTED','BUDGET','APPROVED BUDGET']),
 ('FY2010-11','18-general_fund.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2010/general_fund.pdf','County of Greenville Operating and Capital Budget Fiscal Years 2010 and 2011 — General Fund',[2008,2009,2010,2011],['ACTUAL','PROJECTION','BUDGET','APPROVED BUDGET']),
 ('FY2012-13','21-budget_combined2012.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/budget_combined2012.pdf','County of Greenville Budget Document Fiscal Years 2012 and 2013',[2010,2011,2012,2013],['ACTUAL','PROJECTED','BUDGET','BUDGET']),
 ('FY2014-15','22-budget_combined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2014/budget_combined.pdf','County of Greenville Budget Document Fiscal Years 2014 and 2015',[2012,2013,2014,2015],['ACTUAL','ACTUAL','BUDGET','BUDGET']),
 ('FY2016-17','23-budget_combined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf','County of Greenville Budget Document Fiscal Years 2016 and 2017',[2014,2015,2016,2017],['ACTUAL','ACTUAL','BUDGET','BUDGET']),
 ('FY2018-19','24-BudgetCombined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf','County of Greenville Budget Document Fiscal Years 2018 and 2019',[2016,2017,2018,2019],['ACTUAL','ACTUAL','BUDGET','BUDGET']),
 ('FY2020-21','25-BudgetCombined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2019/BudgetCombined.pdf','County of Greenville Budget Document Fiscal Years 2020 and 2021',[2018,2019,2020,2021],['ACTUAL','ACTUAL','BUDGET','BUDGET']),
 # FY2022-23 table is an embedded image. Broad adopted categories remain in the overview output.
 ('FY2024-25','27-BudgetCombined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2024/BudgetCombined.pdf','County of Greenville Budget Document Fiscal Years 2024 and 2025',[2022,2023,2024,2025],['ACTUAL','ACTUAL (UNAUDITED)','BUDGET','BUDGET']),
 ('FY2026','28-BudgetCombined.txt','https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf','County of Greenville Budget Document Fiscal Year 2026',[2024,2025,2026],['ACTUAL','ACTUAL','BUDGET']),
]
def pp(page):
 for x in page.splitlines():
  m=re.search(r'\b(\d{1,3})\s*$',x)
  if m and (x.strip().isdigit() or 'Fiscal Year' in x or 'Fiscal Years' in x):return m.group(1)
 return ''
def norm(x):return re.sub(r'[^A-Z]','',x.upper())

allrows=[]
for code,file,url,title,years,statuses in S:
 ps=(TEXT/file).read_text(errors='replace').split('\f')
 pi,page=next((i,p) for i,p in enumerate(ps,1) if 'APPROPRIATIONS SUMMARY' in p.upper())
 # The FY2022-23 source was intentionally excluded; all listed pages are text tables.
 lines=page.splitlines(); start=next(i for i,x in enumerate(lines) if 'APPROPRIATIONS SUMMARY' in x.upper())
 year_header=next(x for x in lines[start+1:] if all(str(year) in x for year in years))
 year_positions=[year_header.index(str(year)) for year in years]
 sequence_indices=[0,1,2,4] if len(years)==4 else [0,1,2]
 complete_token_count=6 if len(years)==4 else 4
 category=''; data_seen=False
 for line in lines[start+1:]:
  if data_seen and line.strip().startswith(('Personnel Services', 'Fiscal Year')):break
  if line == year_header or any(marker in line.upper() for marker in ('$ CHANGE','% CHANGE','OVER FY')):
   continue
  ts=tokens(line)
  if not ts:
   u=line.strip()
   if u and u.upper()==u and not any(k in u for k in ['FY20','ACTUAL','PROJECT','BUDGET','$ CHANGE','% CHANGE','OVER FY']): category=re.sub(r'\s+',' ',u)
   continue
  if not category:
   continue
  label=re.sub(r'\s+',' ',line[:ts[0][0]].strip())
  if not label or norm(label) in {'FY','CHANGE','OVERBUDGET'}:continue
  values=year_values(line,year_positions,sequence_indices,complete_token_count)
  if not any(amount is not None for amount in values):
   continue
  data_seen=True
  for j,amount in enumerate(values):
   if amount is None:
    # A missing printed/text-extracted cell is not inferred from a neighboring
    # change column. Other year values on the same row remain source-usable.
    continue
   allrows.append(dict(fiscal_year=years[j],value=amount,status=statuses[j],operating_category=category,original_label=label,source_url=url,document_title_version=title,pdf_page=pi,printed_page=pp(page),table_section='General Fund Appropriations Summary',source_code=code,ambiguity_flag='',notes=''))

fields=['fiscal_year','value','status','operating_category','original_label','source_url','document_title_version','pdf_page','printed_page','table_section','source_code','ambiguity_flag','notes']
def write(name,rows):
 with (ROOT/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(sorted(rows,key=lambda r:(r['fiscal_year'],r['pdf_page'],r['operating_category'],r['original_label'])))
write('checkpoints/checkpoint-03-general-fund-appropriations-all-columns.csv',allrows)
# Keep the current book's budget columns; preserve FY2002-03 because the online series begins with the FY2004-05 book.
keep={2002:'FY2004-05',2003:'FY2004-05',2004:'FY2004-05',2005:'FY2004-05',2006:'FY2006-07',2007:'FY2006-07',2008:'FY2008-09',2009:'FY2008-09',2010:'FY2010-11',2011:'FY2010-11',2012:'FY2012-13',2013:'FY2012-13',2014:'FY2014-15',2015:'FY2014-15',2016:'FY2016-17',2017:'FY2016-17',2018:'FY2018-19',2019:'FY2018-19',2020:'FY2020-21',2021:'FY2020-21',2024:'FY2024-25',2025:'FY2024-25',2026:'FY2026'}
canon=[r for r in allrows if keep.get(r['fiscal_year'])==r['source_code']]
write('general-fund-department-appropriations.csv',canon)
print(f'all={len(allrows)} canonical={len(canon)} years={sorted(set(r["fiscal_year"] for r in canon))}')
