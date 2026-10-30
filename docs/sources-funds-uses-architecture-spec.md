---
type: document
date: 2026-07-20
status: active
---

> **About this document.** This is the July 2026 design record. Its accounting rules govern the
> site today. Its implementation steps are history: the plans and reviews it mentions were
> internal working documents and are not published here.

> September 7, 2026 decision: the earlier deferral of a large flow visualization is
> superseded by the requested river/tributary UI. The accounting rules still apply. The
> implementation joins sources and uses only at a fund, keeps savings and transfers
> distinct, and shows four-fund spending without inventing a consolidated inflow side.

# Sources, funds, positions, and uses architecture specification

## Authority and purpose

This document re-baselines the Greenville County Budget Explorer around the
clarified product concept:

> Let a resident see how money comes into the county, the sources it comes
> from, the accounting containers and balances in which it is held, how it
> leaves the county, and how any supported source, balance, or use changes over
> time.

This specification is the implementation handoff for that architecture. Where
it conflicts with the earlier vertical-slice plan, this document wins. The prior
plan remains useful for its static-export decisions, provenance requirements,
year-specific URLs, accessibility contract, deterministic data generation,
and historical-series rules. Its spending-hierarchy-first product topology and
Steps 5–10 are superseded.

The next implementer must not continue the old numbered vertical-slice steps
without first completing the re-baselining work defined here.

## Implementation status — 2026-07-20

Steps 0–5 are complete:

- the prior slice is frozen and the documentation is re-baselined;
- every current entity has controlled accounting semantics;
- all 156 year-scoped legacy hierarchy edges are losslessly mirrored into the
  generalized relationship model, alongside 27 General Fund domain relationships;
- all 150 General Fund balance/financing observations are mapped;
- Total Operating Budget and Interfund Transfers are mapped so the outflow
  statement closes;
- all 307 General Fund operating-overview observations are mapped as a separate
  broad-category statement, without adding them to the department hierarchy;
- the Property Management and Animal Care parent periods follow the printed
  department sections without overlap;
- 111 year-specific General Fund position, financing, budget-source, outflow,
  and operating-overview statement instances reconcile; and
- export contract v2 publishes all entities and status classes, accounting
  semantics, relationships, resolved statement instances, scope coverage, and
  CSV downloads without changing the legacy v1 paths; and
- the General Fund application page now presents the year as beginning fund
  balance + money in − money out = ending fund balance. Money-in and money-out
  remain peer detail domains, while the planned deficit is shown as the derived
  draw on fund balance rather than as an inflow. The page retains full-loop year
  navigation, source-linked statement lines, historical entity pages,
  reconciliation context, explicit coverage, and downloadable records.

Current production counts: 2,542 observations, 2,443 canonical values, 171
entities, 203 relationships, 41 resolved alternatives, zero disputes, and 8
unmapped retained conflict observations. The next implementation step is Step 6,
the county overview under incomplete coverage, after maintainer review of the General
Fund experience.

## Executive decision

The application is a sources-and-uses explorer organized around funds. A fund
is the hinge between money coming in and money going out. The spending
hierarchy is one projection of this model, not the product's primary data
model.

The canonical experience is:

```text
MONEY IN                     WHERE IT SITS                    MONEY OUT

Revenue sources  ────────▶   Fund / fund group  ─────────▶   Uses
Financing sources ───────▶   Beginning balance  ─────────▶   Transfers out
Transfers in      ───────▶   Ending balance                 Departments
Planned balance use                                        Programs / lines

             Fiscal year, status, restrictions, and provenance
             apply to every value and every relationship.
```

The product must support movement in both directions:

- from a source to every fund it is documented as supporting;
- from a fund to its sources, balance position, and uses;
- from a use back to its fund and any documented funding relationships; and
- from any source, fund, position, or use into its comparable historical
  series.

The product must never imply one-to-one tracing when the public record supports
only a fund-level association.

## Approved product decisions — 2026-07-20

The following decisions are approved and no longer require an implementation
agent to reopen them:

1. Open with a guided picture of one selected fiscal year: where money comes
   from, where it is accounted for, and where it goes. Exploration follows the
   explanation rather than replacing it.
2. Complete the General Fund loop first. Show other major funds at a truthful
   summary level until equivalent source-backed detail exists.
