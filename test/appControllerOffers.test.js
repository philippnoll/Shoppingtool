"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();
const OfferData = oLoader.load("shoppingtool/model/OfferData", "webapp/model/OfferData.js");
const OfferModel = oLoader.load("shoppingtool/model/OfferModel", "webapp/model/OfferModel.js");
const ShoppingOptimizer = oLoader.load("shoppingtool/model/ShoppingOptimizer", "webapp/model/ShoppingOptimizer.js");
const oFixture = require("./fixtures/optimizer-ready-offers.json");
const aStores = require("../data/stores.json");
const sController = fs.readFileSync(path.join(__dirname, "../webapp/controller/App.controller.js"), "utf8");

function createModel(oData) {
  return {
    data: oData,
    setData: function (oNewData) { this.data = oNewData; },
    getProperty: function (sPath) { return this.data[sPath.slice(1)]; },
    setProperty: function (sPath, vValue) { this.data[sPath.slice(1)] = vValue; }
  };
}

function createController(oMainModel, oOffersModel, fRefresh) {
  let oController;
  const mDependencies = {
    "sap/ui/core/mvc/Controller": {
      extend: function (sName, oMethods) { return oMethods; }
    },
    "sap/m/MessageToast": { show: function () {} },
    "shoppingtool/model/ShoppingOptimizer": ShoppingOptimizer,
    "shoppingtool/model/OfferModel": { refresh: fRefresh }
  };

  vm.runInNewContext(sController, {
    Date: class extends Date {
      constructor() { super("2026-07-23T12:00:00.000Z"); }
    },
    sap: { ui: {
      define: function (aDependencies, fFactory) {
        oController = fFactory.apply(null, aDependencies.map(function (sName) {
          return mDependencies[sName];
        }));
      }
    } }
  });

  oController.getView = function () {
    return { getModel: function (sName) { return sName === "offers" ? oOffersModel : oMainModel; } };
  };
  return oController;
}

for (const bRollover of [false, true]) {
  for (const sOutcome of ["ready", "empty", "error"]) {
    test((bRollover ? "day rollover" : "manual refresh") + " clears demo results before " + sOutcome + " reload", async function () {
      const oOffersModel = createModel(OfferModel.createInitialData());
      oOffersModel.setData(Object.assign({ status: "ready" }, OfferData.filterSnapshot(oFixture, aStores, "2026-07-23")));
      const oMainModel = createModel({
        items: [{ id: 1, productKey: "butter", name: "Butter", quantity: 250, unit: "g" }],
        optimizationSettings: { extraStorePenalty: 7 }
      });
      let fRelease;
      let pRefresh;
      let iRefreshCount = 0;
      const pRelease = new Promise(function (fResolve) { fRelease = fResolve; });
      const oController = createController(oMainModel, oOffersModel, function (oModel) {
        iRefreshCount++;
        assert.equal(oMainModel.getProperty("/optimizationResult").hasResult, false);
        pRefresh = OfferModel.refresh(oModel, {
          now: "2026-07-23",
          fetch: function (sUrl) {
            return pRelease.then(function () {
              if (sOutcome === "error") {
                throw new Error("offline");
              }
              return { ok: true, json: function () {
                return Promise.resolve(sUrl.includes("stores.json") ? aStores : {
                  kind: "optimizer-ready-offers",
                  source: "lidl-pdf",
                  offers: sOutcome === "empty" ? [] : [Object.assign({}, oFixture.offers[0], {
                    source: "lidl-pdf", price: 2.49
                  })]
                });
              } };
            });
          }
        });
        return pRefresh;
      });

      oController.onOptimizeShopping();
      assert.equal(oMainModel.getProperty("/optimizationResult").hasResult, true);
      assert.equal(oMainModel.getProperty("/optimizationResult").bestStore.totalPrice, 1.49);
      assert.equal(oOffersModel.getProperty("/isDemo"), true);

      if (bRollover) {
        oOffersModel.setProperty("/referenceDate", "2026-07-22");
        oController.onOptimizeShopping();
      } else {
        assert.equal(oController.onRefreshOffers(), pRefresh);
      }

      assert.equal(iRefreshCount, 1);
      assert.equal(oMainModel.getProperty("/optimizationResult").hasResult, false);
      assert.equal(oMainModel.getProperty("/optimizationResult").bestStore, undefined);
      assert.equal(oOffersModel.getProperty("/status"), "loading");
      fRelease();
      await pRefresh;

      assert.equal(oOffersModel.getProperty("/status"), sOutcome);
      assert.equal(oMainModel.getProperty("/optimizationResult").hasResult, false);
      assert.equal(oMainModel.getProperty("/optimizationResult").bestStore, undefined);
      assert.equal(oOffersModel.getProperty("/isDemo"), false);
      if (sOutcome === "ready") {
        oController.onOptimizeShopping();
        assert.equal(oMainModel.getProperty("/optimizationResult").bestStore.totalPrice, 2.49);
      }
    });
  }
}
