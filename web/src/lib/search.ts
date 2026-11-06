import type { SearchEntry } from "./schema";

/**
 * Ranked matching over the static index.
 *
 * Pure, and separated from the component, because the behaviour worth testing is the
 * RANKING, not the input handling: a query that matches thirty lines is only useful if the
 * right one is first.
 *
 * Ranking, best first:
 *   1. exact name or alias match       ("property tax" -> Property Taxes)
 *   2. name or alias starts with query ("sher" -> SHERIFF)
 *   3. name or alias contains query    ("tax" -> Hospitality Tax)
 *   4. description contains query      (the long tail, always last)
 *
 * Deliberately NOT fuzzy. A misspelling that silently lands a resident on a different
 * department is worse than a query that returns nothing, because nothing is visibly a
 * dead end and the wrong department is not.
 */
export type Ranked = { entry: SearchEntry; score: number };

const EXACT = 0;
const PREFIX = 1;
const CONTAINS = 2;
const DESCRIPTION = 3;

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Description matching is deliberately narrower than name and alias matching.
 *
 * A description is explanatory prose, so a substring there can create a convincing but false
 * result: "bus" previously opened Enterprise Fund because its description says "business-type".
 * Whole normalized words preserve useful long-tail matches without turning a fragment into a
 * subject the county did not publish.
 */
function descriptionContainsPhrase(description: string, query: string): boolean {
  const haystack = normalise(description);
  return ` ${haystack} `.includes(` ${query} `);
}

function scoreOne(entry: SearchEntry, query: string): number | null {
  const needle = normalise(query);
  if (!needle) return null;

  const names = [entry.name, ...entry.aliases].map(normalise);
  if (names.some((name) => name === needle)) return EXACT;
  if (names.some((name) => name.startsWith(needle))) return PREFIX;
  if (names.some((name) => name.includes(needle))) return CONTAINS;
  // A fund's description is a list of example services ("hospitality tax, road program,
  // parks"), so matching it would open the Special Revenue Fund for "parks" and the General
  // Fund for "roads": the false-result shape the "bus" note above describes. Funds are found
  // by name; their descriptions are not searched.
  if (entry.entity_type !== "fund_type" && descriptionContainsPhrase(entry.description, needle)) return DESCRIPTION;
  return null;
}

function isCurrentGeneralFundUse(entry: SearchEntry): boolean {
  return entry.fund_id === "fund.general"
    && entry.domain_label === "Money out"
    && entry.active_to_fy === 2027;
}

export function search(entries: SearchEntry[], query: string, limit = 40): Ranked[] {
  const prefersCurrentGeneralFundUse = normalise(query) === "public safety";
  const ranked: Ranked[] = [];
  for (const entry of entries) {
    const score = scoreOne(entry, query);
    if (score !== null) ranked.push({ entry, score });
  }
  ranked.sort(
    (a, b) => a.score - b.score
      || Number(prefersCurrentGeneralFundUse && isCurrentGeneralFundUse(b.entry))
        - Number(prefersCurrentGeneralFundUse && isCurrentGeneralFundUse(a.entry))
      || a.entry.name.localeCompare(b.entry.name)
      || a.entry.entity_id.localeCompare(b.entry.entity_id),
  );
  return ranked.slice(0, limit);
}
