import assert from "node:assert/strict";
import { test } from "node:test";

import { extractHtmlText, findHits, loadTerms } from "../../scripts/check-tone.mjs";
import { CARD } from "../../scripts/og-card.mjs";

const terms = loadTerms();
const blocks = (text) => findHits([text], terms).filter((hit) => hit.tier === "block");

test("the headline that shipped until 2026-11-06 is blocked", () => {
  assert.equal(blocks("Follow the county’s money.").length, 1);
  assert.equal(blocks("Follow the money").length, 1);
  // The share image's alt text said this until 2026-11-06, and the first pattern missed it.
  assert.equal(blocks("Budget Explorer: follow Greenville County's money").length, 1);
});

test("the share card's words pass (the card is an image, so the page scan cannot read it)", () => {
  for (const text of Object.values(CARD)) {
    assert.deepEqual(blocks(text), [], `share card text: ${text}`);
  }
});

test("accusatory and alarm phrasing is blocked", () => {
  for (const text of [
    "See the hidden spending in your county.",
    "Where your money really goes.",
    "A wasteful line item.",
    "The county's bloated budget.",
    "Runaway spending since 2002.",
    "A staggering $30 million.",
  ]) {
    assert.ok(blocks(text).length > 0, `expected a block hit: ${text}`);
  }
});

test("neutral copy and the county's own names pass", () => {
  for (const text of [
    "The county budget, in plain terms.",
    "See where public money comes from, what it pays for, and how the choices have changed.",
    "Solid Waste Disposal",
    "Hidden Valley Road resurfacing",
    "The FY2027 budget programs $30,594,350 for road paving.",
    "Spending rose 4.1% from FY2026.",
  ]) {
    assert.deepEqual(blocks(text), [], `expected no block hit: ${text}`);
  }
});

test("extraction reads visible text, titles and meta text, and skips scripts", () => {
  const html = `<html><head><title>Budget</title><meta name="description" content="Hidden spending"></head>
    <body><h1>Follow the county&rsquo;s money.</h1><img alt="A wasteful chart">
    <script>self.__next_f.push("bloated")</script></body></html>`;
  const pieces = extractHtmlText(html);
  assert.ok(pieces.includes("Follow the county's money."));
  assert.ok(pieces.includes("Hidden spending"));
  assert.ok(pieces.includes("A wasteful chart"));
  assert.ok(!pieces.some((piece) => piece.includes("bloated")));
});
