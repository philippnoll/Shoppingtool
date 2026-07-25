"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const ProductMatcher = require("../scripts/lib/ProductMatcher");

test("matches conservative retailer product names", function () {
  assert.deepEqual(compact(ProductMatcher.match("Romatomaten")), {
    productKey: "tomaten",
    matchType: "offer-alias-exact",
    confidence: 0.98,
    matchedTerm: "romatomaten"
  });
  assert.deepEqual(compact(ProductMatcher.match("MEGGLE Feine Butter")), {
    productKey: "butter",
    matchType: "catalog-term",
    confidence: 0.95,
    matchedTerm: "butter"
  });
  assert.deepEqual(compact(ProductMatcher.match("WEIHENSTEPHAN Haltbare Milch")), {
    productKey: "milch",
    matchType: "catalog-term",
    confidence: 0.95,
    matchedTerm: "milch"
  });
  assert.deepEqual(compact(ProductMatcher.match("Deutsche Markenbutter")), {
    productKey: "butter",
    matchType: "offer-alias-term",
    confidence: 0.9,
    matchedTerm: "markenbutter"
  });
  assert.deepEqual(compact(ProductMatcher.match("GOLDEN SUN Langkorn Spitzenreis im Kochbeutel")), {
    productKey: "reis",
    matchType: "offer-alias-term",
    confidence: 0.9,
    matchedTerm: "spitzenreis"
  });
  assert.deepEqual(compact(ProductMatcher.match("Rote Äpfel")), {
    productKey: "aepfel",
    matchType: "catalog-term",
    confidence: 0.95,
    matchedTerm: "aepfel"
  });
});

test("rejects misleading compound and processed product names", function () {
  [
    "KANIA Tomatenketchup",
    "KANIA Tomaten-Ketchup",
    "COMBINO Tomaten-sauce",
    "BARESA Gehackte Tomaten"
  ].forEach(function (sRawName) {
    assert.deepEqual(compact(ProductMatcher.match(sRawName)), {
      productKey: null,
      matchType: "excluded",
      confidence: 0,
      matchedTerm: null
    });
  });

  ["Buttermilch", "Milchreis"].forEach(function (sRawName) {
    assert.deepEqual(compact(ProductMatcher.match(sRawName)), {
      productKey: null,
      matchType: "excluded",
      confidence: 0,
      matchedTerm: null
    });
  });

  assert.deepEqual(compact(ProductMatcher.match("Buttr")), {
    productKey: null,
    matchType: "none",
    confidence: 0,
    matchedTerm: null
  });
});

test("leaves names with multiple product matches ambiguous", function () {
  const oResult = ProductMatcher.match("Butter und Milch");

  assert.deepEqual(compact(oResult), {
    productKey: null,
    matchType: "ambiguous",
    confidence: 0,
    matchedTerm: null
  });
  assert.deepEqual(oResult.candidateKeys, ["butter", "milch"]);
});

function compact(oMatch) {
  return {
    productKey: oMatch.productKey,
    matchType: oMatch.matchType,
    confidence: oMatch.confidence,
    matchedTerm: oMatch.matchedTerm
  };
}
