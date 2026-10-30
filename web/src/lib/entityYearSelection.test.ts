import { describe, expect, it } from "vitest";
import { entityYearHref, selectEntityYear } from "./entityYearSelection";

describe("entity year URLs", () => {
  it("uses a query to select a covered year without another page", () => {
    expect(entityYearHref("balance.debt.beginning", 2010))
      .toBe("/e/balance.debt.beginning/?fy=2010");
  });

  it("defaults to the latest covered year, including retired entities", () => {
    expect(selectEntityYear("", [2002, 2005, 2011])).toBe(2011);
    expect(selectEntityYear("?fy=2005", [2002, 2005, 2011])).toBe(2005);
  });

  it.each(["?fy=2010", "?fy=", "?fy=2e3", "?fy=2005x", "?fy=2005&fy=2011"])(
    "rejects an absent, malformed or ambiguous year: %s", (query) => {
      expect(selectEntityYear(query, [2002, 2005, 2011])).toBeNull();
    },
  );
});
