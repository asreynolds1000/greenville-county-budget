import { getV2CoveredFiscalYears, getV2EntityIds, getV2EntityPage, isV2FiscalYearCovered } from "@/lib/loaders";
import { entityYearHref } from "@/lib/entityYearSelection";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g,
    char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}


type RouteParams = { entityId: string; fy: string };

export function generateStaticParams(): RouteParams[] {
  return getV2EntityIds().flatMap((entityId) =>
    getV2CoveredFiscalYears(getV2EntityPage(entityId)).map((year) => ({ entityId, fy: String(year) })),
  );
}

/**
 * Static export copies this GET body to e/<id>/<year>/index.html. A page component
 * would generate another four Flight files per legacy URL. Response redirect headers
 * are not copied by the static exporter, so use HTML with a browser redirect and fallback.
 */
export async function GET(_request: Request, { params }: { params: Promise<RouteParams> }) {
  const { entityId, fy } = await params;
  const year = Number(fy);
  if (!/^\d{4}$/.test(fy) || !isV2FiscalYearCovered(entityId, year)) {
    return new Response("Fiscal year unavailable", { status: 404 });
  }
  const href = entityYearHref(entityId, year);
  const canonical = `${SITE_URL}/e/${encodeURIComponent(entityId)}/`;
  const page = getV2EntityPage(entityId);
  const name = escapeHtml(page.display_name || page.canonical_name);
  const escapedHref = escapeHtml(href);
  const csv = `/downloads/series/${encodeURIComponent(entityId)}.csv`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name} — FY${year} | Greenville County budget</title><link rel="canonical" href="${canonical}"><script>var u=new URL(${JSON.stringify(href)},location.origin);new URLSearchParams(location.search).forEach(function(v,k){if(k!=="fy")u.searchParams.append(k,v)});u.hash=location.hash;location.replace(u.pathname+u.search+u.hash)</script><noscript><meta http-equiv="refresh" content="0;url=${escapedHref}"></noscript></head><body><p><a href="${escapedHref}">Continue to ${name} — FY${year}</a></p><p>Historical year detail requires JavaScript. Without it, the entity page shows the latest covered year. Download the <a href="${csv}" download>series CSV</a> or browse <a href="/downloads/">site-wide downloads</a>.</p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
