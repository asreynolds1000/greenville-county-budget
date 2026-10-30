import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { Suspense } from "react";

import { SearchClient } from "@/components/SearchClient";
import { getLatestFiscalYear, getSearchIndex } from "@/lib/loaders";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Find Greenville County services, funds, and budget lines by the words residents actually use, "
    + "with the fund and direction of the money shown on every result.",
  alternates: { canonical: "/search/" },
};

export default function SearchPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-accent">
          Budget Explorer
        </Link>
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">Search</h1>
      <p className="mt-6 leading-relaxed text-ink">
        Find a service, fund, or budget line. Related entries may describe a whole fund or
        part of it, so each result keeps the county&apos;s official name alongside what the figure
        represents.
      </p>

      <div className="mt-10">
        {/* Suspense keeps the route statically exportable while useSearchParams reads ?q= */}
        <Suspense fallback={<p className="text-ink-secondary">Loading search…</p>}>
          <SearchClient index={getSearchIndex()} latestYear={getLatestFiscalYear()} />
        </Suspense>
      </div>
    </main>
  );
}
