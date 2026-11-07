"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();
const OfferData = oLoader.load("shoppingtool/model/OfferData", "webapp/model/OfferData.js");
const OfferModel = oLoader.load("shoppingtool/model/OfferModel", "webapp/model/OfferModel.js");
const oFixture = require("./fixtures/optimizer-ready-offers.json");
const aStores = require("../data/stores.json");

function clone(vValue) {
  return JSON.parse(JSON.stringify(vValue));
}

function createFetch(oSnapshot, aStoreList, fFailure) {
  return function (sUrl) {
    if (fFailure) {
      return Promise.reject(new Error("network failure"));
    }

    const vDocument = sUrl.indexOf("stores.json") !== -1 ? aStoreList : oSnapshot;
    return Promise.resolve({
      ok: true,
      json: function () {
        return Promise.resolve(vDocument);
      }
    });
  };
}

function createModel() {
  let oData = {};

  return {
    setData: function (oNewData) {
      oData = oNewData;
    },
    getProperty: function (sPath) {
      return sPath.split("/").filter(Boolean).reduce(function (vCurrent, sPart) {
        return vCurrent && vCurrent[sPart];
      }, oData);
    },
    getData: function () {
      return oData;
    }
  };
}

test("loads the optimizer-ready contract and filters invalid, expired, future, wrong-store and conditional offers", async function () {
  const oResult = await OfferData.load({
    fetch: createFetch(oFixture, aStores),
    now: "2026-07-23"
  });

  assert.deepEqual(oResult.offers.map(function (oOffer) {
    return oOffer.productKey;
  }), ["butter", "tomaten", "milch"]);
  assert.equal(oResult.excludedCount, 5);
  assert.deepEqual(oResult.excludedReasons.sort(), [
    "conditional-price",
    "expired",
    "not-yet-valid",
    "store-identity-mismatch",
    "unknown-store"
  ]);
  assert.equal(oResult.referenceDate, "2026-07-23");
  assert.equal(oResult.isDemo, true);
});

test("accepts offers on both inclusive validity-date boundaries", function () {
  const oSnapshot = clone(oFixture);
  oSnapshot.offers[0].validFrom = "2026-07-23";
  oSnapshot.offers[0].validTo = "2026-07-23";

  const oResult = OfferData.filterSnapshot(oSnapshot, aStores, "2026-07-23");

  assert.equal(oResult.offers[0].productKey, "butter");
});

test("excludes malformed prices, quantities, units, and dates instead of sending them to the optimizer", function () {
  const oSnapshot = clone(oFixture);
  oSnapshot.offers[0].price = 0;
  oSnapshot.offers[1].packageQuantity = "500";
  oSnapshot.offers[2].validFrom = "2026-99-99";

  const oResult = OfferData.filterSnapshot(oSnapshot, aStores, "2026-07-23");
  const oUnitResult = OfferData.filterSnapshot(Object.assign({}, oFixture, {
    offers: oFixture.offers.map(function (oOffer, iIndex) {
      return iIndex === 0 ? Object.assign({}, oOffer, { packageUnit: "box" }) : oOffer;
    })
  }), aStores, "2026-07-23");

  assert.deepEqual(oResult.offers, []);
  assert.equal(oResult.excludedCount, 8);
  assert.equal(oResult.excludedReasons.filter(function (sReason) {
    return sReason === "invalid-offer";
  }).length, 2);
  assert.equal(oResult.excludedReasons.filter(function (sReason) {
    return sReason === "invalid-validity";
  }).length, 1);
  assert.equal(oUnitResult.excludedReasons.filter(function (sReason) {
    return sReason === "invalid-offer";
  }).length, 1);
});

test("rejects malformed envelopes and store catalogs", function () {
  assert.throws(function () {
    OfferData.filterSnapshot({ kind: "lidl-offer-review", offers: [] }, aStores, "2026-07-23");
  }, { code: "invalid-offer-snapshot" });
  assert.throws(function () {
    OfferData.filterSnapshot(oFixture, [], "2026-07-23");
  }, { code: "invalid-store-catalog" });
  assert.throws(function () {
    OfferData.filterSnapshot(Object.assign({}, oFixture, { offerCount: 1 }), aStores, "2026-07-23");
  }, { code: "invalid-offer-snapshot" });
});

test("handles a valid snapshot with no offers as an empty result", async function () {
  const oSnapshot = { kind: "optimizer-ready-offers", source: "lidl-pdf", offerCount: 0, offers: [] };
  const oResult = await OfferData.load({
    fetch: createFetch(oSnapshot, aStores),
    now: "2026-07-23"
  });

  assert.deepEqual(oResult.offers, []);
  assert.equal(oResult.excludedCount, 0);
});

