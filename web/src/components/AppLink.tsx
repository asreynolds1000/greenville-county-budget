import NextLink from "next/link";
import type { ComponentProps } from "react";

/** Next 16.3.4 treats dotted IDs as filenames and strips their slash even with trailingSlash: true. */
export default function AppLink(props: ComponentProps<typeof NextLink>) {
  if (typeof props.href !== "string" || !/^\/e\/[^/?#]+\/?(?:[?#]|$)/.test(props.href)) {
    return <NextLink {...props} />;
  }
  const { href, children, ...anchor } = props;
  // These options apply only to Next navigation, not native document links.
  for (const key of ["as", "replace", "scroll", "shallow", "prefetch", "locale", "legacyBehavior", "passHref", "onNavigate"] as const) {
    delete anchor[key];
  }
  return <a {...anchor} href={href.replace(/^(\/e\/[^/?#]+)\/?(?=[?#]|$)/, "$1/")}>{children}</a>;
}
