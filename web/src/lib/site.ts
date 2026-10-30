/**
 * The site's public origin, used by the sitemap and by canonical/OG URLs.
 *
 * The owner chose this public host for launch. Keeping it in source, instead of requiring
 * a build environment variable, makes canonical URLs and the static sitemap correct in
 * local production builds as well as the Vercel deployment.
 */
export const SITE_URL = "https://gcdata.alexreynolds.com";

/** The public repository: source code, compiled data, pipeline and tests. */
export const REPO_URL = "https://github.com/asreynolds1000/greenville-county-budget";

/** Vercel marks production builds; previews and local exports must ask crawlers not to index. */
export const IS_PRODUCTION_DEPLOYMENT = process.env.VERCEL_ENV === "production";
