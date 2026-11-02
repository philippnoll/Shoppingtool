"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const AldiNordOfferAdapter = require("../scripts/lib/AldiNordOfferAdapter");
const aStores = require("../data/stores.json");
const oFixture = require("./fixtures/aldi-nord-current-offers.json");

const REFERENCE_DATE = "2026-11-02";
const FETCHED_AT = oFixture.capture.retrievedAt;

function createPageHtml(oFixtureValue) {
  const oApiData = [["OFFER_GET", {
    req: oFixtureValue.page.request,
    res: {
      algoliaDataMap: oFixtureValue.products.reduce(function (mProducts, oProduct) {
        mProducts[oProduct.objectID] = oProduct;
        return mProducts;
      }, {}),
      categories: oFixtureValue.page.campaignWindows.map(function (oWindow) {
        return {
          title: oWindow.title,
          startDate: oWindow.startDate,
          endDate: oWindow.endDate
        };
      })
    }
  }]];
  const oNextData = {
    props: {
      pageProps: {
        page: {
          "@name": oFixtureValue.page.name,
          "@path": oFixtureValue.page.path
        },
        locale: oFixtureValue.page.locale,
        apiData: JSON.stringify(oApiData)
      }
    }
  };

  return "<!doctype html><script type=\"application/json\" id=\"__NEXT_DATA__\">" +
    JSON.stringify(oNextData) + "</script>";
}

function createDocuments(oFixtureValue, aStoreValues, sReferenceDate) {
  return AldiNordOfferAdapter.promotePage(
    createPageHtml(oFixtureValue || oFixture),
    aStoreValues || aStores,
    {
      referenceDate: sReferenceDate || REFERENCE_DATE,
      fetchedAt: FETCHED_AT,
      generatedAt: "2026-11-02T12:10:00.000Z"
    }
  );
}

test("normalizes real ALDI Nord fields and emits the common offer contract", function () {
  const oDocuments = createDocuments();
  const oOffer = oDocuments.optimizer.offers[0];
  const oRawButter = oDocuments.candidates.candidates.find(function (oCandidate) {
    return oCandidate.sourceProductId === "4704";
  });

  assert.deepEqual({
    storeId: oOffer.storeId,
    storeName: oOffer.storeName,
    chain: oOffer.chain,
    productKey: oOffer.productKey,
    offerName: oOffer.offerName,
    packageQuantity: oOffer.packageQuantity,
    packageUnit: oOffer.packageUnit,
    price: oOffer.price,
    validFrom: oOffer.validFrom,
    validTo: oOffer.validTo,
    sourceProductId: oOffer.sourceProductId
  }, {
    storeId: "aldi-nord-epe",
    storeName: "ALDI Nord Epe",
    chain: "ALDI Nord",
    productKey: "butter",
    offerName: "Butter",
    packageQuantity: 250,
    packageUnit: "g",
    price: 1.49,
    validFrom: "2026-11-02",
    validTo: "2026-11-07",
    sourceProductId: "4704"
  });
  assert.equal(oRawButter.salesUnit, "250-g-Packung");
  assert.equal(oRawButter.price, 1.49);
  assert.equal(oRawButter.regularPrice, null);
  assert.equal(oRawButter.productKey, null);
  assert.equal(oDocuments.candidates.sourceScope, "aldi-nord-chain");
  assert.equal(oDocuments.candidates.storeSelection.postalCode, "48599");
  assert.equal(oDocuments.optimizer.localApplicability.storeLevelStockKnown, false);
  assert.deepEqual(oOffer.localApplicability, {
    scope: "aldi-nord-chain",
    storeLevelStockKnown: false
  });
  assert.equal(oDocuments.optimizer.offerCount, 1);
  assert.equal(oDocuments.optimizer.offers[0].fetchedAt, FETCHED_AT);
});

