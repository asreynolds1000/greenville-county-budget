/**
 * The site's public origin, used by the sitemap and by canonical/OG URLs.
 *
 * The owner chose this public host for launch. Keeping it in source, instead of requiring
 * a build environment variable, makes canonical URLs and the static sitemap correct in
 * local production builds as well as the Vercel deployment.
 */
export const SITE_URL = "https://gcb.alexreynolds.com";

/** Vercel marks production builds; previews and local exports must ask crawlers not to index. */
export const IS_PRODUCTION_DEPLOYMENT = process.env.VERCEL_ENV === "production";
