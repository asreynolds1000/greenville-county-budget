#!/usr/bin/env python3
import csv
import re
from pathlib import Path

ROOT = Path('/tmp/gvl-budget-blind-extract')
TEXT = ROOT / 'text'

SOURCES = [
    dict(code='FY2004-05', file='02-Approvedc_Highlights.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/Approvedc_Highlights.pdf',
         title='County of Greenville Operating and Capital Budget Fiscal Years 2004 and 2005 — Budget Highlights',
         years=[2002, 2003, 2004, 2005], status=['BUDGET']*4),
    dict(code='FY2006-07', file='07-final_A013_highlights_pages37-58.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2006/final_A013_highlights_pages37-58.pdf',
         title='County of Greenville Operating and Capital Budget Fiscal Years 2006 and 2007 — Budget Highlights',
         years=[2004, 2005, 2006, 2007], status=['ADOPTED BUDGET','ADOPTED BUDGET','PROPOSED BUDGET','PROPOSED BUDGET']),
    dict(code='FY2008-09', file='12-budget_highlights.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2008/budget_highlights.pdf',
         title='County of Greenville Operating and Capital Budget Fiscal Years 2008 and 2009 — Budget Highlights',
         years=[2006, 2007, 2008, 2009], status=['ADOPTED BUDGET','ADOPTED BUDGET','PROPOSED BUDGET','PROPOSED BUDGET']),
    dict(code='FY2010-11', file='17-budget_highlights.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2010/budget_highlights.pdf',
         title='County of Greenville Operating and Capital Budget Fiscal Years 2010 and 2011 — Budget Highlights',
         years=[2008, 2009, 2010, 2011], status=['ADOPTED BUDGET','ADOPTED BUDGET','PROPOSED BUDGET','PROPOSED BUDGET']),
    dict(code='FY2012-13', file='21-budget_combined2012.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2012/budget_combined2012.pdf',
         title='County of Greenville Budget Document Fiscal Years 2012 and 2013',
         years=[2010, 2011, 2012, 2013], status=['ADOPTED BUDGET']*4),
    dict(code='FY2014-15', file='22-budget_combined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2014/budget_combined.pdf',
         title='County of Greenville Budget Document Fiscal Years 2014 and 2015',
         years=[2012, 2013, 2014, 2015], status=['ADOPTED BUDGET']*4),
    dict(code='FY2016-17', file='23-budget_combined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf',
         title='County of Greenville Budget Document Fiscal Years 2016 and 2017',
         years=[2014, 2015, 2016, 2017], status=['ADOPTED BUDGET']*4),
    dict(code='FY2018-19', file='24-BudgetCombined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf',
         title='County of Greenville Budget Document Fiscal Years 2018 and 2019',
         years=[2016, 2017, 2018, 2019], status=['ADOPTED BUDGET']*4),
    dict(code='FY2020-21', file='25-BudgetCombined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2019/BudgetCombined.pdf',
         title='County of Greenville Budget Document Fiscal Years 2020 and 2021',
         years=[2018, 2019, 2020, 2021], status=['ADOPTED BUDGET']*4),
    # The FY2022-23 book's expenditure-overview chart is a non-text image in the
    # official PDF. FY2022 and FY2023 are available as adopted comparison columns
    # in the next official book and are extracted there; the image limitation is
    # recorded in README.md.
    dict(code='FY2024-25', file='27-BudgetCombined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2024/BudgetCombined.pdf',
         title='County of Greenville Budget Document Fiscal Years 2024 and 2025',
         years=[2022, 2023, 2024, 2025], status=['ADOPTED BUDGET']*4),
    dict(code='FY2026', file='28-BudgetCombined.txt',
         url='https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf',
         title='County of Greenville Budget Document Fiscal Year 2026',
         years=[2024, 2025, 2026], status=['ADOPTED BUDGET']*3),
]

# Budget tables print a bare dash for an empty year.  Do not allow that dash to
# consume the spaces before the next positive cell (for example
# ``-           536,146``).  True negatives in these overview tables are
# parenthesized, so a leading minus is intentionally not part of a number.
NUM = re.compile(r'(?<![\w.])(?:\(?\$?\s*\d[\d,]*\)?|--|-)(?![\w.%])')

