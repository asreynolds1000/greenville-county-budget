import { fetchPropertyRecord } from "./propertyRecord.mjs";

const MAX_BODY_BYTES = 1_024;

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > MAX_BODY_BYTES) reject(new Error("body_limit"));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", () => reject(new Error("invalid_body")));
    request.on("aborted", () => reject(new Error("invalid_body")));
  });
}

/** A fixed county lookup, never a general URL proxy. No request or response logging. */
export function createPropertyRecordHandler({ fetchRecord = fetchPropertyRecord } = {}) {
  return async function propertyRecordHandler(request, response) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("CDN-Cache-Control", "no-store");
    response.setHeader("Vercel-CDN-Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      send(405, { kind: "unavailable" });
      return;
    }
    if (request.headers["sec-fetch-site"] === "cross-site") {
      send(403, { kind: "unavailable" });
      return;
    }
    if ((request.url ?? "").includes("?") || !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
      send(400, { kind: "unavailable" });
      return;
    }
    let input;
    try {
      input = JSON.parse(await readBody(request));
    } catch {
      send(400, { kind: "unavailable" });
      return;
    }
    if (!input || Array.isArray(input) || typeof input !== "object"
      || Object.keys(input).some((key) => !["pin", "taxYear"].includes(key))
      || typeof input.pin !== "string" || !/^(?:\d{13}|[A-Z]\d{12})$/.test(input.pin)
      || input.taxYear !== 2025) {
      send(400, { kind: "unavailable" });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const onClose = () => { if (!response.writableFinished) controller.abort(); };
    response.on("close", onClose);
    try {
      const record = await fetchRecord(input.pin, input.taxYear, { signal: controller.signal });
      if (!record) send(502, { kind: "unavailable" });
      else send(200, { record });
    } catch {
      // County HTML, upstream URLs, and exception details may contain personal data.
      send(502, { kind: "unavailable" });
    } finally {
      clearTimeout(timeout);
      response.off("close", onClose);
    }
  };
}

export default createPropertyRecordHandler();
