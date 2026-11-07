"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const KkOfferPromoter = require("../scripts/lib/KkOfferPromoter");

const REFERENCE_DATE = "2026-11-03";
const aTestStores = [
  {
    id: "kk-epe-test-west",
    chain: "K+K",
    name: "K+K test store West",
    postalCode: "48599",
    city: "Gronau-Epe"
  },
  {
    id: "kk-epe-test-east",
    chain: "K+K",
    name: "K+K test store East",
    postalCode: "48599",
    city: "Gronau-Epe"
  }
];

test("holds store-ready source offers until store selection is explicit", function () {
  const oDocuments = KkOfferPromoter.promoteDocument(createCandidateDocument(), aTestStores, {
    referenceDate: REFERENCE_DATE,
    generatedAt: "2026-11-03T12:00:00.000Z"
  });

  assert.equal(oDocuments.review.storeSelectionStatus, "pending");
  assert.deepEqual(oDocuments.review.storeIds, []);
  assert.equal(oDocuments.optimizer.offerCount, 0);
  assert.equal(oDocuments.review.summary.optimizerReadyCount, 0);
  assert.ok(oDocuments.review.entries[0].reasons.includes("store-selection-pending"));
  assert.ok(oDocuments.review.entries[1].reasons.includes("missing-package-quantity"));
  assert.ok(oDocuments.review.entries[1].reasons.includes("missing-price"));
});

test("fans one shared source offer out to explicitly selected Epe stores without losing identity", function () {
  const oDocuments = KkOfferPromoter.promoteDocument(createCandidateDocument(), aTestStores, {
    referenceDate: REFERENCE_DATE,
    generatedAt: "2026-11-03T12:00:00.000Z",
    storeIds: ["kk-epe-test-west", "kk-epe-test-east"]
  });

  assert.equal(oDocuments.review.storeSelectionStatus, "explicit");
  assert.equal(oDocuments.optimizer.offerCount, 2);
  assert.equal(oDocuments.optimizer.businessOfferCount, 1);
  assert.equal(oDocuments.review.summary.optimizerReadyBusinessCount, 1);
  assert.equal(oDocuments.optimizer.offers[0].sourceOfferId, oDocuments.optimizer.offers[1].sourceOfferId);
  assert.deepEqual(oDocuments.optimizer.offers.map(function (oOffer) {
    return oOffer.storeId;
  }), ["kk-epe-test-west", "kk-epe-test-east"]);
  assert.deepEqual(oDocuments.optimizer.offers[0], {
    storeId: "kk-epe-test-west",
    storeName: "K+K test store West",
    chain: "K+K",
    productKey: "nudeln",
    offerName: "Barilla La Collezione",
    packageQuantity: 500,
    packageUnit: "g",
    price: 1.99,
    validFrom: "2026-11-02",
    validTo: "2026-11-07",
    source: "kk-catalog-text",
    sourcePage: 8,
    priceType: "offer",
    priceCondition: null,
    parserConfidence: 0.93,
    matchType: "offer-alias-exact",
    matchConfidence: 0.98,
    matchedTerm: "barilla la collezione",
    sourceOfferId: "kundk_kw45:barilla-la-collezione"
  });
  assert.equal(oDocuments.review.entries[0].status, "optimizer-ready");
  assert.equal(oDocuments.review.entries[1].status, "review");
});

test("keeps expired candidates out of optimizer-ready output", function () {
  const oCandidateDocument = createCandidateDocument();
  oCandidateDocument.candidates[0].validTo = "2026-11-02";
  const oDocuments = KkOfferPromoter.promoteDocument(oCandidateDocument, aTestStores, {
    referenceDate: REFERENCE_DATE,
    storeIds: ["kk-epe-test-west"]
  });

  assert.equal(oDocuments.optimizer.offerCount, 0);
  assert.ok(oDocuments.review.entries[0].reasons.includes("expired"));
});

test("rejects store IDs outside the verified K+K Epe source scope", function () {
  assert.throws(function () {
    KkOfferPromoter.promoteDocument(createCandidateDocument(), [
      {
        id: "kk-other-city",
        chain: "K+K",
        name: "K+K elsewhere",
        postalCode: "48600",
        city: "Other town"
      }
    ], {
      referenceDate: REFERENCE_DATE,
      storeIds: ["kk-other-city"]
    });
  }, /limited to the verified 48599 Epe store area/);
});

function createCandidateDocument() {
  return {
    kind: "kk-offer-candidates",
    source: "kk-catalog-text",
    chain: "K+K",
    flyerId: "kundk_kw45",
    catalogId: "kundk_kw45",
    validFrom: "2026-11-02",
    validTo: "2026-11-07",
    candidates: [
      {
        sourceOfferId: "kundk_kw45:barilla-la-collezione",
        source: "kk-catalog-text",
        chain: "K+K",
        rawName: "Barilla La Collezione",
        validFrom: "2026-11-02",
        validTo: "2026-11-07",
        sourcePage: 8,
        packageQuantity: 500,
        packageUnit: "g",
        price: 1.99,
        priceType: "offer",
        confidence: 0.93,
        sourceEvidence: {
          textUrl: "https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45/text/bk_8.txt",
          excerpt: "Barilla La Collezione 500g Packung 1kg = 3.98"
        }
      },
      {
        sourceOfferId: "kundk_kw45:tafelaepfel",
        source: "kk-catalog-text",
        chain: "K+K",
        rawName: "Tafeläpfel",
        validFrom: "2026-11-02",
        validTo: "2026-11-07",
        sourcePage: 4,
        packageQuantity: null,
        packageUnit: null,
        price: null,
        priceType: "offer",
        confidence: 0.25,
        sourceEvidence: {
          textUrl: "https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/catalogs/kundk_kw45/text/bk_4.txt",
          excerpt: "TAFELÄPFEL aus dem Alten Land",
          reviewHints: ["package-quantity-not-explicitly-associated-with-the-item"]
        }
      }
    ]
  };
}
