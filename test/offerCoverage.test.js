"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const oLoader = createUi5ModuleLoader();
const ShoppingOptimizer = oLoader.load("shoppingtool/model/ShoppingOptimizer", "webapp/model/ShoppingOptimizer.js");

test("keeps pieces incompatible with weight offers and reports honest coverage details", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "butter", name: "Butter", quantity: 1, unit: "Stk" },
    { id: 2, productKey: "tomaten", name: "Tomaten", quantity: 500, unit: "g" },
    { id: 3, productKey: "brot", name: "Brot", quantity: 1, unit: "Stk" }
  ], [
    {
      storeId: "lidl",
      storeName: "Lidl",
      chain: "Lidl",
      productKey: "butter",
      offerName: "Butter 250 g",
      packageQuantity: 250,
      packageUnit: "g",
      price: 1.49
    },
    {
      storeId: "lidl",
      storeName: "Lidl",
      chain: "Lidl",
      productKey: "tomaten",
      offerName: "Tomaten 500 g",
      packageQuantity: 500,
      packageUnit: "g",
      price: 0.88
    }
  ]);

  assert.equal(oResult.bestStore.coveredItemCount, 1);
  assert.equal(oResult.bestStore.requestedItemCount, 3);
  assert.equal(oResult.bestStore.totalPrice, 0.88);
  assert.equal(oResult.bestStore.missingItems[0].coverageReason, "incompatible-unit");
  assert.match(oResult.bestStore.missingItems[0].coverageMessage, /250 g.*1 Stk.*Keine automatische Umrechnung/);
  assert.equal(oResult.bestStore.missingItems[1].coverageReason, "no-offer");
  assert.equal(oResult.splitPlan.extraStorePenalty, 7);
});

test("does not compare partial totals when a split covers a different set of items", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "aepfel", name: "Äpfel", quantity: 1, unit: "kg" },
    { id: 2, productKey: "milch", name: "Milch", quantity: 1, unit: "l" },
    { id: 3, productKey: "brot", name: "Brot", quantity: 1, unit: "Stk" }
  ], [
    {
      storeId: "apples",
      storeName: "Apfelladen",
      chain: "Test",
      productKey: "aepfel",
      offerName: "Äpfel",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 2
    },
    {
      storeId: "milk",
      storeName: "Milchladen",
      chain: "Test",
      productKey: "milch",
      offerName: "Milch",
      packageQuantity: 1,
      packageUnit: "l",
      price: 1
    }
  ]);

  assert.equal(oResult.bestStore.coveredItemCount, 1);
  assert.equal(oResult.splitPlan.coveredItemCount, 2);
  assert.equal(oResult.splitPlan.missingItems.length, 1);
  assert.equal(oResult.splitPlan.hasComparableCoverage, false);
  assert.equal(oResult.splitPlan.savingsComparedToBestStore, null);
  assert.equal(oResult.splitPlan.effectiveSavings, null);
  assert.equal(oResult.splitPlan.extraStorePenalty, 7);
});

test("shows every requested item as uncovered when no offers are available", function () {
  const oResult = ShoppingOptimizer.optimize([
    { id: 1, productKey: "milch", name: "Milch", quantity: 1, unit: "l" }
  ], []);

  assert.equal(oResult.hasResult, true);
  assert.equal(oResult.bestStore.coveredItemCount, 0);
  assert.equal(oResult.bestStore.missingItems[0].coverageReason, "no-offer");
  assert.equal(oResult.splitPlan.totalPrice, 0);
  assert.equal(oResult.splitPlan.missingItems.length, 1);
});