3. Present beginning position, adjustments, transfers, and ending position
   inside the relevant fund story. A countywide position overview may link to
   those stories but must not describe fund balance as cash in an account.
4. Give every supported revenue source, transfer, position measure, operating
   category, and department a comparable history and source trail.
5. Lead with plain-language labels. Preserve formal accounting terms in
   definitions, methodology, and source-faithful detail rather than using them
   as the primary navigation vocabulary.
6. Preserve the current civic/editorial visual character only where it improves
   trust and comprehension. The visual system and transitions may change when a
   more fluid explanation makes the accounting cycle easier to understand.

Maintainer review of the first General Fund slice added these requirements:

7. Keep Money In → Position → Money Out as the core explanatory sequence.
8. Give aggregate lines an immediate preview of what they contain so a resident
   knows why to open Operating Budget, Transfers, Other Revenue, or another total.
9. Visualize transfers as fund-boundary movements. Do not draw a circular loop
   between Transfers In and Transfers Out unless a source traces the same money;
   named-but-unallocated source associations must remain visually distinct from
   exact destination amounts.
10. Explain Net Change as money in minus money out and show how it connects the
    beginning and ending fund positions.

## Product promise

A resident should be able to answer four questions without understanding county
accounting in advance:

1. Where does the county say this money comes from?
2. Which fund receives, restricts, or accounts for it?
3. What is budgeted to leave that fund, and for what purpose?
4. How has this particular source, balance, transfer, category, department, or
   line changed over the available years?

The first release does not need complete answers for every fund. It must show
coverage honestly and must prove the full loop for at least the General Fund.

## Success criteria

The revised architecture succeeds when all of the following are true:

- Money-in, position, and money-out are peer domains in the data model and app.
- A fund page exposes all three domains for the selected year.
- A resident can open any published node and see its value, accounting role,
  status, history, restrictions, relationships, and source.
- The app distinguishes annual flows from point-in-time balances.
- The app distinguishes revenue from financing sources and expenses from
  financing uses.
- Transfers are visible and cannot silently double count the countywide total.
- Funding associations that lack a defensible dollar allocation are labeled as
  associations and never rendered as proportional flows.
- Missing coverage is explicit at the fund, domain, year, and entity levels.
- Historical views never turn absence into zero or silently stitch across an
  organizational break.
- The General Fund FY2026 reference equations in this specification reconcile
  exactly.

## Non-goals for the architecture slice

The following remain later data tracks and must not be invented to make the
interface appear complete:

- comprehensive revenue detail for Special Revenue, Debt Service, Enterprise,
  and Internal Service funds;
- audited actual-spending series;
- payroll, compensation, authorized FTE, or headcount data;
- millage, tax-district, parcel, or tax-bill calculation;
- cash and investment holdings unless an authoritative source is separately
  acquired and distinguished from fund balance;
- project-level roads funding relationships not stated by an authoritative
  source;
- a claim that a fungible revenue dollar paid for a particular department;
- FY2027 adopted values until the consolidated final primary source is acquired and passed
  through the production pipeline (Council adopted FY2027 on 2026-06-16, but the posted
  source package still requires an amendment bridge); and
- a large Sankey or animated flow visualization. The model must support the
  relationships before any particular chart is selected.

## Accounting semantics that the application must preserve

### Flows, stocks, and containers

The app must not use “money stored” as though all relevant values describe a
bank account.

| Concept | Meaning | Time semantics |
|---|---|---|
| Revenue | Taxes, fees, charges, aid, and other inflows classified as revenue | Flow during a fiscal year |
| Financing source | Transfers in, debt proceeds, or other non-revenue support | Flow during a fiscal year |
| Fund | A legal/accounting container with its own rules and reporting boundary | Persistent entity |
| Beginning fund balance | Reported balance at the start of the fiscal year | Point-in-time stock |
| Ending fund balance | Reported or estimated balance at the end of the fiscal year | Point-in-time stock |
| Net change in fund balance | Increase or decrease connecting beginning and ending position | Flow/reconciliation during a fiscal year |
| Expenditure/use | An appropriation or expense assigned to a function, organization, program, or line | Flow during a fiscal year |
| Financing use | Transfers out and other non-expense uses | Flow during a fiscal year |
| Cash/investments | Liquid assets reported under an accounting basis that may differ from fund balance | Point-in-time stock; out of scope until sourced |

