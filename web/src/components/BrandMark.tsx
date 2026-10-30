/**
 * The site's mark: money in (three dark streams) joins the fund (green) and leaves as
 * money out (three fund-coloured streams). Decorative; the link around it carries the name.
 * The same geometry is in src/app/icon.svg and public/og.png.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="7" strokeLinecap="butt">
        <path d="M2 12 C 18 12, 18 26.5, 30 26.5" stroke="#1c1b18" />
        <path d="M2 32 H 30" stroke="#1c1b18" />
        <path d="M2 52 C 18 52, 18 37.5, 30 37.5" stroke="#1c1b18" />
        <path d="M34 26.5 C 46 26.5, 46 12, 62 12" stroke="#c99320" />
        <path d="M34 32 H 62" stroke="#5a52a6" />
        <path d="M34 37.5 C 46 37.5, 46 52, 62 52" stroke="#b23a24" />
      </g>
      <rect x="26" y="21" width="12" height="22" rx="3.5" fill="#00795a" />
    </svg>
  );
}
