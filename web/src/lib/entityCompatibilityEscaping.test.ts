import { expect, it, vi } from "vitest";
import { GET } from "@/app/e/[entityId]/[fy]/index.html/route";

vi.mock("@/lib/entityYearSelection", () => ({
  entityYearHref: () => '/e/dept.sheriff/?fy=2002&from="history"',
}));

it("escapes a multi-parameter destination in compatibility HTML attributes", async () => {
  const response = await GET(new Request("https://example.test/"), {
    params: Promise.resolve({ entityId: "dept.sheriff", fy: "2002" }),
  });
  const html = await response.text();
  expect(html).toContain('content="0;url=/e/dept.sheriff/?fy=2002&amp;from=&quot;history&quot;"');
  expect(html).toContain('href="/e/dept.sheriff/?fy=2002&amp;from=&quot;history&quot;"');
});
