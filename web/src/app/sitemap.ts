import type { MetadataRoute } from "next";

import { getV2EntityIds } from "@/lib/loaders";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Every page this site serves.
 *
 * One canonical document per entity; ?fy selects a year within it. Compatibility files
 * for old year paths are intentionally omitted. There is no
 * `lastModified`: this is a static transcription whose data version changes as a whole and
 * is published on the corrections page, and a per-URL timestamp derived from the build
 * clock would be a fiction that also broke the build's byte-identical output.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["/", "/compare/", "/property-tax/", "/services/roads/", "/services/parks/", "/about/", "/methodology/", "/corrections/", "/downloads/"];
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${SITE_URL}${path}`,
  }));

  for (const entityId of getV2EntityIds()) {
    entries.push({ url: `${SITE_URL}/e/${entityId}/` });
  }
  return entries;
}
