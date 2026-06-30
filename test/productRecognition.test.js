"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const MiniSearch = require("minisearch");

const mModules = {};
let sCurrentModule = "";

global.window = { MiniSearch };
global.sap = {
  ui: {
    define: function (aDependencies, fnFactory) {
      mModules[sCurrentModule] = fnFactory.apply(null, aDependencies.map(function (sDependency) {
        return mModules[sDependency];
      }));
    }
  }
};

function loadUi5Module(sModuleName, sRelativePath) {
  sCurrentModule = sModuleName;
  require(path.join(__dirname, "..", sRelativePath));
  sCurrentModule = "";
}

loadUi5Module("shoppingtool/model/ProductCatalog", "webapp/model/ProductCatalog.js");
loadUi5Module("shoppingtool/model/ProductSearch", "webapp/model/ProductSearch.js");
loadUi5Module("shoppingtool/model/ProductRecognition", "webapp/model/ProductRecognition.js");

const ProductRecognition = mModules["shoppingtool/model/ProductRecognition"];

function compact(aItems) {
  return aItems.map(function (oItem) {
    return {
      rawText: oItem.rawText,
      name: oItem.name,
      quantity: oItem.quantity,
      unit: oItem.unit
    };
  });
}

test("parses comma, semicolon, and newline separated products", function () {
  assert.deepEqual(compact(ProductRecognition.parse("buttermann, tomatn;\nMilch und Brot")), [
    { rawText: "buttermann", name: "Butter", quantity: 1, unit: "Stk" },
    { rawText: "tomatn", name: "Tomaten", quantity: 500, unit: "g" },
    { rawText: "Milch", name: "Milch", quantity: 1, unit: "l" },
    { rawText: "Brot", name: "Brot", quantity: 1, unit: "Stk" }
  ]);
});

test("parses quantity variants", function () {
  assert.deepEqual(compact(ProductRecognition.parse("2 butter, 2x milch, 2 x brot")), [
    { rawText: "2 butter", name: "Butter", quantity: 2, unit: "Stk" },
    { rawText: "2x milch", name: "Milch", quantity: 2, unit: "l" },
    { rawText: "2 x brot", name: "Brot", quantity: 2, unit: "Stk" }
  ]);
});

test("parses unit variants", function () {
  assert.deepEqual(compact(ProductRecognition.parse("500g tomaten, 1 l milch, 2 stueck brot")), [
    { rawText: "500g tomaten", name: "Tomaten", quantity: 500, unit: "g" },
    { rawText: "1 l milch", name: "Milch", quantity: 1, unit: "l" },
    { rawText: "2 stueck brot", name: "Brot", quantity: 2, unit: "Stk" }
  ]);
});

test("splits whitespace lists only when the parts are recognizable products", function () {
  assert.deepEqual(compact(ProductRecognition.parse("butter milch bananen")), [
    { rawText: "butter", name: "Butter", quantity: 1, unit: "Stk" },
    { rawText: "milch", name: "Milch", quantity: 1, unit: "l" },
    { rawText: "bananen", name: "Bananen", quantity: 1, unit: "kg" }
  ]);
});

test("keeps unknown multi-word products together", function () {
  assert.deepEqual(compact(ProductRecognition.parse("saure sahne")), [
    { rawText: "saure sahne", name: "Saure sahne", quantity: 1, unit: "Stk" }
  ]);
});

test("normalizes German umlauts for catalog matches", function () {
  assert.deepEqual(compact(ProductRecognition.parse("käse, äpfel")), [
    { rawText: "käse", name: "Kaese", quantity: 1, unit: "Stk" },
    { rawText: "äpfel", name: "Aepfel", quantity: 1, unit: "kg" }
  ]);
});
