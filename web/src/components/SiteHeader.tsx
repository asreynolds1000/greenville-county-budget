import Link from "@/components/AppLink";
import { BrandMark } from "@/components/BrandMark";

/**
 * Site-wide wayfinding (plan Step 2).
 *
 * Most readers arrive on a deep entity page from a search result, and until now the only
 * way to reach the overview or the search box from there was to scroll to the footer. The
 * header is wayfinding; the footer keeps the publication metadata — the trust statement,
 * the corrections link, and the data version — because those belong at the end of a
 * document, not the top of it.
 *
 * Deliberately NOT sticky. The long General Fund page gets its own in-page orientation
 * control in Step 4, and a sticky global bar would spend scarce phone height on links a
 * reader needs twice a session while complicating every anchor offset on the page.
 *
 * Aligned to `max-w-6xl` with the same horizontal padding as the General Fund page, so the
 * masthead and the widest content share one outer edge. Narrow editorial pages keep their
 * `max-w-3xl` reading measure; a header that matched THEM would sit visibly inside the
 * content on the pages that matter most.
 *
 * Four items, not seven: the original list wrapped into two cramped rows at phone widths.
 * These four are the ones a reader reaches for mid-session — where the money comes from,
 * what it means for them, comparing years, and finding a specific line. About, Methodology,
 * Downloads and Corrections stay one scroll away in SiteFooter.tsx, which is where a
 * publication's front matter belongs regardless of header width.
 *
 * Even at four items, the default gap-x-5 between links overflows a 390px viewport by
 * about 12px (measured: 302.5px of link text + 60px of gap against 350px available), so the
 * nav still wrapped. gap-x-3 below `sm` closes that with room to spare; `sm:gap-x-5` keeps
 * the original, more generous spacing once there is width for it.
 */

const LINKS = [
  { href: "/", label: "County money" },
  { href: "/property-tax/", label: "Your money" },
  { href: "/compare/", label: "Compare years" },
  { href: "/search/", label: "Search" },
];

export function SiteHeader() {
  return (
    <>
      {/*
        The first focusable control on every page.
        Visually hidden until focused, then pinned to the top-left — a skip link that stays
        invisible when focused is worse than none, because a keyboard user has no way to
        tell whether the control they just reached exists.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2.5 focus:font-medium focus:text-white focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      >
        Skip to main content
      </a>

      <header data-print-hide className="border-b border-hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink hover:text-accent"
          >
            <BrandMark size={22} />
            Budget Explorer
          </Link>

          <nav
            aria-label="Main"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:gap-x-5"
          >
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-ink-secondary underline decoration-hairline underline-offset-4 hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
