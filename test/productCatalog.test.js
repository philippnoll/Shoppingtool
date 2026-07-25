"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createUi5ModuleLoader } = require("./helpers/ui5ModuleLoader");

const sCatalogPath = path.join(__dirname, "..", "webapp", "model", "ProductCatalog.js");

test("provides the same product catalog to Node and UI5", function () {
  delete require.cache[require.resolve(sCatalogPath)];
  const aNodeCatalog = require(sCatalogPath);

  delete require.cache[require.resolve(sCatalogPath)];
  const oLoader = createUi5ModuleLoader();
  const aUi5Catalog = oLoader.load("shoppingtool/model/ProductCatalog", "webapp/model/ProductCatalog.js");

  assert.deepEqual(aNodeCatalog, aUi5Catalog);
  assert.equal(aNodeCatalog.length, 10);
  assert.deepEqual(aNodeCatalog.map(function (oProduct) {
    return oProduct.key;
  }), [
    "butter",
    "milch",
    "tomaten",
    "brot",
    "eier",
    "kaese",
    "nudeln",
    "reis",
    "bananen",
    "aepfel"
  ]);
});
