// Vercel builds each file in api/ as a serverless function, so a Git deploy carries the
// county-record lookup without scripts/prepare-vercel-output.mjs. The handler itself stays
// in server/, where the unit tests and the local test server (scripts/serve-out.mjs) use it.
export { default } from "../server/propertyRecordHandler.mjs";
