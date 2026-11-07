"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { URL: URLCtor } = require("node:url");
const { publish } = require("../scripts/publish-offers");
const Parser = require("../scripts/lib/LidlOfferCandidateParser");
const Promoter = require("../scripts/lib/LidlOfferPromoter");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();
oLoader.load("shoppingtool/model/OfferData", "webapp/model/OfferData.js");
const OfferModel = oLoader.load("shoppingtool/model/OfferModel", "webapp/model/OfferModel.js");
const Optimizer = oLoader.load("shoppingtool/model/ShoppingOptimizer", "webapp/model/ShoppingOptimizer.js");

test("publishes parsed historical offers, loads fixed HTTP resources, and preserves honest coverage across retries", async function (t) {
  const sRoot = fs.mkdtempSync(path.join(__dirname, ".tmp-offer-flow-"));
  t.after(function () { fs.rmSync(sRoot, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(sRoot, "data"));
  const aStores = require("../data/stores.json");
  fs.writeFileSync(path.join(sRoot, "data/stores.json"), JSON.stringify(aStores));
  const aRequests = [];
  const oServer = http.createServer(function (oRequest, oResponse) {
    const mFiles = {
      "/data/stores.json": "webapp/data/stores.json",
      "/data/offers/optimizer-ready.json": "webapp/data/offers/optimizer-ready.json"
    };
    const sFile = mFiles[oRequest.url];
    const bExists = Boolean(sFile && fs.existsSync(path.join(sRoot, sFile)));
    aRequests.push({ url: oRequest.url, status: bExists ? 200 : 404 });
    oResponse.writeHead(bExists ? 200 : 404, { "Content-Type": "application/json" });
    oResponse.end(bExists ? fs.readFileSync(path.join(sRoot, sFile)) : "{}");
  });
  t.after(function () { oServer.closeAllConnections(); return new Promise(function (resolve) { oServer.close(resolve); }); });
  await new Promise(function (resolve) { oServer.listen(0, "127.0.0.1", resolve); });
  const sOrigin = "http://127.0.0.1:" + oServer.address().port + "/";
  const oModel = {
    data: {},
    setData: function (oData) { this.data = oData; },
    getProperty: function (sPath) { return this.data[sPath.slice(1)]; }
  };
  const oOptions = {
    now: "2026-07-23",
    fetch: function (sUrl, oInit) {
      assert.ok(["data/stores.json", "data/offers/optimizer-ready.json"].includes(sUrl));
      assert.equal(oInit.cache, "no-store");
      return fetch(new URLCtor(sUrl, sOrigin), oInit);
    }
  };
  const aStates = [];
  async function refresh(sStep, oOverrides) {
    const pLoad = OfferModel.refresh(oModel, Object.assign({}, oOptions, oOverrides));
    assert.equal(oModel.getProperty("/status"), "loading");
    assert.deepEqual(oModel.getProperty("/offers"), []);
    await pLoad;
    aStates.push({ step: sStep, model: oModel.data });
  }

  await refresh("No published resources: actionable error");
  assert.equal(oModel.getProperty("/status"), "error");
  assert.match(oModel.getProperty("/errorMessage"), /Veröffentlichung.*Server.*erneut/);

  // Real extracted page content and historical dates; this is no live-price or browser check.
  const oContext = { storeId: "lidl-gronauerstrasse-48599", validFrom: "2026-07-20", validTo: "2026-07-25" };
  const oDocuments = Promoter.promoteDocument(Object.assign({
    source: "lidl-pdf",
    candidates: Parser.parsePage(require("./fixtures/lidl-page-3-blocks.json"), oContext)
  }, oContext), aStores, { referenceDate: oOptions.now, generatedAt: "2026-07-23T12:00:00.000Z" });
  const sInput = path.join(sRoot, "snapshot.json");
  fs.writeFileSync(sInput, JSON.stringify(oDocuments.optimizer));
  const oPublication = publish(sInput, sRoot);
  assert.deepEqual(fs.readdirSync(path.join(sRoot, "webapp/data/offers")), ["optimizer-ready.json"]);
  const sPublished = path.join(sRoot, "webapp/data/offers/optimizer-ready.json");
  const oApiResponse = await (await fetch(new URLCtor("data/offers/optimizer-ready.json", sOrigin))).json();
  assert.deepEqual(oApiResponse, {
    kind: oDocuments.optimizer.kind,
    source: oDocuments.optimizer.source,
    offerCount: oDocuments.optimizer.offerCount,
    generatedAt: oDocuments.optimizer.generatedAt,
    offers: oDocuments.optimizer.offers.map(function (oOffer) {
      return Object.fromEntries([
        "storeId", "storeName", "chain", "productKey", "offerName", "packageQuantity",
        "packageUnit", "price", "validFrom", "validTo", "source", "priceType", "priceCondition"
      ].filter(function (sField) { return Object.hasOwn(oOffer, sField); }).map(function (sField) {
        return [sField, oOffer[sField]];
      }));
    })
  });
  assert.doesNotMatch(JSON.stringify(oApiResponse), new RegExp(sRoot));
  await refresh("Publish parsed historical snapshot and retry");
  assert.equal(oModel.getProperty("/status"), "ready");
  assert.equal(oModel.getProperty("/isDemo"), false);
  assert.deepEqual(oModel.getProperty("/offers").map(function (oOffer) { return oOffer.productKey; }), ["brot"]);

  const aItems = [
    { id: 1, productKey: "brot", name: "Brot", quantity: 1, unit: "Stk" },
    { id: 2, productKey: "butter", name: "Butter", quantity: 250, unit: "g" }
  ];
  const oBeforeEdit = Optimizer.optimize(aItems, oModel.getProperty("/offers"));
  assert.equal(oBeforeEdit.bestStore.coveredItemCount, 0);
  assert.equal(oBeforeEdit.bestStore.missingItems[0].coverageReason, "incompatible-unit");
  assert.match(oBeforeEdit.bestStore.missingItems[0].coverageMessage, /250 g.*1 Stk.*Keine automatische Umrechnung/);
  aItems[0] = Object.assign({}, aItems[0], { quantity: 500, unit: "g" });
  const oAfterEdit = Optimizer.optimize(aItems, oModel.getProperty("/offers"));
  assert.equal(oAfterEdit.bestStore.totalPrice, 6.98);
  assert.equal(oAfterEdit.bestStore.coveredItemCount, 1);
  assert.equal(oAfterEdit.bestStore.isComplete, false);
  assert.equal(oAfterEdit.bestStore.matchedItems[0].packages, 2);
  assert.equal(oAfterEdit.bestStore.missingItems[0].coverageReason, "no-offer");
  assert.equal(oAfterEdit.stores.length, 1);
  assert.equal(oAfterEdit.splitPlan.extraStorePenalty, 7);

  fs.writeFileSync(sPublished, "invalid JSON");
  await refresh("Malformed HTTP JSON clears old offers");
  assert.equal(oModel.getProperty("/status"), "error");
  assert.match(oModel.getProperty("/errorMessage"), /ungültig/);
  publish(sInput, sRoot);
  await refresh("Retry after repairing publication");
  assert.equal(oModel.getProperty("/status"), "ready");
  await refresh("Historical offers are expired on today's date", { now: new Date().toISOString().slice(0, 10) });
  assert.equal(oModel.getProperty("/status"), "empty");
  assert.deepEqual(oModel.getProperty("/excludedReasons"), ["expired"]);

  publish(path.join(__dirname, "fixtures/optimizer-ready-offers.json"), sRoot);
  await refresh("Explicit fixture publication remains marked as demo");
  assert.equal(oModel.getProperty("/isDemo"), true);
  assert.equal(oModel.getProperty("/offers").length, 3);
  assert.equal(oModel.getProperty("/excludedCount"), 5);

  for (const oForbidden of [oDocuments.review, { candidates: [] }]) {
    fs.writeFileSync(sInput, JSON.stringify(oForbidden));
    assert.throws(function () { publish(sInput, sRoot); }, /Only an optimizer-ready/);
  }
  assert.deepEqual(fs.readdirSync(path.join(sRoot, "webapp/data/offers")), ["optimizer-ready.json"]);

  if (process.env.NO_MISTAKES_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.NO_MISTAKES_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.NO_MISTAKES_EVIDENCE_DIR, "offers-http-flow.json"), JSON.stringify({
      scope: "HTTP publication and application-model integration; no rendered UI or browser verification.",
      provenance: "Historical extracted Lidl page-3 fixture; 2026-07-23 simulated reference date, not current live prices.",
      publication: oPublication,
      publishedHttpResponse: oApiResponse,
      beforeExplicitUnitEdit: oBeforeEdit,
      afterExplicitUnitEdit: oAfterEdit,
      reloadStates: aStates,
      httpRequests: aRequests
    }, null, 2) + "\n");
  }
});
