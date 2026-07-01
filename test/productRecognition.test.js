"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();

oLoader.load("shoppingtool/model/ProductCatalog", "webapp/model/ProductCatalog.js");
oLoader.load("shoppingtool/model/ProductSearch", "webapp/model/ProductSearch.js");
const ProductRecognition = oLoader.load("shoppingtool/model/ProductRecognition", "webapp/model/ProductRecognition.js");

function compact(aItems) {
  return aItems.map(function (oItem) {
    return {
      rawText: oItem.rawText,
      productKey: oItem.productKey,
      name: oItem.name,
      quantity: oItem.quantity,
      unit: oItem.unit,
      category: oItem.category
    };
  });
}

test("parses comma, semicolon, and newline separated products", function () {
  assert.deepEqual(compact(ProductRecognition.parse("buttermann, tomatn;\nMilch und Brot")), [
    { rawText: "buttermann", productKey: "butter", name: "Butter", quantity: 1, unit: "Stk", category: "Kuehlung" },
    { rawText: "tomatn", productKey: "tomaten", name: "Tomaten", quantity: 500, unit: "g", category: "Gemuese" },
    { rawText: "Milch", productKey: "milch", name: "Milch", quantity: 1, unit: "l", category: "Kuehlung" },
    { rawText: "Brot", productKey: "brot", name: "Brot", quantity: 1, unit: "Stk", category: "Backwaren" }
  ]);
});

test("parses quantity variants", function () {
  assert.deepEqual(compact(ProductRecognition.parse("2 butter, 2x milch, 2 x brot")), [
    { rawText: "2 butter", productKey: "butter", name: "Butter", quantity: 2, unit: "Stk", category: "Kuehlung" },
    { rawText: "2x milch", productKey: "milch", name: "Milch", quantity: 2, unit: "l", category: "Kuehlung" },
    { rawText: "2 x brot", productKey: "brot", name: "Brot", quantity: 2, unit: "Stk", category: "Backwaren" }
  ]);
});

test("parses unit variants", function () {
  assert.deepEqual(compact(ProductRecognition.parse("500g tomaten, 1 l milch, 2 stueck brot")), [
    { rawText: "500g tomaten", productKey: "tomaten", name: "Tomaten", quantity: 500, unit: "g", category: "Gemuese" },
    { rawText: "1 l milch", productKey: "milch", name: "Milch", quantity: 1, unit: "l", category: "Kuehlung" },
    { rawText: "2 stueck brot", productKey: "brot", name: "Brot", quantity: 2, unit: "Stk", category: "Backwaren" }
  ]);
});

test("splits whitespace lists only when the parts are recognizable products", function () {
  assert.deepEqual(compact(ProductRecognition.parse("butter milch bananen")), [
    { rawText: "butter", productKey: "butter", name: "Butter", quantity: 1, unit: "Stk", category: "Kuehlung" },
    { rawText: "milch", productKey: "milch", name: "Milch", quantity: 1, unit: "l", category: "Kuehlung" },
    { rawText: "bananen", productKey: "bananen", name: "Bananen", quantity: 1, unit: "kg", category: "Obst" }
  ]);
});

test("keeps unknown multi-word products together", function () {
  assert.deepEqual(compact(ProductRecognition.parse("saure sahne")), [
    { rawText: "saure sahne", productKey: null, name: "Saure sahne", quantity: 1, unit: "Stk", category: "Sonstiges" }
  ]);
});

test("normalizes German umlauts for catalog matches", function () {
  assert.deepEqual(compact(ProductRecognition.parse("käse, äpfel")), [
    { rawText: "käse", productKey: "kaese", name: "Kaese", quantity: 1, unit: "Stk", category: "Aufschnitt" },
    { rawText: "äpfel", productKey: "aepfel", name: "Aepfel", quantity: 1, unit: "kg", category: "Obst" }
  ]);
});
