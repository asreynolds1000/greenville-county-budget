import type { MetadataRoute } from "next";

import { IS_PRODUCTION_DEPLOYMENT, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Preview and local static exports use the production host for canonical-link verification,
 * but must not be indexed. Vercel supplies VERCEL_ENV for production deployments.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_DEPLOYMENT) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
