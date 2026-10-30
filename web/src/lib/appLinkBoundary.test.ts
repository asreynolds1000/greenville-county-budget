import { ESLint } from "eslint";
import { expect, it } from "vitest";

it.each(["src/components/Example.tsx", "src/components/Figure.tsx"])("bans direct Next Link even in %s", async filePath => {
  const [result] = await new ESLint().lintText('import Link from "next/link"; export default Link;', { filePath });
  expect(result.messages.some(message => message.ruleId === "no-restricted-imports")).toBe(true);
});

it("allows the shared AppLink boundary to import Next Link", async () => {
  const [result] = await new ESLint().lintText('import Link from "next/link"; export default Link;', { filePath: "src/components/AppLink.tsx" });
  expect(result.messages.filter(message => message.ruleId === "no-restricted-imports")).toEqual([]);
});
