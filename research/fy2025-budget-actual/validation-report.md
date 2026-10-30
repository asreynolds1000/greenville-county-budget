# Validation report — General Fund budget-vs-actual, FY2011-FY2025

**Authoritative checks** (must pass every year): internal reconciliation
`beginning + net change + budget-to-GAAP adjustment = ending`, and the year chain
`ending == next year's beginning`. The `other_items` column is the residual of
`net change - (revenue - expenditure + transfers)`: additional budgetary lines the
schedule carries in some years (appropriated fund balance, asset sales, etc.) that are
not separately itemized here. It does not affect the fund-balance series.

FY     internal  chain   other_items     end fund balance
2011         OK     OK             0           50,435,663
2012         OK     OK             0           52,219,067
2013         OK     OK             0           55,507,439
2014         OK     OK             0           56,882,202
2015         OK     OK             0           57,314,929
2016         OK     OK     1,486,060           55,138,777
2017         OK     OK       855,170           50,553,012
2018         OK     OK             0           52,142,675
2019         OK     OK             0           51,006,397
2020         OK     OK             0           52,388,990
2021         OK     OK             0           47,298,238
2022         OK     OK       198,102           72,802,675
2023         OK     OK     3,164,209           82,615,331
2024         OK     OK             0           80,621,229
2025         OK     OK             0           81,545,344

All 15 years pass the authoritative checks (internal + chain): **True**

## FY2025 work-order acceptance checks
- [PASS] revenue actual: 246,871,125
- [PASS] revenue final budget: 223,764,269
- [PASS] expenditure actual: 251,720,397
- [PASS] expenditure final budget: 241,649,556
- [PASS] net change actual: 924,115
- [PASS] beginning: 80,621,229
- [PASS] ending: 81,545,344

## Phase 2 reconciliation
- Revenue categories sum exactly to total revenue: all 15 years (FY2011–FY2025).
- Expenditure departments (+ labeled debt-service/other residual) sum exactly to total
  expenditure: all 15 years.
- FY2025 fund-balance classifications sum to total fund balance:
  11,187,615 + 4,919,088 + 65,438,641 = 81,545,344 [OK].
- FY2025 transfers reconcile to the budgetary schedule: out 9,644,608, in 15,417,995 [OK].
