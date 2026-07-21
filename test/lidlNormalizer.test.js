"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const LidlNormalizer = require("../scripts/lib/LidlNormalizer");
const oLidlFlyerSample = require("./fixtures/lidl-flyer-sample.json");

test("normalizes Lidl flyer metadata and pages", function () {
  const oResult = LidlNormalizer.normalizeFlyer(oLidlFlyerSample, {
    storeId: "lidl-gronauerstrasse-48599",
    fetchedAt: "2026-07-21T19:18:40.741Z"
  });

  assert.equal(oResult.source, "lidl-flyer");
  assert.equal(oResult.chain, "Lidl");
  assert.equal(oResult.storeId, "lidl-gronauerstrasse-48599");
  assert.equal(oResult.validFrom, "2026-07-20");
  assert.equal(oResult.validTo, "2026-07-25");
  assert.equal(oResult.pages.length, 1);
  assert.deepEqual(oResult.pages[0], {
    sourcePage: 3,
    rawKeywords: "Saison Highlight Romatomaten Lidl Plus -20%",
    rawDescription: "Saisonale Obst- und Gemüse-Highlights wie Romatomaten.",
    imageUrl: "https://example.test/lidl-page-3-zoom.jpg"
  });
});

test("rejects responses without a Lidl flyer", function () {
  assert.throws(function () {
    LidlNormalizer.normalizeFlyer({ success: false });
  }, /Lidl response with a flyer is required/);
});
