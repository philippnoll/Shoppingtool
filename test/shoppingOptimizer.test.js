"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();
const MockOffers = oLoader.load("shoppingtool/model/MockOffers", "webapp/model/MockOffers.js");
const ShoppingOptimizer = oLoader.load("shoppingtool/model/ShoppingOptimizer", "webapp/model/ShoppingOptimizer.js");

test("selects the cheapest complete store for a shopping list", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "butter", name: "Butter", quantity: 2, unit: "Stk" },
    { id: 2, productKey: "milch", name: "Milch", quantity: 4, unit: "l" },
    { id: 3, productKey: "tomaten", name: "Tomaten", quantity: 500, unit: "g" }
  ], MockOffers);

  assert.equal(oResult.bestStore.storeId, "lidl-gronauerstrasse-48599");
  assert.equal(oResult.bestStore.totalPrice, 9.43);
  assert.equal(oResult.bestStore.missingItems.length, 0);
});

test("counts missing items before comparing prices", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "butter", name: "Butter", quantity: 1, unit: "Stk" },
    { id: 2, productKey: "brot", name: "Brot", quantity: 1, unit: "Stk" }
  ], MockOffers);

  assert.equal(oResult.bestStore.storeId, "lidl-gronauerstrasse-48599");
  assert.equal(oResult.bestStore.missingItems.length, 0);
  assert.equal(oResult.stores.find(function (oStore) {
    return oStore.storeId === "aldi-gronau";
  }).missingItems.length, 1);
});

test("calculates required packages from requested quantity", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "tomaten", name: "Tomaten", quantity: 1000, unit: "g" }
  ], MockOffers);

  assert.equal(oResult.bestStore.matchedItems[0].packages, 2);
  assert.equal(oResult.bestStore.matchedItems[0].totalPrice, 2.98);
});

test("matches gram shopping items with kilogram offers", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "bananen", name: "Bananen", quantity: 1500, unit: "g" }
  ], [
    {
      storeId: "lidl-gronauerstrasse-48599",
      storeName: "Lidl Gronauerstrasse",
      chain: "Lidl",
      productKey: "bananen",
      offerName: "Bananen lose",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 1.29
    }
  ]);

  assert.equal(oResult.bestStore.missingItems.length, 0);
  assert.equal(oResult.bestStore.matchedItems[0].packages, 2);
  assert.equal(oResult.bestStore.matchedItems[0].totalPrice, 2.58);
});

test("matches liter shopping items with milliliter offers", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "milch", name: "Milch", quantity: 1.5, unit: "l" }
  ], [
    {
      storeId: "lidl-gronauerstrasse-48599",
      storeName: "Lidl Gronauerstrasse",
      chain: "Lidl",
      productKey: "milch",
      offerName: "Milch klein",
      packageQuantity: 500,
      packageUnit: "ml",
      price: 0.69
    }
  ]);

  assert.equal(oResult.bestStore.missingItems.length, 0);
  assert.equal(oResult.bestStore.matchedItems[0].packages, 3);
  assert.equal(oResult.bestStore.matchedItems[0].totalPrice, 2.07);
});
