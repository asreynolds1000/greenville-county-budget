import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { REPO_URL } from "@/lib/site";

import { CORRECTIONS_EMAIL, ReportErrorLink } from "@/components/ReportErrorLink";
import { getLatestFiscalYear } from "@/lib/loaders";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who publishes Greenville County Budget Explorer, how it stays independent, and how "
    + "to report an error.",
  alternates: { canonical: "/about/" },
};

export default function AboutPage() {
  const latestFiscalYear = getLatestFiscalYear();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">About</h1>
      <p className="mt-6 text-lg leading-relaxed text-ink">
        Greenville County Budget Explorer is an independent public-information project
        published by Alex Reynolds. It is not a Greenville County publication and does not
        speak for the county.
      </p>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Independence and editorial approach
        </h2>
        <p className="mt-4 leading-relaxed text-ink">
          The site transcribes and organizes the county&rsquo;s published budget documents and
          audited financial reports. It does not advocate for a spending level, tax policy,
          candidate, referendum, or conclusion. Alex Reynolds is responsible for the
          editorial and technical choices on this site.
        </p>
        <p className="mt-4 leading-relaxed text-ink-secondary">
          The county&rsquo;s official documents govern; this site transcribes them. Every figure
          names the document and printed page it came from so readers can check the work.
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Scope</h2>
        <p className="mt-4 leading-relaxed text-ink">
          The explorer covers the published material represented on the site, currently
          FY2002 through FY{latestFiscalYear}. It distinguishes adopted budgets from audited actual
          results and states where the county did not publish a comparable figure.
        </p>
        <p className="mt-4 leading-relaxed text-ink-secondary">
          Read the <Link href="/methodology/" className="text-accent underline decoration-dotted underline-offset-2">methodology and coverage</Link>{" "}
          for the source, verification, and comparison rules, or <Link href="/downloads/" className="text-accent underline decoration-dotted underline-offset-2">download the data</Link>{" "}
          with its citations and caveats.
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Corrections and contact</h2>
        <p className="mt-4 leading-relaxed text-ink">
          If you find an error, email Alex Reynolds at{" "}
          <a href={`mailto:${CORRECTIONS_EMAIL}`} className="text-accent underline decoration-dotted underline-offset-2">
            {CORRECTIONS_EMAIL}
          </a>{" "}
          or use the report action below. The <Link href="/corrections/" className="text-accent underline decoration-dotted underline-offset-2">corrections page</Link>{" "}
          explains how reports are handled, records changes, and states what happens when
          the county disputes an interpretation.
        </p>
        <p className="mt-5">
          <ReportErrorLink
            pagePath="/about/"
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-ink hover:border-ink/30 hover:bg-surface"
          >
            Report an error by email
          </ReportErrorLink>
        </p>
      </section>

      <section className="mt-12 border-t border-hairline pt-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">Data reuse</h2>
        <p className="mt-4 leading-relaxed text-ink-secondary">
          The compiled dataset and downloads are published under the{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="text-accent underline decoration-dotted underline-offset-2">
            Creative Commons Attribution 4.0 licence (CC BY 4.0)
          </a>
          : you may reuse and adapt them for any purpose if you credit the Greenville County Budget
          Explorer. The source data, pipeline, tests and code are{" "}
          <a href={REPO_URL} className="text-accent underline decoration-dotted underline-offset-2">
            on GitHub
          </a>
          , where corrections and new source-backed data are welcome. The code is MIT-licensed.
        </p>
      </section>
    </main>
  );
}