test("rejects expired, future, unknown, excluded and ambiguous products with reasons", function () {
  const aCandidate = AldiNordOfferAdapter.createCandidates(
    AldiNordOfferAdapter.parsePage(createPageHtml(oFixture)),
    { fetchedAt: FETCHED_AT }
  );
  const oExpired = Object.assign({}, aCandidate[0], {
    validFrom: "2026-10-30",
    validTo: "2026-11-01"
  });
  const oFuture = Object.assign({}, aCandidate[0], {
    sourceProductId: "future-butter",
    validFrom: "2026-11-05"
  });
  const oUnknown = Object.assign({}, aCandidate[0], {
    sourceProductId: "unknown",
    rawName: "ALDI Mystery product"
  });
  const oExcluded = Object.assign({}, aCandidate[0], {
    sourceProductId: "excluded",
    rawName: "Buttermilch"
  });
  const oAmbiguous = Object.assign({}, aCandidate[0], {
    sourceProductId: "ambiguous",
    rawName: "Butter und Milch"
  });
  const oResult = AldiNordOfferAdapter.promote([
    oExpired,
    oFuture,
    oUnknown,
    oExcluded,
    oAmbiguous
  ], aStores, { referenceDate: REFERENCE_DATE });

  assert.equal(oResult.optimizerOffers.length, 0);
  assert.deepEqual(oResult.reviewEntries.map(function (oEntry) {
    return oEntry.reasons;
  }), [
    ["expired"],
    ["not-yet-valid"],
    ["unmatched-product"],
    ["excluded-product"],
    ["ambiguous-product"]
  ]);
});

test("keeps conditional prices and unsupported pack units out of optimizer offers", function () {
  const oDocuments = createDocuments();
  const oConditional = oDocuments.review.entries.find(function (oEntry) {
    return oEntry.candidate.sourceProductId === "1037558";
  });
  const oConditionalButter = Object.assign({}, oDocuments.candidates.candidates[0], {
    sourceProductId: "conditional-butter",
    conditionalPrice: true,
    priceLabels: [{ key: "additionalPromoTileText1", text: "4 kaufen +1 gratis" }]
  });
  const oUnsupportedPack = Object.assign({}, oDocuments.candidates.candidates[0], {
    sourceProductId: "unsupported-pack",
    salesUnit: "Dose",
    packageQuantity: null,
    packageUnit: null,
    packageCount: null,
    packageParseType: "unsupported",
    parserConfidence: 0.5
  });
  const oResult = AldiNordOfferAdapter.promote([
    oDocuments.candidates.candidates[0],
    oConditionalButter,
    oUnsupportedPack
  ], aStores, { referenceDate: REFERENCE_DATE });

  assert.ok(oConditional.reasons.includes("conditional-price"));
  assert.equal(AldiNordOfferAdapter.hasConditionalPrice([], {
    longDescription: "4 kaufen + 1 gratis"
  }), true);
  assert.deepEqual(oConditional.priceCondition, {
    type: "conditional-promotion",
    labels: [
      { key: "additionalPromoTileText1", text: "4 kaufen +1 gratis" },
      { key: "promoText1", text: "-20 %" }
    ],
    required: true
  });
  assert.deepEqual(oResult.reviewEntries[1].reasons, ["conditional-price"]);
  assert.ok(oResult.reviewEntries[2].reasons.includes("missing-package-quantity"));
  assert.ok(oResult.reviewEntries[2].reasons.includes("unsupported-package-unit"));
  assert.equal(oResult.optimizerOffers.length, 1);
});

test("does not promote a prepared rice dish as plain rice despite a shared matcher hit", function () {
  const oDocuments = createDocuments();
  const oDjuvec = oDocuments.review.entries.find(function (oEntry) {
    return oEntry.candidate.sourceProductId === "1015587";
  });

  assert.equal(oDjuvec.match.productKey, "reis");
  assert.ok(oDjuvec.reasons.includes("source-product-variant"));
  assert.equal(oDocuments.optimizer.offers.some(function (oOffer) {
    return oOffer.sourceProductId === "1015587";
  }), false);
});

