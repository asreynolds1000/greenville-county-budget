/** Citable year selection within an entity's single exported page. */
export function entityYearHref(entityId: string, year: number): string {
  return `/e/${encodeURIComponent(entityId)}/?fy=${year}`;
}

/** Never silently present the latest year's figures for an invalid explicit year. */
export function selectEntityYear(search: string, years: readonly number[]): number | null {
  const values = new URLSearchParams(search).getAll("fy");
  if (values.length === 0) return years.length ? Math.max(...years) : null;
  if (values.length !== 1 || !/^\d{4}$/.test(values[0])) return null;
  const year = Number(values[0]);
  return years.includes(year) ? year : null;
}
