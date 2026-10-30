import { useId } from "react";

/**
 * The Internal Service Fund's visual signature: neutral fill + a 45° hatch,
 * distinguishing "excluded from the total" from the four real fund hues
 * (Step 4 design brief). Purely decorative — the ISF note it sits beside
 * carries the actual explanation in text, so this is aria-hidden.
 *
 * useId keeps the <pattern> id collision-free if this ever renders more than
 * once on a page; it's safe in a Server Component (no client interactivity).
 */
export function HatchSwatch({ size = 16 }: { size?: number }) {
  const patternId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0 rounded-sm"
    >
      <defs>
        <pattern
          id={patternId}
          width="4"
          height="4"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="4" height="4" fill="#6B6862" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#FCFCFB" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="16" height="16" fill={`url(#${patternId})`} />
    </svg>
  );
}
