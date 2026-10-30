import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPropertyRecordHandler } from "../../server/propertyRecordHandler.mjs";

const pin = "0000000000001";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

async function endpoint(fetchRecord = vi.fn().mockResolvedValue({ pin, taxYear: 2025 })) {
  const handler = createPropertyRecordHandler({ fetchRecord });
  const server = createServer((request, response) => { void handler(request, response); });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/property-record`;
  return { url, fetchRecord };
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("county record endpoint", () => {
  it("returns a record without caching and passes only PIN/year upstream", async () => {
    const { url, fetchRecord } = await endpoint();
    const response = await fetch(url, post({ pin, taxYear: 2025 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ record: { pin, taxYear: 2025 } });
    expect(fetchRecord).toHaveBeenCalledWith(pin, 2025, { signal: expect.any(AbortSignal) });
  });

  it.each([
    { pin: "https://example.com/private", taxYear: 2025 },
    { pin, taxYear: 2026 },
    { pin, taxYear: "2025" },
    { pin, taxYear: 2025, url: "https://example.com" },
    { pin: "0".repeat(2000), taxYear: 2025 },
  ])("rejects invalid or excessive input before fetching", async (body) => {
    const { url, fetchRecord } = await endpoint();
    expect((await fetch(url, post(body))).status).toBe(400);
    expect(fetchRecord).not.toHaveBeenCalled();
  });

  it("does not allow parcel identifiers in URL queries or cross-site requests", async () => {
    const { url, fetchRecord } = await endpoint();
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(`${url}?pin=${pin}`, post({ pin, taxYear: 2025 }))).status).toBe(400);
    expect((await fetch(url, { ...post({ pin, taxYear: 2025 }), headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" } })).status).toBe(403);
    expect(fetchRecord).not.toHaveBeenCalled();
  });

  it("does not expose upstream exception details", async () => {
    const { url } = await endpoint(vi.fn().mockRejectedValue(new Error("upstream-private-identifier")));
    const response = await fetch(url, post({ pin, taxYear: 2025 }));
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"kind":"unavailable"}');
  });
});
