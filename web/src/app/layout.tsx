import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { GA_MEASUREMENT_ID, IS_PRODUCTION_DEPLOYMENT, SITE_URL } from "@/lib/site";
import { SITE_TITLE } from "@/lib/entityTitle";

import "./globals.css";

/**
 * Type system (Step 4 design brief). Three self-hosted variable fonts, each
 * exposed as a CSS custom property that globals.css's @theme wires into a
 * Tailwind font-* utility: font-display (Fraunces), font-body (IBM Plex
 * Sans, the default), font-mono (IBM Plex Mono — every dollar figure and
 * every provenance/citation string, per the brief).
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  /**
   * Makes every page's relative `alternates.canonical` resolve to an absolute URL, which
   * is what a canonical tag has to be. It resolves against SITE_URL in `lib/site.ts`. Before
   * a real domain existed it used the reserved `.invalid` host — same reasoning as the sitemap: a
   * canonical pointing at a domain someone else could own would hand them the page's
   * identity, and `.invalid` can never be registered.
   */
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_TITLE}`,
  },
  description:
    "An independent, non-advocacy explorer of Greenville County, South Carolina's adopted budgets, FY2002-FY2026.",
  /**
   * Link previews. Per-page `title` and `description` flow into these automatically, so
   * every entity page gets its own; only the site-wide frame is declared here.
   *
   * The share image is one generic card (public/og.png) with the site's name and mark and
   * no figures. A dollar amount baked into an image would travel without its citation,
   * status label or caveats, which is the one thing this site is built not to do, so no
   * page gets a card showing its own numbers.
   */
  openGraph: {
    type: "website",
    siteName: "Greenville County Budget Explorer",
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Budget Explorer: follow Greenville County's money" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {/*
          The skip link's target, declared once here rather than on each page's <main>.
          A wrapper rather than the landmark itself: every page already renders its own
          <main>, and moving the id onto each of them would mean nine places to keep in
          step and one silently missing target the first time a page is added. `tabIndex
          ={-1}` makes it programmatically focusable without putting it in the tab order,
          and a plain div adds no second main landmark to the accessibility tree.
        */}
        <div id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </div>
        <SiteFooter />
        {/* Visit counts only, on the production site. The property-tax lookup never puts an
            address or PIN in the URL, so analytics never receives either. */}
        {IS_PRODUCTION_DEPLOYMENT && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
            <Script id="google-analytics" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
