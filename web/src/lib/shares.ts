/**
 * Largest-remainder (Hamilton) share allocation (plan review fix Y2).
 *
 * Naive independent rounding of each item's percentage can miss 100.0 — the
 * FY2026 four-fund split rounds to 57.7 + 28.1 + 7.3 + 7.0 = 100.1 if each
 * share is rounded on its own. Hamilton's method floors every item's exact
 * share, then hands the leftover whole units (there are always fewer of them
 * than there are items) to the items with the largest fractional remainder —
 * so the displayed shares always sum to exactly 100.0, and every entity gets
 * either its floor or its floor + 1, never further off than that.
 *
 * This is the ONE place share-of-whole math happens; every drilldown row and
 * every Figure table in the app should compute displayed shares through this
 * function so no two views can quietly disagree with each other.
 */

export type ShareInput<Id extends string = string> = {
  id: Id;
  /** Must be >= 0. This dataset has no negative dollar amounts. */
  value: number;
};

export type Share<Id extends string = string> = {
  id: Id;
  /** Percentage points at `decimals` precision. All shares from one call sum to exactly 100. */
  share: number;
};

/**
 * Allocates `inputs` into percentage shares that sum to exactly 100 at the
 * given decimal precision (default 1, i.e. tenths of a percent).
 *
 * If every value is 0 (no meaningful proportion exists), every share is 0 —
 * there is nothing to allocate, and returning 100/N would fabricate a
 * proportion the data doesn't support.
 */
export function allocateShares<Id extends string = string>(
  inputs: ShareInput<Id>[],
  decimals = 1,
): Share<Id>[] {
  if (inputs.length === 0) return [];

  const total = inputs.reduce((sum, item) => sum + item.value, 0);
  const scale = 10 ** decimals;
  const target = 100 * scale;

  if (total <= 0) {
    return inputs.map((item) => ({ id: item.id, share: 0 }));
  }

  const exact = inputs.map((item) => (item.value / total) * target);
  const base = exact.map((value) => Math.floor(value));
  const remainder = exact.map((value, idx) => value - base[idx]);
  const sumBase = base.reduce((sum, value) => sum + value, 0);

  // Round for float safety — in exact arithmetic this is always a small
  // non-negative integer (fewer than inputs.length), never negative.
  let remaining = Math.round(target - sumBase);

  // Largest remainder first; stable tie-break by original input order so the
  // allocation is deterministic across runs.
  const order = inputs
    .map((_, idx) => idx)
    .sort((a, b) => {
      const diff = remainder[b] - remainder[a];
      return diff !== 0 ? diff : a - b;
    });

  const finalUnits = [...base];
  for (const idx of order) {
    if (remaining <= 0) break;
    finalUnits[idx] += 1;
    remaining -= 1;
  }

  return inputs.map((item, idx) => ({ id: item.id, share: finalUnits[idx] / scale }));
}

/** Formats a share value produced by allocateShares, e.g. 57.6 -> "57.6%". */
export function formatShare(share: number, decimals = 1): string {
  return `${share.toFixed(decimals)}%`;
}

/**
 * One item's share of an external total, computed the same way `/compare/`
 * (SpendingComparison.tsx) computes it inline: `value / total * 100`, left unrounded so the
 * caller can format it with `formatShare`. That component is out of scope for this change
 * (see napkin, "do NOT edit ... SpendingComparison.tsx"), so this is not an extraction of its
 * code -- it is the same formula, kept here so every other view computes a service-line share
 * identically and a General Fund entity page and its `/compare/` row can never print two
 * different numbers for the same fiscal year.
 *
 * Deliberately NOT `allocateShares`: that function partitions a whole SET of peers so they
 * sum to exactly 100. This is one line's share of a total the visible list does not
 * necessarily sum to -- the General Fund total includes transfers a single category or
 * department list may omit -- so there is no "remainder" to distribute here.
 *
 * Returns null when there is nothing meaningful to divide by, matching /compare/'s own guard
 * (`end.total !== null && end.total > 0`).
 */
export function shareOfTotal(value: number, total: number): number | null {
  if (!(total > 0)) return null;
  return (value / total) * 100;
}
