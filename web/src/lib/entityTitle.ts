/**
 * The document title for an entity page, in one place because two renderers now produce it.
 *
 * Before commit a5f4045 each fiscal year had its own route, so Next's `generateMetadata`
 * could put the year in the title and be done. The consolidated route server-renders the
 * latest year and the reader chooses another after hydration, so the title has to follow the
 * selection in the browser as well. Both paths compose it here: a page whose figures say
 * FY2014 and whose title says only "General Fund" is wrong in the tab, wrong in a bookmark,
 * wrong in history and wrong in a search result.
 *
 * Client-safe on purpose — no loaders, no `node:fs` — because the year explorer is a client
 * component and must be able to import it.
 */
export const SITE_TITLE = "Greenville County Budget Explorer";
export const SHORT_SITE_TITLE = "Budget Explorer";

/**
 * Nine General Fund operating-overview categories share a name with a department-view
 * operating category (both are "Public Works", for example). The qualifier keeps their
 * titles distinct in search results and browser history.
 */
export function entityTitleName(entityId: string, name: string): string {
  return entityId.startsWith("overview.gf.") ? `${name} (operating overview)` : name;
}

/** Kinds whose pages describe spending, so the title says "budget". Every other kind is a
 * revenue, balance, financing or change page, where "budget" would mislabel it. */
const SPENDING_KINDS = new Set(["fund", "dept", "opcat", "overview", "isf", "use", "gf", "budget"]);

const COUNTY = "Greenville County";

/**
 * What `generateMetadata` returns. Written for a search result: it leads with the place,
 * and says "budget" only on pages about spending. `entityId` decides the kind (the part
 * before the first dot).
 */
export function entityTitle(entityId: string, name: string, year: number): string {
  const kind = entityId.split(".")[0];
  const full = entityTitleName(entityId, name);
  const place = full.startsWith(COUNTY) ? full : `${COUNTY} ${full}`;
  const body = SPENDING_KINDS.has(kind) && !/budget$/i.test(full) ? `${place} budget` : place;
  return `${body}, FY${year}`;
}

/** The whole `document.title`, for the server (absolute) and the client-side update. */
export function entityDocumentTitle(entityId: string, name: string, year: number): string {
  return `${entityTitle(entityId, name, year)} · ${SHORT_SITE_TITLE}`;
}
