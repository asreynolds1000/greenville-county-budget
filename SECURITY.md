# Security

The site is static apart from one small server function, `web/server/propertyRecord.mjs`,
which fetches a single 2025 property record from Greenville County's public website when a
visitor asks for a property-tax estimate. It accepts only a parcel number and a tax year, sends
no credentials, and does not log what it is asked for.

If you find a security problem, please do not open a public issue. Email a@alexreynolds.com
with a description and steps to reproduce. You should hear back within a week.