Fund balance must not be labeled “cash,” “cash on hand,” or “money in the bank.”
A planned decrease in fund balance may be described as a planned use of prior
resources only when the source statement supports that interpretation.

### Status semantics

Every displayed number retains its source status: actual, adopted, estimated,
projected, proposed, or financing.

Values with different statuses must not be blended into one unlabeled series or
presented as measurements of the same thing. An official sources-and-uses
statement may, however, deliberately reconcile estimated revenue, budgeted
financing, and adopted uses. Such an equation is allowed only when:

1. the official source presents those roles in the same fiscal-year statement;
2. every leg remains visibly labeled with its own status and accounting role;
3. the pipeline validates the source's printed equation; and
4. the interface does not convert the mixed-role equation into a same-status
   historical trend.

### Traceability levels

Every cross-domain relationship must have one of these values:

| Level | Meaning | Permitted presentation |
|---|---|---|
| `exact` | The source states a dollar amount between named endpoints | May be sized by amount and included in a validated equation |
| `documented_association` | The source states that a source supports a fund/use but not an allocable amount | May be linked and described; never sized as a dollar flow |
| `structural` | The relationship is an accounting or organizational containment | May be browsed as hierarchy; no flow claim |
| `editorial_related` | A curated cross-link helps residents navigate related concepts | “Related” link only; never presented as accounting causation |

No agent may infer an `exact` relationship from matching totals, proximity in a
table, a plausible policy story, or arithmetic convenience.

## Current-state findings that govern the migration

At the start of this re-baseline, the production database contained 134 visible
entities and 154 edges.
All 153 additive edges are `contains`; one General Fund link is `detail_view`.
There are no implemented funding or transfer relationships.

Current mapped coverage:

- 25 years of the county-reported total and major fund groups;
- 14 fund entities and 5 Internal Service program components;
- 83 General Fund department entities and 16 operating categories;
- 8 General Fund revenue categories plus a revenue total;
- adopted department/category detail primarily FY2004–FY2026; and
- historical series, citations, alternatives, and reconciliation metadata.

Material retained but not exposed at that baseline:

- `general-fund-balances-and-financing`: 150 observations, zero mapped;
- `general-fund-operating-categories-and-transfers`: 307 observations, only 25
  total rows mapped; and
- 432 observations in those two parallel General Fund statements remain
  unmapped; 458 observations are unmapped overall when retained alternate-source
  conflict rows are included.

Material still missing:

- money-in detail for Special Revenue, Debt Service, and Enterprise funds;
- detailed uses below the current department/category surface for many funds;
- exact many-to-many funding relationships; and
- the later data tracks listed under non-goals.

The migration must expose present gaps rather than using the whole-budget fund
totals as a substitute for unknown inflows, positions, or uses.

## Canonical domain model

### Entity roles

Continue to use stable `entity_id` values, source observations, label maps, and
canonical values. Expand the controlled `entity_type` vocabulary so the app can
reason about accounting role without hard-coded IDs.

Required types:

| Entity type | Domain | Examples |
|---|---|---|
| `whole_budget` | scope | County-reported total budget |
| `fund_group` | container | General Fund, Special Revenue, Debt Service, Enterprise |
| `fund` | container | Road Program, E911, Hospitality Tax |
| `revenue_total` | inflow | Total Estimated Financial Sources |
| `revenue_source` | inflow | Property Taxes, Intergovernmental, County Offices/Fees |
| `financing_source` | inflow | Transfers In, debt proceeds when later sourced |
| `balance_beginning` | position | Fund Balance July 1 |
| `balance_ending` | position | Fund Balance June 30 |
| `balance_change` | position reconciliation | Net Increase (Decrease) in Fund Balance |
| `balance_adjustment` | position reconciliation | Revenue replacement or encumbrance adjustment printed between beginning and ending balance |
| `use_total` | outflow | Total General Fund Budget, Total Operating Budget |
| `operating_category` | outflow | Law Enforcement, Public Safety |
| `department` | outflow | Sheriff, Animal Care Services |
| `program` | outflow | Named fund/program detail where supported |
| `expense_line` | outflow | Future source-backed expense line |
| `financing_use` | outflow | Transfers Out, other financing uses |
| `financing_net` | financing reconciliation | Net transfers or Total Other Sources (Uses) |

