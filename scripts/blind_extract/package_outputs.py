#!/usr/bin/env python3
import csv
from pathlib import Path
R=Path('/tmp/gvl-budget-blind-extract')
outputs=[
 'whole-budget-major-funds.csv','general-fund-operating-categories-and-transfers.csv',
 'general-fund-department-appropriations.csv','named-special-revenue-funds.csv',
 'general-fund-broad-revenues.csv','general-fund-balances-and-financing.csv',
 'official-document-conflicts.csv']
data={n:list(csv.DictReader((R/n).open())) for n in outputs}

with (R/'coverage-by-fiscal-year.csv').open('w',newline='') as f:
 fields=['fiscal_year','whole_budget_rows','general_fund_overview_rows','general_fund_department_rows','special_revenue_rows','broad_revenue_rows','balance_financing_rows','coverage_note']
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for y in range(2002,2028):
  counts={n:sum(1 for r in rows if int(r['fiscal_year'])==y) for n,rows in data.items() if n!='official-document-conflicts.csv'}
  note=''
  if y==2027: note='No FY2027 adopted budget document was listed on the official Management and Budget page as of 2026-07-17; no value extracted.'
  elif y in (2022,2023): note='Department-level General Fund appropriations table is an embedded image; broad adopted operating categories remain available from the official overview. FY2023 consolidated balances/revenues were visually transcribed from the embedded official table.'
  elif y in (2002,2003): note='Earliest online FY2004-05 book supplies these comparison columns; statuses are ACTUAL/PROJECTED/BUDGET exactly as shown by table.'
  w.writerow(dict(fiscal_year=y,whole_budget_rows=counts['whole-budget-major-funds.csv'],general_fund_overview_rows=counts['general-fund-operating-categories-and-transfers.csv'],general_fund_department_rows=counts['general-fund-department-appropriations.csv'],special_revenue_rows=counts['named-special-revenue-funds.csv'],broad_revenue_rows=counts['general-fund-broad-revenues.csv'],balance_financing_rows=counts['general-fund-balances-and-financing.csv'],coverage_note=note))

src={}
for rows in data.values():
 for r in rows:
  u=r.get('source_url','')
  if u: src[u]=(r.get('document_title_version',''),r.get('source_code',''))
landing='https://www.greenvillecounty.org/ManagementandBudget/'
with (R/'official-source-registry.csv').open('w',newline='') as f:
 fields=['source_code','document_title_version','official_url','role']
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 w.writerow(dict(source_code='INDEX',document_title_version='Greenville County Management & Budget — Operating and Capital Budget index',official_url=landing,role='Official landing page/source discovery and FY2027 availability check'))
 for u,(title,code) in sorted(src.items(),key=lambda x:(x[1][1],x[0])):
  w.writerow(dict(source_code=code,document_title_version=title,official_url=u,role='Row-level extraction source'))

for n,rows in data.items():
 assert all(r.get('source_url') and r.get('document_title_version') and r.get('pdf_page') for r in rows),n
print(' '.join(f'{n}={len(rows)}' for n,rows in data.items()))