test("rejects ambiguous sales units throughout candidate creation and promotion", function () {
  [
    "250-g-Packung/500-g-Packung",
    "250-g-Packung oder 500-g-Packung",
    "250 g + 50 g",
    "250-g-Packung (125 g Abtropfgewicht)",
    "6x0,33-L-Dose/0,5-L-Flasche",
    "250-g-unbekannt"
  ].forEach(function (sSalesUnit) {
    const oChangedFixture = JSON.parse(JSON.stringify(oFixture));
    oChangedFixture.products = [Object.assign({}, oChangedFixture.products[0], {
      salesUnit: sSalesUnit
    })];
    const oDocuments = createDocuments(oChangedFixture);
    const oCandidate = oDocuments.candidates.candidates[0];
    const oEntry = oDocuments.review.entries[0];

    assert.equal(oCandidate.salesUnit, sSalesUnit);
    assert.equal(oCandidate.rawOffer.salesUnit, sSalesUnit);
    assert.equal(oCandidate.packageQuantity, null, sSalesUnit);
    assert.equal(oCandidate.packageParseType, "unsupported");
    assert.equal(oCandidate.parserConfidence, 0.5);
    assert.ok(oEntry.reasons.includes("missing-package-quantity"));
    assert.ok(oEntry.reasons.includes("unsupported-package-unit"));
    assert.ok(oEntry.reasons.includes("low-parser-confidence"));
    assert.equal(oDocuments.optimizer.offerCount, 0, sSalesUnit);
    assert.equal(oDocuments.optimizer.localApplicability.scope, "aldi-nord-chain");
    assert.equal(oDocuments.optimizer.localApplicability.storeLevelStockKnown, false);
  });
});

test("excludes minimum-purchase and multi-buy conditions from all price text sources", function () {
  [
    "ab 2 Stück",
    "beim Kauf von 2 Packungen",
    "Ab 3 Packungen",
    "ab 2 Stk.",
    "ab 6 Flaschen",
    "bei Abnahme von mindestens 2 Bechern",
    "Mindestabnahme: 2 Packungen",
    "Mengenrabatt",
    "2 für 3,00 €",
    "2 zum Preis von 1",
    "2+1"
  ].forEach(function (sCondition) {
    ["currentPrice", "promotionPrice", "shortDescription", "longDescription"].forEach(function (sField) {
      const oChangedFixture = JSON.parse(JSON.stringify(oFixture));
      const oProduct = oChangedFixture.products[0];
      oChangedFixture.products = [oProduct];

      if (sField === "currentPrice" || sField === "promotionPrice") {
        const oPrice = sField === "currentPrice" ? oProduct.currentPrice : oProduct.promotionPrices[0];
        oPrice.priceTagLabels = { additionalPromoTileText1: sCondition };
      } else {
        oProduct[sField] = sCondition;
      }

      const oDocuments = createDocuments(oChangedFixture);
      const oEntry = oDocuments.review.entries[0];
      const sContext = sField + ": " + sCondition;

      assert.equal(oDocuments.candidates.candidates[0].conditionalPrice, true, sContext);
      assert.deepEqual(oEntry.reasons, ["conditional-price"], sContext);
      assert.equal(oEntry.priceCondition.type, "conditional-promotion");
      assert.equal(oEntry.priceCondition.required, true);
      assert.equal(oDocuments.optimizer.offerCount, 0, sContext);
    });
  });

  ["Preis-Highlight", "-20 %", "ab 02.11.2026", "ab Donnerstag", "250-g-Packung"].forEach(function (sText) {
    assert.equal(AldiNordOfferAdapter.hasConditionalPrice([{ text: sText }], {}), false, sText);
  });
});

test("deduplicates exact source rows without multiplying optimizer offers", function () {
  const oCandidates = AldiNordOfferAdapter.createCandidates(
    AldiNordOfferAdapter.parsePage(createPageHtml(oFixture)),
    { fetchedAt: FETCHED_AT }
  );
  const oResult = AldiNordOfferAdapter.promote([
    oCandidates[0],
    Object.assign({}, oCandidates[0], { rawName: "Butter", price: 1.49 })
  ], aStores, { referenceDate: REFERENCE_DATE });

  assert.equal(oResult.optimizerOffers.length, 1);
  assert.deepEqual(oResult.reviewEntries[1].reasons, ["duplicate-candidate"]);
  assert.equal(oResult.summary.duplicateCount, 1);
});