def pages(path):
    return path.read_text(errors='replace').split('\f')

def clean_num(raw):
    t = raw.replace('$','').replace(',','').replace(' ','').strip()
    if t in ('-', '--', ''):
        return 0
    neg = t.startswith('(') and t.endswith(')')
    t = t.strip('()')
    return -int(t) if neg else int(t)

def tokens(line):
    out=[]
    for m in NUM.finditer(line):
        raw=m.group(0)
        # avoid footnote-like single hyphens and fiscal-year fragments
        if raw.strip() == '-' and len(line.strip()) < 3:
            continue
        out.append((m.start(),m.end(),raw,clean_num(raw)))
    return out

def printed_page(page):
    lines=page.splitlines()
    for line in lines[:8]:
        m=re.search(r'\b(\d{1,3})\s*$', line)
        if m: return m.group(1)
    for line in lines[-8:]:
        m=re.search(r'^\s*(\d{1,3})\s*$', line)
        if m: return m.group(1)
    return ''

def overview_page(src):
    ps=pages(TEXT/src['file'])
    for i,p in enumerate(ps,1):
        if ('BUDGET EXPENDITURE OVERVIEW' in p or 'BUDGET O V ERV IEW' in p or 'BUDGET OVERVIEW' in p) and 'TOTAL BUDGET' in p:
            return i,p
    # Older highlights sometimes the title is spaced beyond easy matching.
    for i,p in enumerate(ps,1):
        if 'GENERAL FUND BUDGET' in p and 'TOTAL INTERNAL SERVICE FUND' in p and 'TOTAL BUDGET' in p:
            return i,p
    raise RuntimeError(f'overview not found: {src["file"]}')

def parse_source(src):
    pdf_page,p=overview_page(src)
    lines=p.splitlines()
    total_line=next(x for x in lines if 'TOTAL BUDGET' in x and len(tokens(x)) >= len(src['years']))
    tt=tokens(total_line)[-len(src['years']):]
    anchors=[x[1] for x in tt]
    section=''
    rows=[]
    for line in lines:
        u=line.upper().replace('REV ENUE','REVENUE').replace('SERV ICE','SERVICE')
        if 'GENERAL FUND BUDGET' in u: section='General Fund'
        elif 'SPECIAL REVENUE FUND' in u and not u.strip().startswith('TOTAL'): section='Special Revenue Fund'
        elif 'DEBT SERVICE FUND' in u and not u.strip().startswith('TOTAL'): section='Debt Service Fund'
        elif 'ENTERPRISE FUND' in u and not u.strip().startswith('TOTAL'): section='Enterprise Fund'
        elif 'INTERNAL SERVICE FUND' in u and not u.strip().startswith('TOTAL'): section='Internal Service Fund'
        vals=tokens(line)
        if not section or not vals: continue
        usable=[]
        for st,en,raw,val in vals:
            idx=min(range(len(anchors)),key=lambda j:abs(en-anchors[j]))
            # refuse a mapping far from every expected column (e.g. fiscal year in prose)
            if abs(en-anchors[idx]) <= 10:
                usable.append((st,en,idx,val))
        if not usable: continue
        # Strip the table cells off at the first value actually aligned to a year
        # column. This preserves digits in labels such as E-911.
        label=line[:min(x[0] for x in usable)].strip().replace('  ',' ')
        label=re.sub(r'\s+',' ',label)
        if not label or label.upper() in ('BUDGET','ADOPTED','PROPOSED') or label.upper().startswith(('FISCAL YEAR','FY20')): continue
        mapped={idx:val for st,en,idx,val in usable}
        for idx,val in mapped.items():
            row_section='Whole Budget' if label.upper()=='TOTAL BUDGET' else section
            rows.append(dict(
                fiscal_year=src['years'][idx], value=val, status=src['status'][idx],
                fund_type=row_section, original_label=label, source_url=src['url'],
                document_title_version=src['title'], pdf_page=pdf_page,
                printed_page=printed_page(p), table_section='Budget Expenditure Overview',
                source_code=src['code'], ambiguity_flag='', notes=''
            ))
    return rows

all_rows=[]
for src in SOURCES:
    all_rows.extend(parse_source(src))

