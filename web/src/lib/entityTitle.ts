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

/**
 * Nine General Fund operating-overview categories share a name with a department-view
 * operating category (both are "Public Works", for example). The qualifier keeps their
 * titles distinct in search results and browser history.
 */
export function entityTitleName(entityId: string, name: string): string {
  return entityId.startsWith("overview.gf.") ? `${name} (operating overview)` : name;
}

/** What `generateMetadata` returns; Next applies the site template to it. */
export function entityTitle(name: string, year: number): string {
  return `${name} — FY${year}`;
}

/** The whole `document.title`, template included, for the client-side update. */
export function entityDocumentTitle(name: string, year: number): string {
  return `${entityTitle(name, year)} · ${SITE_TITLE}`;
}
