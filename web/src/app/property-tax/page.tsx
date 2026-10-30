import { OTHER_GOVERNMENT_SOURCES } from "@/lib/taxRecipients";
import type { Metadata } from "next";

import { PropertyTaxExplorer } from "@/components/PropertyTaxExplorer";
import { getLatestFiscalYear } from "@/lib/loaders";

export const metadata: Metadata = {
  title: { absolute: "Greenville County property tax estimate · Budget Explorer" },
  description: "Estimate how a Greenville County, SC property tax bill divides among county government, schools, cities and special districts, using the county's published 2025 millage.",
  alternates: { canonical: "/property-tax/" },
};

export default function PropertyTaxPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:py-12">
      <p className="font-mono text-xs tracking-widest text-ink-secondary uppercase">Greenville County property tax</p>
      <h1 id="property-tax-title" className="mt-2 font-display text-4xl font-semibold tracking-tight">Where does your property tax go?</h1>
      <p className="mt-4 max-w-2xl rounded-md border border-accent/30 bg-surface p-4 text-sm leading-relaxed text-ink">
        <strong className="font-medium">Estimate with published 2025 rates.</strong>{" "}
        See the portions for county government and other recipients.
        This is not an official bill; it excludes fees, penalties and other credits.
        Actual bills also include the <a href="https://www.greenvillecounty.org/LandDevelopment/Billing.aspx" target="_blank" rel="noreferrer" className="text-accent underline decoration-dotted underline-offset-2">county stormwater fee</a> and, inside a city, that city&rsquo;s service fees, which together can add tens to a few hundred dollars.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">If you rent, you don&rsquo;t get a county tax bill. Your landlord&rsquo;s property tax and the sales tax you pay both fund the county.</p>
      
      <p className="mt-3 text-sm"><a href="https://www.greenvillecounty.org/appsas400/votaxqry/Default.aspx" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">Open the county’s official bill search →</a></p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-secondary">
        <a href={OTHER_GOVERNMENT_SOURCES.schoolsBudget.url} className="text-accent underline underline-offset-2">Greenville County Schools</a>,{" "}
        <a href={OTHER_GOVERNMENT_SOURCES.cityBudget.url} className="text-accent underline underline-offset-2">City of Greenville</a> and{" "}
        <a href={OTHER_GOVERNMENT_SOURCES.sanitation.url} className="text-accent underline underline-offset-2">Greater Greenville Sanitation</a>{" "}
        appear here only to explain the tax bill. Their budgets are outside this explorer. Follow these links to each government&rsquo;s own information.
      </p>
      <noscript><p className="my-5">Turn on JavaScript to use this estimate, or use the official bill search above.</p></noscript>
      <PropertyTaxExplorer budgetYear={getLatestFiscalYear()} />
    </main>
  );
}