fields=['fiscal_year','value','status','fund_type','original_label','source_url','document_title_version','pdf_page','printed_page','table_section','source_code','ambiguity_flag','notes']
with (ROOT/'checkpoints'/'checkpoint-01-overview-all-columns.csv').open('w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(all_rows)

# Choose one official overview per FY. The next book's comparison column is used
# for older years because it is explicitly labeled ADOPTED BUDGET; FY2002-03 have
# no later online book and retain the source's plain BUDGET label.
year_source={
    2002:'FY2004-05', 2003:'FY2004-05', 2004:'FY2006-07', 2005:'FY2006-07',
    2006:'FY2008-09', 2007:'FY2008-09', 2008:'FY2010-11', 2009:'FY2010-11',
    2010:'FY2012-13', 2011:'FY2012-13', 2012:'FY2014-15', 2013:'FY2014-15',
    2014:'FY2016-17', 2015:'FY2016-17', 2016:'FY2018-19', 2017:'FY2018-19',
    2018:'FY2020-21', 2019:'FY2020-21', 2020:'FY2020-21', 2021:'FY2020-21',
    2022:'FY2024-25', 2023:'FY2024-25', 2024:'FY2026', 2025:'FY2026', 2026:'FY2026',
}
canon=[r for r in all_rows if year_source.get(r['fiscal_year'])==r['source_code']]

def write_csv(name, rows, extra_fields=None):
    ff=fields + (extra_fields or [])
    with (ROOT/name).open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=ff,extrasaction='ignore'); w.writeheader(); w.writerows(rows)

major=[]
for r in canon:
    ul=r['original_label'].upper().replace('REV ENUE','REVENUE').replace('SERV ICE','SERVICE')
    if ul in {'TOTAL GENERAL FUND BUDGET','TOTAL SPECIAL REVENUE FUND','TOTAL DEBT SERVICE FUND','TOTAL ENTERPRISE FUND','TOTAL BUDGET','TOTAL INTERNAL SERVICE FUND'} or r['fund_type']=='Internal Service Fund':
        rr=dict(r)
        rr['included_in_reported_total_budget']='no' if r['fund_type']=='Internal Service Fund' else 'yes'
        rr['treatment_note']='Reported separately after TOTAL BUDGET; not included in the county-reported TOTAL BUDGET.' if r['fund_type']=='Internal Service Fund' else 'Included in the county-reported TOTAL BUDGET, subject to the document note about interfund-transfer omissions.'
        major.append(rr)
write_csv('whole-budget-major-funds.csv',sorted(major,key=lambda x:(x['fiscal_year'],x['fund_type'],x['original_label'])),['included_in_reported_total_budget','treatment_note'])

gf=[r for r in canon if r['fund_type']=='General Fund']
write_csv('general-fund-operating-categories-and-transfers.csv',sorted(gf,key=lambda x:(x['fiscal_year'],x['original_label'])))

sr=[r for r in canon if r['fund_type']=='Special Revenue Fund']
write_csv('named-special-revenue-funds.csv',sorted(sr,key=lambda x:(x['fiscal_year'],x['original_label'])))

# Conflicts/changes across official overview documents for the same FY and
# semantic label. Original labels remain untouched in output; normalization is
# only for grouping OCR variants such as ``SERV ICE`` and ``SERVICE``.
def conflict_label(label):
    return re.sub(r'[^A-Z0-9]', '', label.upper())

groups={}
for r in all_rows:
    groups.setdefault((r['fiscal_year'],r['fund_type'],conflict_label(r['original_label'])),[]).append(r)
conf=[]
for key,rs in groups.items():
    vals={r['value'] for r in rs}
    if len(vals)>1:
        for r in rs:
            rr=dict(r)
            rr['conflict_group']=f'{key[0]}|{key[1]}|{key[2]}'
            rr['conflict_note']='Different values appear for the same fiscal year and label in different official budget books; statuses/versions are preserved. No reconciliation was inferred.'
            conf.append(rr)
write_csv('official-document-conflicts.csv',sorted(conf,key=lambda x:(x['fiscal_year'],x['fund_type'],x['original_label'],x['source_code'])),['conflict_group','conflict_note'])

print(f'all overview rows={len(all_rows)} canonical={len(canon)} major={len(major)} gf={len(gf)} special={len(sr)} conflicts={len(conf)}')
