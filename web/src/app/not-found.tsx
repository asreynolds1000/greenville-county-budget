import Link from "@/components/AppLink";

/**
 * The 404. Most arrivals here are a mistyped or stale entity URL, so the page names the
 * two URL shapes this site uses rather than offering a generic apology — a reader who
 * guessed `/e/sheriff/` can fix it from this page without hunting.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        Greenville County, South Carolina
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
        That page is not here
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-ink">
        Either the address is mistyped, or it points at something this site does not cover.
      </p>
      <p className="mt-4 leading-relaxed text-ink-secondary">
        Pages on this site take one of two shapes: <code className="font-mono">/e/&lt;line&gt;/</code>{" "}
        for a budget line&rsquo;s most recent year, and{" "}
        <code className="font-mono">/e/&lt;line&gt;/?fy=&lt;year&gt;</code> for one specific
        year of it. Line names look like <code className="font-mono">dept.sheriff</code>,{" "}
        <code className="font-mono">fund.general</code>, or{" "}
        <code className="font-mono">rev.property-taxes</code>.
      </p>
      <nav aria-label="Recover" className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/" className="font-medium text-accent underline decoration-dotted underline-offset-4">
          Start at the county overview
        </Link>
        <Link
          href="/methodology/"
          className="font-medium text-accent underline decoration-dotted underline-offset-4"
        >
          See what is covered
        </Link>
      </nav>
    </main>
  );
}