Naming note: existing IDs do not need gratuitous churn. For example,
`fund.general` may retain its ID while its type changes from `fund_type` to
`fund_group` if that distinction is adopted. Provide an explicit migration map
and preserve redirects/canonical links if any ID does change.

### Accounting role

Add a required controlled `accounting_role` to every entity. Do not force the
frontend to infer role from an ID prefix.

Allowed initial roles:

- `scope_total`
- `container`
- `revenue`
- `financing_in`
- `beginning_position`
- `ending_position`
- `net_position_change`
- `position_adjustment`
- `operating_use`
- `financing_out`
- `net_financing`
- `informational_total`

Also add:

- `value_semantics`: `flow`, `stock`, or `derived_change`;
- `normal_sign`: `positive`, `negative`, or `source_signed`; and
- `included_in_scope_total`: `yes`, `no`, or `context_only`.

These may begin as columns in `entity.csv` and `entity`; if a separate controlled
dimension is chosen, it must remain git-diffable and human-reviewable.

### Relationship model

Replace the assumption that every useful relationship is a tree edge. Either
generalize `hierarchy_edge` to `entity_relationship` or introduce a parallel
table and migrate consumers deliberately. The resulting model must contain:

```text
relationship_id
from_entity_id
to_entity_id
relationship_type
traceability_level
effective_from_fy
effective_to_fy
restriction_note
relationship_note
source_code (nullable only for structural/editorial relationships)
```

Required relationship types:

- `contains` — additive hierarchy when explicitly marked additive;
- `detail_view` — related decomposition that is not safely additive;
- `inflow_to` — revenue or financing source enters a fund;
- `position_of` — beginning, ending, or change line belongs to a fund;
- `outflow_from` — use or financing use belongs to a fund;
- `transfer_to` — known movement between named funds;
- `supports` — documented many-to-many funding association;
- `related_to` — editorial navigation without accounting causation.

Add `is_additive` as an explicit boolean. Rollup code may traverse only active
`contains` edges with `is_additive=true`, compatible measure semantics, and a
valid status rule. `detail_view`, `inflow_to`, `outflow_from`, `position_of`,
`supports`, and `related_to` must never enter hierarchy arithmetic.

If a relationship itself has a published amount, add a canonical
relationship-value layer analogous to `canonical_value`, or represent the flow
as a stable flow entity linked to both endpoints. Do not place a raw amount on
the relationship dimension without observation identity, status, source, and
alternative preservation.

### Statement model

Add a statement definition layer so source-backed accounting equations are
data, not frontend arithmetic.

Suggested git-tracked table:

```text
statement_id
canonical_name
scope_entity_id
statement_type
effective_from_fy
effective_to_fy
statement_note
```

Suggested statement-member table:

```text
statement_id
entity_id
member_role
display_order
arithmetic_sign
subtotal_group
```

Initial `statement_type` values:

- `sources_and_uses`
- `position_reconciliation`
- `outflow_reconciliation`

The statement validator must read member values with their original status
classes and validate only the equations declared for that statement and year.
It must not create a general license to add unlike statuses elsewhere.

### Coverage model

Replace year-only coverage with a scope-aware coverage contract:

```text
scope_entity_id
domain                 # inflow | position | outflow | relationship
fiscal_year
coverage_level         # complete | partial | total_only | unavailable
status_classes
gap_note
source_code
```

Coverage must answer, for example:

- General Fund / inflow / FY2026: complete at published broad-category level;
- General Fund / position / FY2026: available after mapping and validation;
- Special Revenue / inflow / FY2026: unavailable or total-only, pending source
  extraction; and
- Sheriff / outflow / FY2018–FY2021: entity-level structural gap with a related
  operating-category concept, not zero.

## General Fund FY2026 reference fixture

The first architecture slice must encode and validate this complete cycle from
the official FY2026 Consolidated Fund Summary and expenditure overview.

### Sources to adopted budget

```text
Estimated financial sources                         $247,676,869
+ Transfers in                                       21,414,993
+ Planned decrease in fund balance                    6,049,272
= Total General Fund Budget                         $275,141,134
```

