"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const LidlOfferPromoter = require("../scripts/lib/LidlOfferPromoter");
const aStores = require("../data/stores.json");

const REFERENCE_DATE = "2026-07-23";

test("promotes only safe matches into the optimizer offer contract", function () {
  const oResult = promote([
    createCandidate({
      rawName: "MEGGLE Feine Butter",
      packageQuantity: 250,
      packageUnit: "g",
      price: 1.49
    })
  ]);

  assert.deepEqual(oResult.optimizerOffers, [
    {
      storeId: "lidl-gronauerstrasse-48599",
      storeName: "Lidl Gronauer Strasse",
      chain: "Lidl",
      productKey: "butter",
      offerName: "MEGGLE Feine Butter",
      packageQuantity: 250,
      packageUnit: "g",
      price: 1.49,
      validFrom: "2026-07-20",
      validTo: "2026-07-25",
      source: "lidl-pdf",
      sourcePage: 3,
      priceType: "offer",
      priceCondition: null,
      parserConfidence: 0.9,
      matchType: "catalog-term",
      matchConfidence: 0.95,
      matchedTerm: "butter"
    }
  ]);
  assert.equal(oResult.reviewEntries[0].status, "optimizer-ready");
  assert.deepEqual(oResult.reviewEntries[0].parser, { confidence: 0.9 });
  assert.equal(oResult.reviewEntries[0].match.confidence, 0.95);
  assert.equal(oResult.summary.optimizerReadyCount, 1);
  assert.equal(oResult.summary.reviewCount, 0);
});

test("reports unmatched, excluded, ambiguous and conditional candidates separately", function () {
  const oResult = promote([
    createCandidate({ rawName: "Unbekanntes Produkt" }),
    createCandidate({ rawName: "KANIA Tomatenketchup", sourcePage: 4 }),
    createCandidate({ rawName: "Butter und Milch", sourcePage: 5 }),
    createCandidate({ rawName: "Romatomaten", priceType: "lidl-plus", sourcePage: 6 })
  ]);

  assert.equal(oResult.optimizerOffers.length, 0);
  assert.deepEqual(oResult.reviewEntries.map(function (oEntry) {
    return {
      matchType: oEntry.match.matchType,
      reasons: oEntry.reasons
    };
  }), [
    { matchType: "none", reasons: ["unmatched-product"] },
    { matchType: "excluded", reasons: ["excluded-product"] },
    { matchType: "ambiguous", reasons: ["ambiguous-product"] },
    { matchType: "offer-alias-exact", reasons: ["lidl-plus-required"] }
  ]);
  assert.deepEqual(oResult.reviewEntries[3].priceCondition, {
    type: "loyalty-program",
    program: "Lidl Plus",
    required: true
  });
  assert.deepEqual(oResult.summary.reasonCounts, {
    "ambiguous-product": 1,
    "excluded-product": 1,
    "lidl-plus-required": 1,
    "unmatched-product": 1
  });
});

test("rejects incomplete, unknown, low-confidence and currently invalid candidates with reasons", function () {
  const oResult = promote([
    createCandidate({ price: null }),
    createCandidate({ storeId: "unknown-store", sourcePage: 4 }),
    createCandidate({ confidence: 0.75, sourcePage: 5 }),
    createCandidate({ validTo: "2026-07-22", sourcePage: 6 }),
    createCandidate({ validFrom: "2026-07-24", validTo: "2026-07-25", sourcePage: 7 })
  ]);

  assert.equal(oResult.optimizerOffers.length, 0);
  assert.deepEqual(oResult.reviewEntries.map(function (oEntry) {
    return oEntry.reasons;
  }), [
    ["invalid-price"],
    ["unknown-store"],
    ["low-parser-confidence"],
    ["expired"],
    ["not-yet-valid"]
  ]);
});

test("reports every malformed required source field", function () {
  const oResult = promote([
    createCandidate({
      source: "unknown",
      chain: "unknown",
      rawName: "",
      storeId: null,
      validFrom: "2026-99-99",
      validTo: null,
      sourcePage: 0,
      packageQuantity: 0,
      packageUnit: "box",
      price: null,
      priceType: "unknown",
      confidence: 2,
      sourcePosition: null
    })
  ]);

  assert.deepEqual(oResult.reviewEntries[0].reasons, [
    "invalid-source",
    "invalid-chain",
    "missing-raw-name",
    "missing-store-id",
    "invalid-valid-from",
    "invalid-valid-to",
    "invalid-source-page",
    "invalid-package-quantity",
    "unsupported-package-unit",
    "invalid-price",
    "unsupported-price-type",
    "invalid-parser-confidence",
    "invalid-source-position",
    "unmatched-product"
  ]);
});

test("deduplicates candidates by stable source fields", function () {
  const oCandidate = createCandidate();
  const oResult = promote([oCandidate, Object.assign({}, oCandidate, {
    rawName: "MEGGLE Feine Butter",
    price: 1.49
  })]);

  assert.equal(oResult.optimizerOffers.length, 1);
  assert.equal(oResult.reviewEntries[0].status, "optimizer-ready");
  assert.deepEqual(oResult.reviewEntries[1].reasons, ["duplicate-candidate"]);
  assert.equal(oResult.summary.reasonCounts["duplicate-candidate"], 1);
});

test("builds review and optimizer documents from a candidate document", function () {
  const oDocuments = LidlOfferPromoter.promoteDocument({
    source: "lidl-pdf",
    flyerId: "flyer-1",
    storeId: "lidl-gronauerstrasse-48599",
    validFrom: "2026-07-20",
    validTo: "2026-07-25",
    offers: [createCandidate()]
  }, aStores, {
    referenceDate: REFERENCE_DATE,
    generatedAt: "2026-07-23T12:00:00.000Z"
  });

  assert.equal(oDocuments.review.kind, "lidl-offer-review");
  assert.equal(oDocuments.review.flyerId, "flyer-1");
  assert.equal(oDocuments.review.entries.length, 1);
  assert.equal(oDocuments.optimizer.kind, "optimizer-ready-offers");
  assert.equal(oDocuments.optimizer.offerCount, 1);
  assert.equal(oDocuments.optimizer.offers[0].productKey, "tomaten");
  assert.equal(oDocuments.optimizer.generatedAt, "2026-07-23T12:00:00.000Z");
});

function promote(aCandidates) {
  return LidlOfferPromoter.promote(aCandidates, aStores, {
    referenceDate: REFERENCE_DATE
  });
}

function createCandidate(oOverrides) {
  return Object.assign({
    source: "lidl-pdf",
    chain: "Lidl",
    storeId: "lidl-gronauerstrasse-48599",
    validFrom: "2026-07-20",
    validTo: "2026-07-25",
    sourcePage: 3,
    rawName: "Romatomaten",
    productKey: null,
    packageQuantity: 500,
    packageUnit: "g",
    packageCount: 1,
    itemQuantity: 500,
    price: 1.11,
    regularPrice: null,
    basePrice: 2.22,
    basePriceUnit: "kg",
    priceType: "offer",
    confidence: 0.9,
    sourcePosition: {
      x: 100,
      y: 200
    }
  }, oOverrides);
}
