import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { buildFundPanelData } from "@/lib/buildFundPanelData";
import { fundInputForYear, loadFundPanelModel, retryFundPanelModel } from "@/lib/fundPanelResource";

const entityId = "fund.debt-service";
const model = () => ({ entityId, ...buildFundPanelData(entityId, [2014, 2024]) });
const revision = createHash("sha256").update(JSON.stringify(model())).digest("hex");
const staleRevision = "0".repeat(64);
afterEach(() => { retryFundPanelModel(entityId, revision); retryFundPanelModel(entityId, staleRevision); vi.unstubAllGlobals(); });

describe("static historical fund data", () => {
  it("shares one request across selections and keeps the requested year's input", async () => {
    const fetch = vi.fn(async () => Response.json(model()));
    vi.stubGlobal("fetch", fetch);
    const first = loadFundPanelModel(entityId, revision);
    expect(loadFundPanelModel(entityId, revision)).toBe(first);
    expect(fundInputForYear(await first, 2014).year).toBe(2014);
    expect(fundInputForYear(await loadFundPanelModel(entityId, revision), 2024).year).toBe(2024);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/e/fund.debt-service/panels.json?revision=${revision}`);
  });

  it("permits an explicit retry after an HTTP failure", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(model()));
    vi.stubGlobal("fetch", fetch);
    await expect(loadFundPanelModel(entityId, revision)).rejects.toThrow("Could not load");
    retryFundPanelModel(entityId, revision);
    expect(fundInputForYear(await loadFundPanelModel(entityId, revision), 2024).year).toBe(2024);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a response for a different entity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...model(), entityId: "fund.general" })));
    await expect(loadFundPanelModel(entityId, revision)).rejects.toThrow("does not match");
  });

  it("rejects a missing or mislabeled year instead of substituting figures", () => {
    const data = model();
    expect(() => fundInputForYear(data, 1999)).toThrow("selected fiscal year");
    data.panels[2014] = data.panels[2024];
    expect(() => fundInputForYear(data, 2014)).toThrow("selected fiscal year");
  });

  it("rejects stale same-entity, same-year figures against the page's revision", async () => {
    const stale = model();
    if (stale.panels[2014].kind !== "group") throw new Error("expected group input");
    stale.panels[2014].value = 17_501_715;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(stale)));
    await expect(loadFundPanelModel(entityId, revision)).rejects.toThrow("does not match");
  });

  it("never reuses a successful cached model for a different page revision", async () => {
    const fetch = vi.fn(async () => Response.json(model()));
    vi.stubGlobal("fetch", fetch);
    await loadFundPanelModel(entityId, revision);
    await expect(loadFundPanelModel(entityId, staleRevision)).rejects.toThrow("does not match");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("can retry a revision mismatch without accepting mismatched data", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...model(), extra: "stale" }))
      .mockResolvedValueOnce(Response.json(model()));
    vi.stubGlobal("fetch", fetch);
    await expect(loadFundPanelModel(entityId, revision)).rejects.toThrow("does not match");
    retryFundPanelModel(entityId, revision);
    expect(fundInputForYear(await loadFundPanelModel(entityId, revision), 2014).year).toBe(2014);
  });
});