The planned balance use is derived for explanation from the source-backed net
change of `-$6,049,272`; the stored canonical value remains signed and retains
the printed label `Net Increase (Decrease) in Fund Balance`.

> **This fixture is a SOURCE-PRINTED STATEMENT, not a presentation instruction.**
> Added 2026-07-22 after the county overview was found rendering it literally.
>
> The county prints this reconciliation, and the pipeline validates it — that is what
> "non-negotiable" means here. It does **not** license an interface to show a planned
> fund-balance draw as part of "total money in". A draw is a change in what the fund
> HOLDS, caused by money out exceeding money in; presenting it as an inflow makes a
> decision to spend savings read as income.
>
> The interface rule is constraint 1 of the July 2026 interface plan, and
> at the presentation layer it wins. Money in is revenue plus transfers; the draw is named
> separately in the position region and added back only to explain spending authority.
> `web/src/app/page.tsx` implements the reconciliation of the two.

### Uses

```text
Total Operating Budget                             $266,639,088
+ Transfers out                                       8,502,046
= Total General Fund Budget                         $275,141,134
```

The source-backed `Transfers Out` canonical value is `-$8,502,046`. The uses
statement displays its magnitude as a positive use and assigns the member the
appropriate `arithmetic_sign`; it must not rewrite the signed canonical value.

### Position reconciliation

```text
Fund Balance July 1                                 $81,545,344
+ Net Increase (Decrease) in Fund Balance            -6,049,272
= Fund Balance June 30                              $75,496,072
```

### Net financing reconciliation

```text
Transfers in                                        $21,414,993
+ Transfers out                                      -8,502,046
= Total Other Sources (Uses)                        $12,912,947
```

Required caveats:

- financial sources and balances are printed as `ESTIMATED`;
- transfers are printed as `BUDGETED FINANCING`;
- operating uses and the total budget are printed as `ADOPTED BUDGET`;
- the app may explain their source-backed reconciliation but must keep those
  labels visible; and
- the source table's scope must be verified against the original page before
  final entity naming. Do not trust the extraction filename alone.

These equations are non-negotiable automated tests. A mapping or sign error
must fail the pipeline.

## Historical model

Time is a dimension of every domain, not a feature added only to department
pages.

### Comparable series

Each entity page may contain multiple series groups, keyed by:

```text
measure_type + accounting_role + status_class + comparability_group
```

The exporter must stop assigning every entity exactly one implicit
`primary_status_class`. A page may legitimately need:

- an estimated revenue series;
- an adopted-use series;
- an actual or projected source value shown separately;
- beginning and ending position series; or
- financing values with positive and negative signs.

The app may select a default series for presentation, but the data contract
must preserve the complete set and its status distinctions.

### Gaps and breaks

Retain and generalize the current rules:

- absent is not zero;
- a numeric printed zero is a real value;
- a printed dash may be represented as zero only when the source statement reconciles with
  that treatment; its original `printed_form` must survive observation, canonicalisation,
  JSON, CSV, and rendering, and every rendered dash-derived zero receives the visible,
  printable source-form mark required by `note.printed-dash`;
- a status change does not silently continue one line;
- entity renames and parent changes remain visible;
- structurally related entities may receive `related_to` links but are not
  automatically stitched into one series; and
- no interpolation is permitted.

### Historical relationships

Relationships are year-scoped. Selecting FY2014 must produce the FY2014
sources, fund structure, balance statement, and uses—not today's relationships
painted onto historical numbers.

## Application information architecture

This specification intentionally governs topology rather than detailed mobile
or desktop layout.

### 1. County overview

The default year presents three peer regions:

1. Money in
2. Funds and positions
3. Money out

The overview must make coverage boundaries visible. Until other-fund revenue is
extracted, it must not imply that General Fund revenue explains the entire
countywide budget. The whole-budget page may show fund totals while labeling
unknown inflow or position detail by fund.

### 2. Fund page — the core experience

Every fund or fund-group page contains:

- selected-year total and status;
- plain-language purpose and restriction notes;
- money-in statement;
- beginning/ending position and net change where available;
- money-out statement;
- transfers and documented funding relationships;
- coverage notes;
- comparable historical series for each supported line; and
- sources, tables, and downloads.

The General Fund page is the first complete implementation.

