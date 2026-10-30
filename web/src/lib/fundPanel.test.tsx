import { createHash } from "node:crypto";
import { cloneElement, type ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { FundExplorer } from "@/components/FundExplorer";
import { isDeferredFund } from "@/lib/deferredFunds";
import { EntityYearContext } from "@/components/EntityYearExplorer";
import { generateStaticParams } from "@/app/e/[entityId]/page";
import { buildFundPanelData } from "@/lib/buildFundPanelData";
import baseline from "../../tests/fixtures/fund-panel-markup.json";
// Forward regression fixture captured from the earlier working-tree renderer,
// then corrected for canonical entity hrefs. This is not a HEAD before/after baseline.
import canonicalBaseline from "../../tests/fixtures/fund-panel-canonical-markup.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Next's App Router compiler resolves next/dynamic to this implementation. Vitest
// otherwise loads its Pages Router adapter, whose preload registry is never started.
vi.mock("next/dynamic", async () => ({ default: (await import("next/dist/shared/lib/app-dynamic")).default }));
// Exercise the real async reader with JSON from the real build-time model builder.
// Only transport is replaced: these unit tests do not need a running HTTP server.
vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  const entityId = /^\/e\/([^/]+)\/panels\.json\?revision=[a-f0-9]{64}$/.exec(url)?.[1];
  if (!entityId || !(entityId in baseline)) throw new Error(`Unexpected request: ${url}`);
  const years = Object.keys(baseline[entityId as keyof typeof baseline]).map(Number);
  return Response.json({ entityId, ...buildFundPanelData(entityId, years) });
}));
afterAll(() => vi.unstubAllGlobals());

describe("fund panels built from data on year selection", () => {
  const genericIds = new Set(generateStaticParams().map(params => params.entityId));
  it("keeps all fund renderer families off the generic route", () => {
    for (const id of Object.keys(canonicalBaseline)) expect(genericIds.has(id)).toBe(false);
  });
  for (const [entityId, years] of Object.entries(canonicalBaseline)) {
    const deferred = isDeferredFund(entityId);
    const explorer = FundExplorer({ entityId });
    const panels = explorer.props.panels as Record<number, ReactElement<{ input?: unknown; revision?: string }>>;
    const renderPanel = (panel: ReactElement, year: number) => renderToReadableStream(
      <EntityYearContext.Provider value={{ entityId, year, chooseYear: () => {}, shared: { chart: null, ledger: null } }}>
        {panel}
      </EntityYearContext.Provider>,
    );

    it(`${entityId} retains every input and common-metadata key through JSON transport`, () => {
      const model = buildFundPanelData(entityId, Object.keys(years).map(Number));
      expect(JSON.parse(JSON.stringify(model))).toStrictEqual(model);
    });

    it(`${entityId} discloses the actual no-JavaScript access and links to downloads`, async () => {
      const stream = await renderToReadableStream(explorer);
      await stream.allReady;
      const html = await new Response(stream).text();
      const notice = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
      expect(notice).toContain("Historical year detail requires JavaScript.");
      expect(notice).not.toContain("full history");
      expect(notice).toContain(`href="/downloads/series/${entityId}.csv"`);
      expect(notice).toContain('href="/downloads/"');
    });

    if (deferred) it(`${entityId} pins every deferred panel to the exact exported model`, async () => {
      const { GET } = await import("@/app/e/[entityId]/panels.json/route");
      const response = await GET(new Request("https://example.test/"), { params: Promise.resolve({ entityId }) });
      const revision = createHash("sha256").update(await response.text()).digest("hex");
      for (const panel of Object.values(panels)) expect(panel.props.revision).toBe(revision);
    });

    it(`${entityId} renders its initial latest panel without fetching historical data`, async () => {
      const calls = vi.mocked(fetch).mock.calls.length;
      const latest = Math.max(...Object.keys(years).map(Number));
      const stream = await renderPanel(panels[latest], latest);
      await stream.allReady;
      const html = (await new Response(stream).text()).replace(/<!--[^]*?-->/g, "");
      expect(createHash("sha256").update(html).digest("hex")).toBe(years[String(latest) as keyof typeof years]);
      expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    });

    it(`${entityId} keeps all years selectable with its chosen delivery strategy`, () => {
      expect(Object.keys(panels).sort()).toEqual(Object.keys(years).sort());
      const latest = Math.max(...Object.keys(years).map(Number));
      for (const [year, panel] of Object.entries(panels)) {
        expect(panel.props).toHaveProperty("input");
        expect(JSON.parse(JSON.stringify(panel.props.input))).toStrictEqual(panel.props.input);
        if (deferred && Number(year) !== latest) expect(panel.props.input).toBeNull();
        else expect(panel.props.input).not.toBeNull();
      }
    });

    for (const [year, hash] of Object.entries(years)) {
      it(`${entityId} FY${year} retains accounting panel markup outside shared history`, async () => {
        const panel = panels[Number(year)];
        const rendered = panel.props.input
          ? cloneElement(panel, { input: JSON.parse(JSON.stringify(panel.props.input)) })
          : panel;
        const stream = await renderPanel(rendered, Number(year));
        await stream.allReady;
        // Streaming inserts React text separators/boundary comments. Static markup
        // omits those transport markers; preserve every element, attribute and text.
        const html = (await new Response(stream).text()).replace(/<!--[^]*?-->/g, "");
        expect(createHash("sha256").update(html).digest("hex")).toBe(hash);
      });
    }
  }
});
