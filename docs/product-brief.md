# Product brief

This brief says what the Budget Explorer is for and the editorial rules every page, note and
contribution follows. Where it and
[`sources-funds-uses-architecture-spec.md`](sources-funds-uses-architecture-spec.md) differ on
accounting meaning, the specification governs.

## Purpose

Help residents understand how Greenville County raises, restricts, allocates and spends money
over time, without telling them what conclusions to draw.

The site should make questions like these easy to answer:

- How much is budgeted for the Sheriff's Office, and how has that changed?
- How much is budgeted for parks, the Historic and Natural Resources Trust, transit, debt
  service, reserves and roads?
- How are roads funded when several revenue streams contribute?
- How much of a property-tax bill funds county government, and how much does the county
  collect for other taxing entities?
- Where did the county spend more or less than it budgeted?

## Editorial stance

The site is non-opinionated. It provides amounts, definitions, comparisons, history and
sources. It does not label spending as excessive, inadequate, wasteful or virtuous, and it
does not reach a conclusion about any funding level, tax policy or public decision.

Neutrality requires consistent denominators and comparison rules. The site may state
mathematical facts, such as a percentage increase or a changing share of the budget. It does
not turn those facts into judgments.

These rules apply to every page, note, download and pull request:

- **State how a quantity is measured, then stop.** A sentence that explains why a number is
  good or bad is an argument, and it does not belong here.
- **A budget difference is a question to explain, not a judgment.** Spending above budget and
  spending below budget are both described the same way. Neither is presented as a failure or
  a success.
- **Fund balance is a position, not savings.** Words such as "savings" invite a bank-account
  reading that county accounting does not support.
- **Silence is not neutral.** When the site does not cover something, it says so and says
  where coverage stops. "Not found here" must never read as "not done" or "hidden".
- **Never mix statuses.** Proposed, adopted, amended, projected, unaudited actual and audited
  actual values carry visible labels and are never blended into one series.
- **Never imply that restricted money can be freely moved.**
- **Separate county government** from the City of Greenville, school districts, fire and
  special-purpose districts, and state-controlled services.
- **Every chart has a table and a download behind it,** and every figure cites its document
  and printed page.

## Primary interaction

The main experience begins with one selected fiscal year: where money comes from, where the
county accounts for it, and where it goes. Money in, fund position and money out are peers.

1. The homepage shows the General Fund as a river: sources on one side, the fund in the
   middle, uses on the other. A four-fund view shows the county budget at the coverage each
   fund supports.
2. Selecting any supported line shows its exact amount, history, status, relationships and
   original source.
3. A fiscal-year control changes the statement and keeps comparable history, without treating
   missing coverage as zero.
4. An optional "Follow a tax dollar" walkthrough introduces tax recipients, pooled county
   funding, familiar services and change over time. Every page must also make sense to a
   reader who arrives directly.

Plain-language labels lead; formal accounting terms stay available in definitions and in
source-faithful detail.

The whole-budget total states whether internal-service funds are included, and the interface
never double counts reimbursements or presents internal-service activity as additional
external spending.

## Spending and funding are connected but different

Spending can usually be browsed as a hierarchy:

`all funds → fund → department/program → budget line`

Funding is often many-to-many. A service such as roads may draw on fees, property taxes,
FILOT-related revenue, transfers or other restricted sources. A funding view shows the
verified revenue streams for a fund or service without implying that every dollar can be
traced one-to-one.

## Workforce information

When public records support it, department and position pages should distinguish authorized
positions or FTEs, actual headcount, starting salary and salary range, actual pay or total
compensation, personnel appropriations, total department appropriations, and budget per
authorized FTE.

"Budget per employee" is an organizational measure, not employee compensation. It can
include buildings, vehicles, equipment, contracts and other operating costs. Comparisons place
salary against salary and total compensation against total compensation.

This is not built yet; see `ROADMAP.md`.

## Property-tax estimate

A resident can enter an address or tax-map/PIN number. The site fills the parcel's district
and 2025 values from county GIS and the county's 2025 property record, and estimates how the
bill divides among taxing entities using published 2025 millage. Unknown fields stay editable,
and manual entry is always available.

The estimate separates amounts that fund Greenville County operations from amounts the
county collects for schools and other taxing entities. Those entities appear only to explain
the bill; their own budgets are outside this project. Recipient amounts are estimates, not
imported bill line items.

## Search and exploration

Residents can search all published funds, departments, programs, budget lines and
common-language synonyms. Each result shows, when verified data supports it: the amount, its
share of its parent and of the whole budget, a plain-language description, its fund and
organizational path, its revenue sources and restrictions, staffing, history, related items
and the original source.

## Constraints

- Accuracy and durable data structure take priority over speed.
- Every published number must be reproducible from an original source.
- Every visual has a keyboard-accessible, screen-reader-usable table equivalent.
- Mobile layouts preserve context without requiring animation.
