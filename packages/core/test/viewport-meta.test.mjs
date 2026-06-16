import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { linkElementsByRel, linkHrefByRel, metaContentByName, viewportMetaDebug } from "../dist/technical-audit.js";

const cases = [
  {
    name: "passes width=device-width with initial scale",
    html: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>',
    expected: { viewportFound: true, viewportContent: "width=device-width, initial-scale=1", passed: true }
  },
  {
    name: "passes width=device-width only",
    html: '<html><head><meta name="viewport" content="width=device-width"></head></html>',
    expected: { viewportFound: true, viewportContent: "width=device-width", passed: true }
  },
  {
    name: "passes initial-scale and user-scalable without width",
    html: '<html><head><meta name="viewport" content="initial-scale=1,user-scalable=yes"></head></html>',
    expected: { viewportFound: true, viewportContent: "initial-scale=1,user-scalable=yes", passed: true }
  },
  {
    name: "passes uppercase name attribute",
    html: '<html><head><meta NAME="viewport" content="width=device-width"></head></html>',
    expected: { viewportFound: true, viewportContent: "width=device-width", passed: true }
  },
  {
    name: "passes mixed-case viewport value",
    html: '<html><head><meta name="ViewPort" content="initial-scale=1"></head></html>',
    expected: { viewportFound: true, viewportContent: "initial-scale=1", passed: true }
  },
  {
    name: "fails without viewport tag",
    html: "<html><head></head></html>",
    expected: { viewportFound: false, viewportContent: "", passed: false }
  },
  {
    name: "fails with empty content",
    html: '<html><head><meta name="viewport" content="   "></head></html>',
    expected: { viewportFound: true, viewportContent: "", passed: false }
  },
  {
    name: "fails with missing content",
    html: '<html><head><meta name="viewport"></head></html>',
    expected: { viewportFound: true, viewportContent: "", passed: false }
  }
];

for (const item of cases) {
  const result = viewportMetaDebug(cheerio.load(item.html));
  assert.equal(result.viewportFound, item.expected.viewportFound, item.name);
  assert.equal(result.viewportContent, item.expected.viewportContent, item.name);
  assert.equal(result.passed, item.expected.passed, item.name);
  if (item.expected.viewportFound) assert.match(result.rawViewportTag, /<meta/i, item.name);
}

{
  const $ = cheerio.load(`
    <html>
      <head>
        <meta NAME="Description" content="A useful page description">
        <meta name="twitter:CARD" content="summary_large_image">
        <link REL="canonical" href="https://example.com/page/">
        <link rel="preload stylesheet" as="style" href="/app.css">
        <link rel="PRELOAD" as="image" href="/hero.webp">
      </head>
    </html>
  `);

  assert.equal(metaContentByName($, "description"), "A useful page description");
  assert.equal(metaContentByName($, "twitter:card"), "summary_large_image");
  assert.equal(linkHrefByRel($, "canonical"), "https://example.com/page/");
  assert.equal(linkElementsByRel($, "preload").length, 2);
}

console.log(`technical helper tests passed (${cases.length + 4})`);
