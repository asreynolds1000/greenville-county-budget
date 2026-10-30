import { existsSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("legacy entity-year compatibility", () => {
  it("replaces the full year page with an explicit static index.html handler", () => {
    expect(existsSync(path.join(process.cwd(), "src/app/e/[entityId]/[fy]/page.tsx"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src/app/e/[entityId]/[fy]/index.html/route.ts"))).toBe(true);
  });

  it("exports a small navigable fallback for an existing inbound link", async () => {
    const route = await import("@/app/e/[entityId]/[fy]/index.html/route");
    expect(route.dynamic).toBe("force-static");
    expect(route.generateStaticParams()).toContainEqual({ entityId: "dept.sheriff", fy: "2002" });
    const response = await route.GET(new Request("https://example.test/e/dept.sheriff/2002/index.html"), {
      params: Promise.resolve({ entityId: "dept.sheriff", fy: "2002" }),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(Buffer.byteLength(html)).toBeLessThan(1200);
    expect(html).toContain('/e/dept.sheriff/?fy=2002');
    expect(html).toContain('rel="canonical" href="https://gcdata.alexreynolds.com/e/dept.sheriff/"');
    expect(html).toContain("location.replace(");
    expect(html).toContain("location.hash");
    expect(html).toContain("<noscript>");
    expect(html).not.toContain("self.__next_f");
    expect(html).toContain("Continue to Sheriff — FY2002");
    expect(html).toContain("Historical year detail requires JavaScript.");
    expect(html).toContain("the latest covered year");
    expect(html).toContain('href="/downloads/series/dept.sheriff.csv"');
    expect(html).toContain('href="/downloads/"');
  });

  it("executes the redirect with path-year precedence, other query values and the fragment", async () => {
    const { GET } = await import("@/app/e/[entityId]/[fy]/index.html/route");
    const response = await GET(new Request("https://example.test/"), {
      params: Promise.resolve({ entityId: "dept.sheriff", fy: "2002" }),
    });
    const html = await response.text();
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(script).toBeTruthy();
    const destinations: string[] = [];
    runInNewContext(script!, { URL, URLSearchParams, location: {
      origin: "https://example.test", search: "?fy=2026&ref=archive&ref=share", hash: "#change-over-time",
      replace: (destination: string) => destinations.push(destination),
    } });
    expect(destinations).toEqual(["/e/dept.sheriff/?fy=2002&ref=archive&ref=share#change-over-time"]);
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=/e/dept.sheriff/?fy=2002">');
  });

  it("does not fabricate an unsupported entity-year", async () => {
    const { GET } = await import("@/app/e/[entityId]/[fy]/index.html/route");
    const response = await GET(new Request("https://example.test/"), {
      params: Promise.resolve({ entityId: "overview.gf.public-works", fy: "2018" }),
    });
    expect(response.status).toBe(404);
  });
});
