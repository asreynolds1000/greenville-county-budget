---
type: reference
date: 2026-09-07
---

# Calendar-year property-tax levies

This source transcription is separate from fiscal-year budget appropriations. Read
[`research/property-tax-2025/README.md`](../../research/property-tax-2025/README.md) for
source provenance, extraction validation, recipient classification and calculation limits.
`millage-2025.csv` preserves empty source cells and leading zeroes. The generated JSON
converts an empty levy cell to zero (no levy listed); unverified school component splits
remain absent. Do not use a city's name in the FIRE column to infer city boundaries.

Run `python3 -m scripts.property_tax` for this dataset alone, or the normal production
pipeline/exporter to update the full site's data version. Never edit generated web JSON
or downloads directly. Updating rates requires the new official source, checked component
splits and relief rules, row/page validation, tests and a deliberate UI tax-year update.
