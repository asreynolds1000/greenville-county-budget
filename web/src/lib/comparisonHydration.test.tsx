import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { EntityHistoryComparison } from "@/components/EntityHistoryComparison";
import { getV2EntityPage } from "@/lib/loaders";

it("keeps exported comparison selects inert until their handlers can receive input", () => {
  // This is the real server render, without hydration or mocked React hooks. Enabled
  // native selects here accept changes that never reach the comparison's React state.
  const html = renderToStaticMarkup(
    <EntityHistoryComparison page={getV2EntityPage("budget.total")} year={2026} />,
  );
  const selects = html.match(/<select\b[^>]*>/g) ?? [];

  expect(selects).toHaveLength(3);
  expect(selects.map((select) => /\bdisabled=""/.test(select))).toEqual([true, true, true]);
  expect(html).toContain('value="2016"');
  expect(html).toContain("$399,316,815");
  expect(html).toContain("$477,233,755");
});
