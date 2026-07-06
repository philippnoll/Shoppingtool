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

test("builds a split plan from the cheapest matching offers across stores", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "butter", name: "Butter", quantity: 2, unit: "Stk" },
    { id: 2, productKey: "milch", name: "Milch", quantity: 4, unit: "l" },
    { id: 3, productKey: "tomaten", name: "Tomaten", quantity: 500, unit: "g" }
  ], MockOffers);

  assert.equal(oResult.bestStore.storeId, "lidl-gronauerstrasse-48599");
  assert.equal(oResult.bestStore.totalPrice, 9.43);
  assert.equal(oResult.splitPlan.totalPrice, 9.23);
  assert.equal(oResult.splitPlan.savingsComparedToBestStore, 0.2);
  assert.equal(oResult.splitPlan.extraStoreCount, 1);
  assert.equal(oResult.splitPlan.extraStorePenalty, 7);
  assert.equal(oResult.splitPlan.totalExtraStorePenalty, 7);
  assert.equal(oResult.splitPlan.effectiveSavings, -6.8);
  assert.equal(oResult.splitPlan.isWorthwhile, false);
  assert.equal(oResult.splitPlan.storeCount, 2);
  assert.deepEqual(oResult.splitPlan.stores.map(function (oStore) {
    return oStore.storeId;
  }), ["aldi-gronau", "lidl-gronauerstrasse-48599"]);
});

test("marks split plans as worthwhile only after the extra store penalty", function () {
  const aOffers = [
    {
      storeId: "one-store",
      storeName: "Ein Laden",
      chain: "Test",
      productKey: "butter",
      offerName: "Butter normal",
      packageQuantity: 1,
      packageUnit: "Stk",
      price: 5
    },
    {
      storeId: "one-store",
      storeName: "Ein Laden",
      chain: "Test",
      productKey: "milch",
      offerName: "Milch normal",
      packageQuantity: 1,
      packageUnit: "l",
      price: 5
    },
    {
      storeId: "cheap-butter",
      storeName: "Butter Laden",
      chain: "Test",
      productKey: "butter",
      offerName: "Butter Angebot",
      packageQuantity: 1,
      packageUnit: "Stk",
      price: 1
    },
    {
      storeId: "cheap-milk",
      storeName: "Milch Laden",
      chain: "Test",
      productKey: "milch",
      offerName: "Milch Angebot",
      packageQuantity: 1,
      packageUnit: "l",
      price: 1
    }
  ];

  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "butter", name: "Butter", quantity: 1, unit: "Stk" },
    { id: 2, productKey: "milch", name: "Milch", quantity: 1, unit: "l" }
  ], aOffers);

  assert.equal(oResult.bestStore.storeId, "one-store");
  assert.equal(oResult.bestStore.totalPrice, 10);
  assert.equal(oResult.splitPlan.totalPrice, 2);
  assert.equal(oResult.splitPlan.savingsComparedToBestStore, 8);
  assert.equal(oResult.splitPlan.totalExtraStorePenalty, 7);
  assert.equal(oResult.splitPlan.effectiveSavings, 1);
  assert.equal(oResult.splitPlan.isWorthwhile, true);
});

test("reports missing items in split plans", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "wasser", name: "Wasser", quantity: 1, unit: "Stk" }
  ], MockOffers);

  assert.equal(oResult.splitPlan.totalPrice, 0);
  assert.equal(oResult.splitPlan.storeCount, 0);
  assert.equal(oResult.splitPlan.missingItems.length, 1);
});
