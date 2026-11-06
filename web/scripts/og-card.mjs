#!/usr/bin/env node
/**
 * Renders the site's one share card, public/og.png (1200x630).
 *
 *   node scripts/og-card.mjs [output.png]
 *
 * The card used to be a hand-made PNG with no source in the repo, so when the homepage
 * headline changed on 2026-11-06 the old headline and a stale "FY2002–FY2026" kept travelling
 * in every link preview. The words now live in CARD below, the tone test reads them, and the
 * card carries no end year so it cannot go stale when a new budget is added.
 *
 * No figures on the card: a dollar amount in an image travels without its citation.
 */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const CARD = {
  eyebrow: "Greenville County, South Carolina",
  headline: "The county budget, in plain terms.",
  subhead: "Where public money comes from, what it pays for, and how it has changed since FY2002. Every figure cited to its source page.",
  domain: "gcdata.alexreynolds.com",
};

// The tributary mark from src/app/icon.svg, without its tile background.
const MARK_PATHS = `
  <g fill="none" stroke-width="7" stroke-linecap="butt">
    <path d="M2 12 C 18 12, 18 26.5, 30 26.5" stroke="#1c1b18"/>
    <path d="M2 32 H 30" stroke="#1c1b18"/>
    <path d="M2 52 C 18 52, 18 37.5, 30 37.5" stroke="#1c1b18"/>
    <path d="M34 26.5 C 46 26.5, 46 12, 62 12" stroke="#c99320"/>
    <path d="M34 32 H 62" stroke="#5a52a6"/>
    <path d="M34 37.5 C 46 37.5, 46 52, 62 52" stroke="#b23a24"/>
  </g>
  <rect x="26" y="21" width="12" height="22" rx="3.5" fill="#00795a"/>`;

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function cardHtml(card = CARD) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fafaf8; }
  .card { position: relative; width: 1200px; height: 630px; box-sizing: border-box; padding: 64px 0 0 70px; }
  .eyebrow { font: 500 17px/1 "IBM Plex Mono", monospace; letter-spacing: 0.22em; text-transform: uppercase; color: #5f5d57; }
  h1 { margin: 34px 0 0; width: 650px; font: 600 82px/1.02 "Fraunces", serif; letter-spacing: -0.025em; color: #1c1b18; }
  .sub { margin: 28px 0 0; width: 650px; font: 400 25px/1.42 "IBM Plex Sans", sans-serif; color: #5f5d57; }
  .foot { position: absolute; left: 70px; bottom: 50px; display: flex; align-items: center; gap: 14px; font: 500 21px/1 "IBM Plex Mono", monospace; color: #00795a; }
  .mark { position: absolute; right: -40px; top: 150px; width: 400px; height: 400px; }
</style></head><body><div class="card">
  <div class="eyebrow">${escape(card.eyebrow)}</div>
  <h1>${escape(card.headline)}</h1>
  <p class="sub">${escape(card.subhead)}</p>
  <div class="foot"><svg width="36" height="36" viewBox="0 0 64 64">${MARK_PATHS}</svg>${escape(card.domain)}</div>
  <svg class="mark" viewBox="0 0 64 64">${MARK_PATHS}</svg>
</div></body></html>`;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = process.argv[2] ?? join(here, "..", "public", "og.png");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(cardHtml(), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() =>
    ["Fraunces", "IBM Plex Mono", "IBM Plex Sans"].filter((f) => !document.fonts.check(`16px "${f}"`)),
  );
  if (missing.length) throw new Error(`fonts did not load: ${missing.join(", ")}`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log(`wrote ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