### 3. Entity page

Every revenue source, balance line, financing line, category, department,
program, or expense line uses one generic conceptual contract:

- What is it?
- What is its value this year?
- Is it a flow, stock, or derived change?
- What is its source status?
- Which fund or statement does it belong to?
- What contains it or what does it connect to?
- What restrictions or cautions apply?
- How has the comparable value changed over time?
- Where did this value come from?

**Route-model amendment, 2026-09-11:** one static document and canonical URL per
entity, `/e/[entityId]/`; covered historical years use `?fy=YYYY`. Initial HTML
shows the latest year, and JavaScript selects historical detail. Legacy
`/e/[entityId]/[fy]/` paths contain compatibility documents directing readers to
the query URL, not separate accounting renders. Ordinary entities retain their
server-rendered full history ledger. Fund renderer code splitting is independent
of payload deferral: the existing fund-model transport defers history only when
its incremental gzip weight exceeds 4 KiB, with revision validation on fetch.
The five fund pages disclose the JavaScript requirement and offer CSV/site-wide
downloads without claiming that a full ledger is rendered below. This amendment
supersedes the former per-year first-paint and canonical-metadata requirement.

### 4. Search and browse

Search spans all entity roles, not just spending entities. A result identifies
its domain (`Money in`, `Position`, `Money out`, `Fund`) and fund context.

Examples:

- “property tax” → General Fund revenue source;
- “reserves” → beginning/ending fund-balance concepts, with terminology note;
- “transfers” → transfers in and transfers out as distinct results;
- “deputies” → Sheriff's Office use; and
- “roads” → related funds and uses without implying one undifferentiated line.

### 5. Methodology and coverage

The methodology surface must explain:

- fund versus fund balance versus cash;
- revenue versus financing;
- adopted budget versus estimated sources;
- transfer treatment;
- exact versus associated funding relationships;
- why some fund panels are incomplete;
- historical crosswalk rules; and
- correction and reuse policy.

## App export contract v2

Preserve deterministic, git-committed JSON/CSV, static builds, Zod validation,
and the CI freshness gate. Change the shape so it describes the full domain.

The personal tax view also has a narrow runtime reader, `/api/property-record`, added
after a September 7 browser capture established the county's year-specific record route.
It does not change the budget export: it retrieves one selected PIN/year, validates the
returned identity, and exposes only supported tax fields without persistence or caching.
The deployment artifact must include this function alongside the static pages. See the
[property-tax source record](../research/property-tax-2025/README.md) for its field contract;
`npm run prepare:deploy` in `web/` packages it.

Minimum outputs:

```text
web/data/
  entities.json
  relationships.json
  statements.json
  coverage.json
  sources.json
  years.json
  pages/<entity_id>.json

web/public/downloads/
  series/<entity_id>.csv
  statements/<statement_id>-<fy>.csv
  relationships/<entity_id>-<fy>.csv
  coverage.csv
```

Each entity page bundle must include or reference:

```json
{
  "entity": {},
  "series_groups": [],
  "relationships_by_year": {},
  "statement_memberships": [],
  "coverage_by_year": {},
  "breaks": [],
  "citations": []
}
```

Required properties:

- `series_groups` preserve status and comparability rather than selecting one
  status globally;
- relationships expose type, direction, traceability, effective years, and
  notes;
- statement membership exposes accounting role, sign, order, and the validated
  statement equation;
- all dollar values remain signed integers;
- display magnitude and statement arithmetic come from accounting role plus the
  declared member sign, never by mutating the canonical value;
- null and absent retain distinct meanings;
- a relationship with `documented_association` has no implied amount; and
- generated outputs remain byte-deterministic and are never hand-edited.

The agent may version the schemas (`schema_version: 2`) and keep a temporary v1
compatibility exporter while the interface migrates. Remove compatibility only
after all new contract tests and the General Fund slice pass.

## Validation invariants

### Existing invariants to retain

- Every canonical value points to a real observation.
- Every displayed value retains source URL, source code, and physical page.
- Adopted additive rollups reconcile where the source prints a comparison
  total.
- Null never renders as zero.
- Canonical conflicts and alternatives remain auditable.
- Internal Service activity remains excluded from the county-reported total
  wherever the county excludes it.

### New invariants

