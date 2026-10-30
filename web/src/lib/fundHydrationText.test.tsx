import { createHash } from "node:crypto";
import { renderToReadableStream } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { FundExplorer } from "@/components/FundExplorer";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", async () => ({ default: (await import("next/dist/shared/lib/app-dynamic")).default }));
afterEach(() => vi.unstubAllGlobals());

it("keeps General Fund text identical across compact-currency Intl defaults", async () => {
  const nativeIntl = Intl;
  async function markupWithDefault(minimumFractionDigits: number) {
    const runtime = Object.create(nativeIntl);
    runtime.NumberFormat = new Proxy(nativeIntl.NumberFormat, { construct(target, args) {
      const [locale, options] = args;
      // Node ICU77 and the other measured V8 runtime choose different implicit
      // minimums. Explicit application options must override either default.
      return new target(locale, options?.notation === "compact" ? { minimumFractionDigits, ...options } : options);
    } });
    vi.stubGlobal("Intl", runtime);
    const stream = await renderToReadableStream(FundExplorer({ entityId: "fund.general" }));
    await stream.allReady;
    return createHash("sha256").update(await new Response(stream).text()).digest("hex");
  }
  expect(await markupWithDefault(0)).toBe(await markupWithDefault(1));
});
