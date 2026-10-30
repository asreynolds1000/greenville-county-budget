/** Package the tested static export and the narrow county-record reader together. */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const web = new URL("../", import.meta.url);
const output = new URL(".vercel/output/", web);
await readFile(new URL("out/index.html", web)); // Fail before removing any previous artifact.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("out/", web), new URL("static/", output), { recursive: true });
const fn = new URL("functions/api/property-record.func/", output);
await mkdir(fn, { recursive: true });
for (const file of ["propertyRecordHandler.mjs", "propertyRecord.mjs"]) {
  await cp(new URL(`server/${file}`, web), new URL(file, fn));
}
await writeFile(new URL(".vc-config.json", fn), JSON.stringify({
  runtime: "nodejs22.x",
  handler: "propertyRecordHandler.mjs",
  launcherType: "Nodejs",
  maxDuration: 15,
}));
// Prebuilt deploys ignore vercel.json, so carry its response headers into the Build Output config.
const { headers: headerRules = [] } = JSON.parse(await readFile(new URL("vercel.json", web), "utf8"));
const routes = headerRules.map(({ source, headers }) => {
  if (source !== "/(.*)") throw new Error(`Translate header source ${source} by hand before deploying.`);
  return { src: "^/(.*)$", headers: Object.fromEntries(headers.map(({ key, value }) => [key, value])), continue: true };
});
const config = routes.length ? { version: 3, routes: [...routes, { handle: "filesystem" }] } : { version: 3 };
await writeFile(new URL("config.json", output), JSON.stringify(config) + "\n");
console.log(`Prepared static pages and county-record function in ${fileURLToPath(output)}`);
