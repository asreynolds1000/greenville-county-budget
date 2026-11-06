#!/usr/bin/env node
/**
 * Tone check over the SERVED copy of the static export.
 *
 *   node scripts/check-tone.mjs [out-dir]        (default: out)
 *
 * Reads every .html and .txt file the site serves, extracts what a reader (or a link
 * preview, or a screen reader) actually gets — visible text, <title>, meta descriptions,
 * Open Graph and Twitter text, alt, aria-label and title attributes — and matches it
 * against tone-terms.tsv. Block hits exit 1; review hits are printed for a person.
 *
 * It scans the built output, not the source, because copy is assembled from components,
 * data and metadata, and the export is the only place the whole sentence exists.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadTerms(path = join(HERE, "..", "tone-terms.tsv")) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const [tier, pattern, why = ""] = line.split("\t");
      if (tier !== "block" && tier !== "review") throw new Error(`bad tier in tone-terms.tsv: ${line}`);
      return { tier, pattern, why, re: new RegExp(pattern, "gi") };
    });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: "-", ndash: "-", hellip: "..." };

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function normalize(text) {
  return decode(text).replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** Every piece of reader-facing text in one HTML document, one string per piece. */
export function extractHtmlText(html) {
  const pieces = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) pieces.push(title[1]);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = tag.match(/\b(?:name|property)\s*=\s*"([^"]+)"/i)?.[1] ?? "";
    if (/^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/i.test(key)) {
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1];
      if (content) pieces.push(content);
    }
  }
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/i, " ");
  for (const m of body.matchAll(/\b(?:alt|aria-label|title)\s*=\s*"([^"]+)"/gi)) pieces.push(m[1]);
  // Block-level tags become sentence breaks so a match cannot straddle two elements.
  pieces.push(...body.replace(/<\/?(p|div|li|h[1-6]|section|nav|header|footer|tr|td|th|br|dt|dd|figcaption|caption|option|button|a)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").split("\n"));
  return pieces.map(normalize).filter(Boolean);
}

export function findHits(pieces, terms) {
  const hits = [];
  for (const raw of pieces) {
    const piece = normalize(raw);
    for (const term of terms) {
      term.re.lastIndex = 0;
      for (const m of piece.matchAll(term.re)) {
        const start = Math.max(0, m.index - 60);
        hits.push({ tier: term.tier, pattern: term.pattern, why: term.why, match: m[0], context: piece.slice(start, m.index + m[0].length + 60) });
      }
    }
  }
  return hits;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function main() {
  const outDir = process.argv[2] ?? "out";
  const terms = loadTerms();
  // index.txt and __next.*.txt beside each page are Next's RSC payload, not reader text.
  const files = walk(outDir).filter((f) => {
    const name = f.split("/").pop();
    return name.endsWith(".html") || (name.endsWith(".txt") && name !== "index.txt" && !name.startsWith("__next"));
  });
  if (files.length === 0) {
    console.error(`check-tone: no .html or .txt files under ${outDir}. Build first.`);
    process.exit(2);
  }
  const byKey = new Map();
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const pieces = file.endsWith(".html") ? extractHtmlText(raw) : raw.split("\n").map(normalize).filter(Boolean);
    for (const hit of findHits(pieces, terms)) {
      const key = `${hit.tier}\t${hit.match.toLowerCase()}\t${hit.context}`;
      const entry = byKey.get(key) ?? { ...hit, files: [] };
      entry.files.push(relative(outDir, file));
      byKey.set(key, entry);
    }
  }
  const entries = [...byKey.values()];
  const blocks = entries.filter((e) => e.tier === "block");
  for (const tier of ["block", "review"]) {
    for (const e of entries.filter((x) => x.tier === tier)) {
      const where = e.files.length > 3 ? `${e.files.slice(0, 3).join(", ")} and ${e.files.length - 3} more` : e.files.join(", ");
      console.log(`[${tier.toUpperCase()}] "${e.match}" (${e.why})\n    ...${e.context}...\n    in ${where}`);
    }
  }
  console.log(`\ncheck-tone: ${files.length} files, ${blocks.length} block, ${entries.length - blocks.length} review`);
  process.exit(blocks.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
