import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const linkPaths = [{ name: "next/link", message: "Use @/components/AppLink to preserve canonical dotted entity directory URLs." }];
const chartPatterns = [{
  group: ["@/components/charts/*", "@/components/charts/**"],
  message: "Chart SVG primitives are only importable from @/components/Figure — every chart must go through the Figure contract (caption, table, download, source drawer).",
}];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Plan Decision 4.1: "One Figure component is the only path to a chart."
  // The chart SVG primitives (Step 4+) live under @/components/charts/ and
  // must not be imported anywhere except the Figure module — that's the
  // structural guarantee that a chart without a caption, accessible table,
  // CSV download, and source affordance is unrepresentable in the codebase.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: linkPaths,
          patterns: chartPatterns,
        },
      ],
    },
  },
  // The Figure module itself is the one permitted caller.
  {
    files: ["src/components/Figure.tsx", "src/components/Figure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: linkPaths }],
    },
  },
  {
    files: ["src/components/AppLink.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: chartPatterns }],
    },
  },
]);

export default eslintConfig;
