---
type: research
date: 2026-09-07
---

# Tax recipient explanations and chart

The recipient view shows largest-to-smallest recipients, an all-recipient stacked bar with matching
row colors, sourced explanations on selection, and actual city names instead of “city or
town.” The presentation sorts copied allocation lines by dollars with deterministic
label/ID tie-breaks. Chart, rows, table, and CSV share that order. Stable recipient colors
and rank numbers connect the bar to the list. Small segments retain their true proportions
and have full-size row alternatives. Chart activation opens and focuses the explanation,
respecting reduced motion. Zero totals display text without invented segments. County
operations/debt and other-recipient subtotals remain visible.

Municipal labels now use **City of Greenville** and the equivalent for the other five
municipalities in the verified district table. The selected county tax record/GIS district
already joins to `district.cityName`; no new GIS request or mailing-city inference is needed.
GIS CITY is an owner's mailing city and must not supply municipal tax jurisdiction.
Municipal rows still appear only where the selected tax district has municipal millage.

## Source ledger

Descriptions in `web/src/lib/taxRecipients.ts` remain separate from rates and calculations.
Official sources checked September 7:

| Recipient | Supported explanation and source |
| --- | --- |
| County operations | Law enforcement, ambulance response, courts, and roads, supported alongside other revenue. [County budget](https://www.greenvillecounty.org/ManagementandBudget/Budget26.aspx). |
| County debt | Repayment of county borrowing and interest. [FY2026 budget, printed p.179 / PDF p.180](https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf#page=180). |
| Library | Branches, borrowing, digital materials, public computers, programs, and bookmobile. [About the Library](https://www.greenvillelibrary.org/about-us), [card services](https://www.greenvillelibrary.org/get-a-card). The [May 6, 2025 County Council agenda](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202025/County%20Council/2025.05.06/agenda.htm) identifies an annual levy for library purposes. |
| Greenville Tech | Career training, degrees, transfer courses, and workforce education. [College educational opportunities](https://catalog.gvltec.edu/student-handbook/educational-opportunities/). No allocation to a specific college expense is asserted. |
| Museum operations | Ongoing operation of the Museum of Art, whose purpose includes American art and educational/cultural programs. [County Museum Commission](https://www.greenvillecounty.org/apps/countycouncilboard/BoardDetails.aspx?id=69). The description does not say the levy buys art. |
| Museum debt | Building improvements, including heating/cooling, roofs, and building exterior. [2019 museum bond ordinance](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202019/County%20Council/2019.05.21/Museum%20GO%20Bond%20Ordinance.pdf); [FY2024 ACFR](https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2024/CompleteACFR.pdf) carries Series 2019C special-assessment debt through 2035. |
| Greenville school debt | Borrowing for sites, construction, renovation, and major equipment. [District Business Services](https://www.greenville.k12.sc.us/Departments/main.asp?titleid=fin_account). The 4% payable line excludes operating millage; the combined 6% school line explains operations and debt, supported by the [school operating budget](https://www.greenville.k12.sc.us/news/main.asp?titleid=2506budget). |
| Taylors fire | Fire protection and medical first response. [Taylors Fire Rescue](https://taylorsfirerescue.org/wp/) states sewer operations transferred to MetroConnects in July 2022. The fire levy is not described as funding sewer. Other fire districts receive a generic fire-service explanation rather than the Taylors-specific claim. |
| Arena | Greenville Arena District operates, maintains, and equips Bon Secours Wellness Arena. [County board description](https://www.greenvillecounty.org/apps/countycouncilboard/BoardDetails.aspx?id=57); [FY23 district audit](https://www.greenvillecounty.org/Council/_Agenda/Meetings%20of%202024/Finance%20Committee/2024.07.08/ArenaAudit.pdf) identifies property-tax revenue. The single Arena levy is not labeled a dedicated debt levy. |
| City of Greenville | Municipal police, fire, parks, and infrastructure. [City departments](https://www.greenvillesc.gov/departments), [operating budgets](https://www.greenvillesc.gov/2463/Annual-Operating-Budget). Other municipalities keep their correct names with a general municipal-budget explanation. |
| Greater Greenville Sanitation | Household garbage and yard-waste collection. [Residential services](https://ggsc.gov/residential/). Recycling is not asserted. |

This is recipient-purpose context, not a tracing of personal tax dollars to particular
projects. Rate citations remain attached separately. Other special-district rows retain
their existing descriptions; district-specific research beyond the above is not claimed.

## Verification

Node 22 optimized export/429 contracts,
scoped lint/TypeScript, 10 calculation tests, 15 property-tax browser tests, and all 13
baseline/extractor checks pass. Four additional rendered walkthroughs (320, 390, 768,
1440px) opened every sample recipient, verified focus and municipal identity, and passed
Axe/overflow checks. Two new browser regressions verify ordering across chart/list/table/CSV,
actual segment proportions, unique matching colors, keyboard access to the smallest segment,
4%→6% recalculation, and zero totals. Existing baseline fixtures and financial values are
unchanged.

Validation used hypothetical manual values and existing civic fixtures, not private
address/parcel records.