- Every entity has a valid accounting role and value semantics.
- Stock entities cannot be children in an additive flow rollup.
- `supports`, `related_to`, `detail_view`, `position_of`, `inflow_to`, and
  `outflow_from` edges never enter hierarchy sums.
- An exact-valued relationship has observation-level provenance and status.
- An associated relationship cannot carry a display amount.
- Beginning position plus source-backed net change equals ending position where
  the statement declares that equation.
- Sources plus financing/balance use equal total uses where the official
  statement declares that equation.
- Operating uses plus financing uses equal total uses where declared.
- Transfers included on both sides are visibly paired and do not inflate the
  countywide external-resources total.
- Every fund/year/domain has a coverage record.
- A complete coverage claim fails if expected statement members are missing.
- A total-only or partial coverage state cannot be rendered as a complete
  breakdown.
- Cross-status statement reconciliation is allowed only through a declared,
  source-backed statement definition.

## Implementation sequence

Each step is a separately reviewable logical unit. Regenerate outputs and run
all Python/web checks after each step that changes data or the export contract.
Do not mix new source extraction with frontend polish in one commit.

### Step 0 — Re-baseline and freeze the old slice

1. Add a supersession notice to the earlier vertical-slice plan.
2. Update the project roadmap so this specification is the current next step.
3. Record current pipeline counts and v1 export fixtures in tests.
4. Preserve the existing Step 4 page as a reference; do not delete it yet.

Exit gate: documentation points unambiguously to this spec and all existing
tests pass unchanged.

### Step 1 — Add the controlled accounting vocabulary

1. Add entity accounting roles, value semantics, normal sign, and scope-total
   treatment to the git-tracked dimensions and build schema.
2. Introduce the generalized relationship model with traceability and
   additivity.
3. Migrate existing `contains` and `detail_view` edges without changing their
   current arithmetic.
4. Add statement and statement-member dimensions.
5. Add schema and validation tests before mapping new observations.

Exit gate: the existing canonical counts and rollups are unchanged; every
existing entity and edge has a valid migrated classification.

### Step 2 — Map General Fund positions and financing

1. Inspect every original source page represented by
   `general-fund-balances-and-financing.csv` and verify the statement scope.
2. Create stable entities and label maps for beginning balance, ending balance,
   net change, transfers in, transfers out, and total other sources/uses.
3. Preserve historical printed-label variants (`Transfers` versus directional
   rows) and do not infer endpoints absent from the source.
4. Create General Fund relationship and statement memberships.
5. Add all four FY2026 reference-equation tests.
6. Validate every earlier fiscal year only against equations actually supported
   by its printed statement.

Exit gate: all 150 balance/financing observations are either intentionally
mapped or individually reported with a documented reason; FY2026 reconciles
exactly.

### Step 3 — Model the two General Fund money-out views

1. Keep the department hierarchy as the detailed organizational view.
2. Map the parallel operating-overview rows as a source-backed statement rather
   than additive children of the department tree.
3. Identify totals, operating categories, and interfund transfers with explicit
   accounting roles.
4. Resolve the dual-parent Property Management/Animal Care issue against printed
   organizational evidence before declaring category coverage complete.
5. Document years where the department detail and official overview diverge.

Exit gate: no duplicate inclusion can inflate a General Fund or county total;
the two views are clearly named and their relationship is explicit.

### Step 4 — Export contract v2

1. Generate relationships, statements, scope-aware coverage, and multi-series
   entity pages.
2. Add Zod schemas before the frontend consumes the new fields.
3. Export statement and relationship CSVs.
4. Retain deterministic generation and the CI freshness gate.
5. Add fixture tests for Property Taxes, Fund Balance June 30, Transfers In,
   Transfers Out, General Fund, Law Enforcement, and Sheriff.

Exit gate: a consumer can reconstruct the FY2026 General Fund sources,
position, and uses using only committed `web/data` artifacts.

### Step 5 — General Fund end-to-end application slice

1. Replace the bare General Fund entity scaffold with the canonical fund page.
2. Present Money In, Position, and Money Out as peer sections.
3. Make every statement member navigable to its entity/year page.
4. Add historical series for at least Property Taxes, beginning/ending fund
   balance, Transfers In/Out, Law Enforcement, and Sheriff.
