"use client";

import { useEntityYear } from "@/components/EntityYearExplorer";

type MobileFiscalYearGroup = {
  key: string;
  label: string;
  years: number[];
};

/**
 * Compact fiscal-year routing for phones. The full grouped link treatment remains available
 * on larger screens; a native select keeps all covered years reachable without three wide
 * scrolling chip rows while preserving the real year URL for each choice.
 */
export function MobileFiscalYearSelect({
  groups,
  currentYear,
}: {
  groups: MobileFiscalYearGroup[];
  currentYear: number;
}) {
  const selection = useEntityYear();
  if (!selection) throw new Error("MobileFiscalYearSelect requires EntityYearExplorer");

  return (
    <label className="flex items-center gap-3">
      <span className="font-mono text-xs tracking-wide text-ink-secondary uppercase">
        Fiscal year
      </span>
      <select
        aria-label="Choose fiscal year"
        value={String(currentYear)}
        onChange={(event) => selection.chooseYear(Number(event.target.value))}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 font-mono text-sm text-ink"
      >
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.years.map((year) => (
              <option key={year} value={String(year)}>
                FY{year}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
