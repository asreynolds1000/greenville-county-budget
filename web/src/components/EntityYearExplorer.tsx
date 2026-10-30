"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { entityYearHref, selectEntityYear } from "@/lib/entityYearSelection";
import { entityDocumentTitle, entityTitleName } from "@/lib/entityTitle";

type SharedContent = { chart: ReactNode; ledger: ReactNode };
type YearContext = {
  entityId: string;
  year: number | null;
  chooseYear: (year: number) => void;
  shared: SharedContent;
};
export const EntityYearContext = createContext<YearContext | null>(null);
const YEAR_CHANGE = "entity-year-change";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(YEAR_CHANGE, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(YEAR_CHANGE, callback);
  };
}

export function useEntityYear() {
  return useContext(EntityYearContext);
}

/** The large server-rendered history is serialized once in the provider's props. */
export function EntityYearSharedSlot({ name }: { name: keyof SharedContent }) {
  return useEntityYear()?.shared[name] ?? null;
}

export function EntityYearExplorer({ entityId, name, years, panels, shared }: {
  entityId: string;
  name: string;
  years: number[];
  panels: Record<number, ReactNode>;
  shared: SharedContent;
}) {
  // Preserve useful initial HTML; read the query after hydration and on Back/Forward.
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const year = selectEntityYear(search, years);
  // The server rendered the latest year into <title>. Once the reader selects another, the
  // figures and the title have to agree: a page of FY2014 numbers titled "General Fund" is
  // wrong in the tab, in a bookmark and in the session history entry this component pushes.
  // Keep the document title on the year the reader is actually looking at.
  //
  // This is an observer rather than a plain assignment because a plain assignment does not
  // hold. Measured on the built export: the effect sets the FY2025 title at ~91ms, and at
  // ~399ms — when the deferred fund panel's Suspense boundary resolves — the framework
  // re-applies the server-rendered metadata title and the page goes back to claiming FY2026
  // over FY2025 figures. That commit does not re-render this component, so neither a
  // dependency-array effect nor a no-dependency effect runs again; both were tried and both
  // lost the race silently, which is the worst shape for a defect like this.
  //
  // Re-asserting on head mutations covers every such re-application without predicting when
  // they happen. The equality guard is what stops our own write from re-entering.
  //
  // Two bounds keep the observer from outliving its page, because an unbounded one wrote
  // "Sheriff — FY2020" over the Search page's title after a client-side navigation: React
  // mutated <title> for the new route, the mutation record was delivered as a microtask, and
  // the passive-effect disconnect was still a task away. (1) The lifetime is a layout effect,
  // so the disconnect runs inside the commit that unmounts this component, and disconnect()
  // discards any record still queued from that commit. (2) Every write checks the location:
  // Next pushes the destination URL in an insertion effect of the same commit that mutates
  // <title>, so by the time a record is delivered the address bar already names the page the
  // reader is on. The title written is only ever the one for the entity and year in the URL.
  useLayoutEffect(() => {
    if (year === null) return;
    const wanted = entityDocumentTitle(entityTitleName(entityId, name), year);
    const pathname = `/e/${encodeURIComponent(entityId)}`;
    const onThisPage = () => {
      const here = window.location.pathname.replace(/\/$/, "");
      return (here === pathname || here === `/e/${entityId}`)
        && selectEntityYear(window.location.search, years) === year;
    };
    const assert = () => { if (onThisPage() && document.title !== wanted) document.title = wanted; };
    assert();
    const observer = new MutationObserver(assert);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [entityId, name, year, years]);
  const navigate = (url: URL) => {
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(YEAR_CHANGE));
  };
  const chooseYear = (value: number) => {
    if (!years.includes(value)) return;
    const url = new URL(window.location.href);
    url.pathname = `/e/${encodeURIComponent(entityId)}/`;
    url.searchParams.set("fy", String(value));
    navigate(url);
  };
  const followYearLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.pathname !== `/e/${encodeURIComponent(entityId)}/`
      || !url.searchParams.has("fy")) return;
    event.preventDefault();
    navigate(url);
    if (url.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView());
  };

  return <EntityYearContext.Provider value={{ entityId, year, chooseYear, shared }}>
    <div className="contents" data-entity-name={name} data-entity-year={year ?? "unavailable"} onClickCapture={followYearLink}>
      <div className="mx-auto w-full max-w-4xl px-5 pt-8 sm:px-8">
        <label className="flex items-center gap-3 font-mono text-sm">
          Explore fiscal year
          <select aria-label="Explore fiscal year" value={year ?? ""}
            onChange={(event) => chooseYear(Number(event.target.value))}
            className="min-h-11 rounded-md border border-hairline bg-surface px-3 text-ink">
            {year === null && <option value="" disabled>Choose a covered year</option>}
            {[...years].sort((a, b) => b - a).map((value) => <option key={value} value={value}>FY{value}</option>)}
          </select>
        </label>
        <noscript><p className="mt-3 text-sm">{shared.ledger
          ? "The latest covered year is shown. Enable JavaScript to select another year; the full history and CSV remain available below."
          : <>The latest covered year is shown. Historical year detail requires JavaScript. You can download the <a className="underline" href={`/downloads/series/${encodeURIComponent(entityId)}.csv`} download>series CSV</a> or browse <a className="underline" href="/downloads/">site-wide downloads</a>.</>}
        </p></noscript>
      </div>
      {year === null
        ? <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8">
          <h1 className="font-display text-3xl">Fiscal year unavailable</h1>
          <p className="mt-4">This link does not select one covered fiscal year. Choose a year above to see its figures and sources.</p>
          <a className="mt-4 inline-block underline" href={entityYearHref(entityId, Math.max(...years))}>View the latest covered year</a>
        </main>
        : <div key={year} className="contents">{panels[year]}</div>}
    </div>
  </EntityYearContext.Provider>;
}