5. Surface status, traceability, restrictions, coverage, sources, tables, and
   downloads.
6. Do not add unsupported source-to-department flow lines.

Exit gate: a resident can traverse the full General Fund cycle and explain why
the FY2026 sources and uses reconcile without mistaking fund balance for cash.

### Step 6 — County overview under incomplete coverage

1. Rework the current “four funds, one total” page into the county overview.
2. Retain the fund-total explanation as the container layer.
3. Add money-in and money-out entry points without pretending every fund has
   detailed coverage.
4. Show explicit total-only/unavailable states for missing domains.
5. Link the General Fund as the complete exemplar.

Exit gate: no reasonable reader could mistake General Fund revenue for all
county revenue or infer full source detail for the other fund groups.

### Step 7 — Search, history, methodology, and accessibility hardening

1. Search across every accounting role with domain labels and aliases.
2. Implement the generalized year/history rules.
3. Publish the revised methodology and coverage matrix.
4. Preserve a table, download, and source affordance behind every quantitative
   figure.
5. Complete keyboard, screen-reader, reduced-motion, mobile, and print checks.

Exit gate: all publication gates relevant to the available surface pass.

### Step 8 — Additional fund data tracks

For each fund or fund group, repeat a source-first mini-cycle:

1. inventory authoritative sources;
2. define the statement scope;
3. extract without consulting provisional values;
4. compare and curate;
5. map entities and relationships;
6. validate printed equations;
7. update coverage; and
8. publish only the verified domain.

Prioritize named Special Revenue funds because restrictions and dedicated
sources make the sources–funds relationship most legible. Do not delay the
honest General Fund slice until every other fund is complete.

## Required tests and checks

### Python/data

- schema tests for every new column/table and controlled value;
- migration tests proving existing canonical values and rollups do not change;
- statement equation tests, including all FY2026 fixtures;
- sign tests for transfers and net balance changes;
- traceability/additivity tests for every relationship type;
- scope-aware coverage completeness tests;
- deterministic exporter tests; and
- source/citation presence for every published statement member.

### TypeScript/export contract

- Zod rejects unknown roles, relationships, traceability levels, and malformed
  statement members;
- multi-status series remain separate;
- signed values remain signed in data and can be displayed contextually;
- absent, null, and published zero remain distinct;
- associated relationships cannot receive proportional chart geometry; and
- year-specific bundles contain era-correct relationships.

### Browser/application

- FY2026 General Fund renders all three domains;
- every displayed fixture value matches the committed export;
- statement equations have accessible text/table equivalents;
- navigating a source, balance line, transfer, category, or department preserves
  fund and year context;
- the year control never presents absent data as zero;
- coverage gaps are visible without opening a methodology page;
- the interface never calls fund balance cash; and
- the county overview does not imply complete all-fund revenue coverage.

## Stop conditions requiring maintainer review

The implementer must stop and request a decision if any of the following occurs:

- the original source shows that a supposedly General Fund balance/financing
  statement has a different or broader scope;
- a sources-and-uses equation does not reconcile after sign and status review;
- a relationship requires inferring unnamed transfer endpoints;
- a source-to-use allocation is proposed without authoritative support;
- stable entity IDs would need broad replacement rather than a small migration;
- historical source labels require stitching two concepts into one series;
- an existing publication gate would need weakening; or
- completing a UI panel would require filling a known data gap with provisional
  data.

## Deliverables

An implementation is complete only when it leaves:

1. updated architecture and roadmap documentation;
2. git-tracked controlled dimensions for roles, relationships, statements, and
   coverage;
3. reproducible schema, ingestion, canonicalization, and validation changes;
4. deterministic v2 app exports and downloads;
5. the complete General Fund application slice;
6. methodology and coverage documentation suitable for publication;
7. automated tests for every declared accounting equation and product
   invariant; and
8. a handoff noting remaining all-fund data gaps without presenting them as
   implementation defects.

## Definition of done for the re-architecture

The re-architecture is done when the product's organizing question is no longer
“Which spending child is under this node?” but:

> For this fiscal year, what came into this fund, what position did the fund
> begin and end with, what went out, how are those facts related, and how has
> each supported line changed over time?

The spending hierarchy remains available inside that answer. It no longer
stands in for the answer.
