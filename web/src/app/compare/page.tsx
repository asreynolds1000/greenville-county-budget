import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { SpendingComparison } from "@/components/SpendingComparison";
import { getSpendingComparisonData } from "@/lib/spendingSnapshots";
import { getLatestFiscalYear } from "@/lib/loaders";

export const metadata: Metadata = {
  title: "Compare spending across years",
  description: "Compare Greenville County General Fund service categories and department budgets, with dollar changes, budget shares, and historical qualifications.",
  alternates: { canonical: "/compare/" },
};

export default function ComparePage() {
  const data = getSpendingComparisonData();
  return <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
    <Link href="/" className="text-sm text-accent underline underline-offset-4">County overview</Link>
    <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight">Where does spending go, and what changed?</h1>
    <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-secondary">
      Compare the General Fund&apos;s adopted spending plans. Choose two years to see which
      services account for the largest amounts or changes. An increase in budget does not by
      itself explain why costs rose or whether services improved.
    </p>
    <p className="mt-3 text-sm text-ink-secondary">This covers one fund. For the total across all four included funds, <Link href={`/e/budget.total/?fy=${getLatestFiscalYear()}#change-over-time`} className="text-accent underline underline-offset-4">compare the county total</Link>. These are the adopted plans printed in the budget books. An <Link href="/e/fund.general/" className="text-accent underline underline-offset-4">audited General Fund year</Link> separately compares spending with the final budget after amendments, so its budget figures may differ.</p>
    <SpendingComparison {...data} />
  </main>;
}