test("rejects regional mismatches, malformed source fields and changed page shapes", function () {
  const oCandidates = AldiNordOfferAdapter.createCandidates(
    AldiNordOfferAdapter.parsePage(createPageHtml(oFixture)),
    { fetchedAt: FETCHED_AT }
  );
  const oWrongStore = Object.assign({}, oCandidates[0], { storeId: "penny-epe" });
  const oWrongChain = Object.assign({}, oCandidates[0], { chain: "PENNY" });
  const oMalformed = Object.assign({}, oCandidates[0], {
    price: null,
    validFrom: "2026-99-99",
    sourceProductId: null,
    storeId: null
  });
  const oPriceMismatch = Object.assign({}, oCandidates[0], {
    sourceProductId: "mismatched-price",
    promotionPrice: 1.39,
    priceMismatch: true
  });
  const oResult = AldiNordOfferAdapter.promote([
    oWrongStore,
    oWrongChain,
    oMalformed,
    oPriceMismatch
  ], aStores, { referenceDate: REFERENCE_DATE });

  assert.ok(oResult.reviewEntries[0].reasons.includes("store-chain-mismatch"));
  assert.ok(oResult.reviewEntries[1].reasons.includes("invalid-chain"));
  assert.ok(oResult.reviewEntries[2].reasons.includes("invalid-valid-from"));
  assert.ok(oResult.reviewEntries[2].reasons.includes("invalid-price"));
  assert.ok(oResult.reviewEntries[2].reasons.includes("missing-source-product-id"));
  assert.ok(oResult.reviewEntries[2].reasons.includes("missing-store-id"));
  assert.deepEqual(oResult.reviewEntries[3].reasons, ["price-source-mismatch"]);

  const oOtherStoreCandidate = Object.assign({}, oCandidates[0], {
    storeId: "aldi-nord-other"
  });
  const oOtherStoreResult = AldiNordOfferAdapter.promote([
    oOtherStoreCandidate
  ], aStores.concat([{ id: "aldi-nord-other", chain: "ALDI Nord" }]), {
    referenceDate: REFERENCE_DATE
  });

  assert.deepEqual(oOtherStoreResult.reviewEntries[0].reasons, ["not-target-store"]);
  assert.throws(function () {
    AldiNordOfferAdapter.parsePage("<html><body>layout changed</body></html>");
  }, /__NEXT_DATA__ was not found/);

  const oChangedPage = JSON.parse(createPageHtml(oFixture).match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
  oChangedPage.props.pageProps.apiData = JSON.stringify([["OTHER_API", {}]]);
  assert.throws(function () {
    AldiNordOfferAdapter.parsePage(
      "<script id=\"__NEXT_DATA__\">" + JSON.stringify(oChangedPage) + "</script>"
    );
  }, /OFFER_GET response is missing/);
});

test("parses common ALDI sales-unit forms without inventing missing quantities", function () {
  assert.deepEqual(AldiNordOfferAdapter.parseSalesUnit("250-g-Packung"), {
    quantity: 250,
    unit: "g",
    count: 1,
    parseType: "measured-pack"
  });
  assert.deepEqual(AldiNordOfferAdapter.parseSalesUnit("6x0,33-L-Dose"), {
    quantity: 1.98,
    unit: "l",
    count: 6,
    parseType: "multipack-measure"
  });
  assert.deepEqual(AldiNordOfferAdapter.parseSalesUnit("1.000-g-Packung"), {
    quantity: 1000,
    unit: "g",
    count: 1,
    parseType: "measured-pack"
  });
  assert.deepEqual(AldiNordOfferAdapter.parseSalesUnit("3er-Packung"), {
    quantity: 3,
    unit: "Stk",
    count: 3,
    parseType: "count-pack"
  });
  assert.equal(AldiNordOfferAdapter.parseSalesUnit("kg-Preis").quantity, null);
  assert.equal(AldiNordOfferAdapter.parseSalesUnit("Stück/2er-Packung").quantity, null);
  [
    ["250 g", 250, "g", 1],
    ["650-g-Schale", 650, "g", 1],
    ["1-L-Packung", 1, "l", 1],
    ["800-g-Dose", 800, "g", 1],
    ["500 ml Flasche", 500, "ml", 1],
    ["2 × 125-g-Becher", 250, "g", 2],
    [" 1-kg-Netz ", 1, "kg", 1]
  ].forEach(function (aPack) {
    const oPack = AldiNordOfferAdapter.parseSalesUnit(aPack[0]);
    assert.equal(oPack.quantity, aPack[1], aPack[0]);
    assert.equal(oPack.unit, aPack[2], aPack[0]);
    assert.equal(oPack.count, aPack[3], aPack[0]);
  });
});

test("fixture provenance points at a genuine public source sample", function () {
  assert.equal(oFixture.capture.sourceUrl, AldiNordOfferAdapter.SOURCE_URL);
  assert.equal(oFixture.products.find(function (oProduct) {
    return oProduct.objectID === "4704";
  }).name, "Butter");
  assert.equal(fs.existsSync(require.resolve("./fixtures/aldi-nord-current-offers.json")), true);
});