test("shows a useful request error and a later retry can load offers", async function () {
  const oModel = createModel();
  let bFail = true;
  const fFetch = function (sUrl) {
    if (bFail) {
      return Promise.reject(new Error("offline"));
    }

    return createFetch(oFixture, aStores)(sUrl);
  };

  await OfferModel.refresh(oModel, { fetch: fFetch, now: "2026-07-23" });
  assert.equal(oModel.getProperty("/status"), "error");
  assert.match(oModel.getProperty("/errorMessage"), /veröffentlichen|Server/);
  assert.doesNotMatch(oModel.getProperty("/errorMessage"), /\//);

  bFail = false;
  await OfferModel.refresh(oModel, { fetch: fFetch, now: "2026-07-23" });
  assert.equal(oModel.getProperty("/status"), "ready");
  assert.equal(oModel.getProperty("/offers").length, 3);
  assert.equal(oModel.getProperty("/loading"), false);
});

test("sets an actionable empty model state when a snapshot has no current offers", async function () {
  const oModel = createModel();

  await OfferModel.refresh(oModel, {
    fetch: createFetch({ kind: "optimizer-ready-offers", source: "lidl-pdf", offerCount: 0, offers: [] }, aStores),
    now: "2026-07-23"
  });

  assert.equal(oModel.getProperty("/status"), "empty");
  assert.equal(oModel.getProperty("/offers").length, 0);
  assert.equal(oModel.getProperty("/errorMessage"), "");
});

test("requests only the fixed same-origin offer and store resources", async function () {
  const aUrls = [];

  await OfferData.load({
    fetch: function (sUrl) {
      aUrls.push(sUrl);
      return createFetch(oFixture, aStores)(sUrl);
    },
    now: "2026-07-23"
  });

  assert.deepEqual(aUrls.sort(), ["data/offers/optimizer-ready.json", "data/stores.json"]);
});

test("requires a supported document source even for empty snapshots", function () {
  [undefined, null, "", "unknown", "toString", {}, "test-fixture "].forEach(function (vSource) {
    assert.throws(function () {
      OfferData.filterSnapshot({
        kind: "optimizer-ready-offers", source: vSource, offers: []
      }, aStores, "2026-07-23");
    }, { code: "invalid-offer-snapshot" });
  });
});

test("accepts supported production provenance without enabling demo mode", function () {
  const oOffer = Object.assign({}, oFixture.offers[0], { source: "lidl-pdf" });
  const oResult = OfferData.filterSnapshot({
    kind: "optimizer-ready-offers", source: "lidl-pdf", offers: [oOffer]
  }, aStores, "2026-07-23");

  assert.deepEqual(oResult.offers, [oOffer]);
  assert.equal(oResult.isDemo, false);
});

test("rejects mixed fixture and production documents in both directions", async function () {
  for (const sSource of ["lidl-pdf", "test-fixture"]) {
    const oSnapshot = {
      kind: "optimizer-ready-offers",
      source: sSource,
      offers: [
        Object.assign({}, oFixture.offers[0], { source: "lidl-pdf" }),
        clone(oFixture.offers[2])
      ]
    };

    assert.throws(function () {
      OfferData.filterSnapshot(oSnapshot, aStores, "2026-07-23");
    }, { code: "invalid-offer-snapshot" });

    const oModel = createModel();
    await OfferModel.refresh(oModel, { fetch: createFetch(oFixture, aStores), now: "2026-07-23" });
    await OfferModel.refresh(oModel, { fetch: createFetch(oSnapshot, aStores), now: "2026-07-23" });
    assert.equal(oModel.getProperty("/status"), "error");
    assert.deepEqual(oModel.getProperty("/offers"), []);
    assert.match(oModel.getProperty("/errorMessage"), /optimizer-ready Snapshot/);
  }
});

test("excludes missing and unsupported offer sources and wrong source-chain assignments", function () {
  ["lidl-pdf", "test-fixture"].forEach(function (sSource) {
    const aOffers = [undefined, null, "", "unknown", "toString", {}].map(function (vSource) {
      return Object.assign({}, oFixture.offers[0], { source: vSource });
    });
    const oResult = OfferData.filterSnapshot({
      kind: "optimizer-ready-offers", source: sSource, offers: aOffers
    }, aStores, "2026-07-23");

    assert.deepEqual(oResult.offers, []);
    assert.equal(oResult.excludedCount, aOffers.length);
    assert.ok(oResult.excludedReasons.every(function (sReason) {
      return sReason === "invalid-source";
    }));
  });

  const oResult = OfferData.filterSnapshot({
    kind: "optimizer-ready-offers",
    source: "lidl-pdf",
    offers: [Object.assign({}, oFixture.offers[2], { source: "lidl-pdf" })]
  }, aStores, "2026-07-23");

  assert.deepEqual(oResult.offers, []);
  assert.deepEqual(oResult.excludedReasons, ["source-store-mismatch"]);
});
