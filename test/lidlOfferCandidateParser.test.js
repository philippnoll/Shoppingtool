"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const LidlOfferCandidateParser = require("../scripts/lib/LidlOfferCandidateParser");
const oPageThree = require("./fixtures/lidl-page-3-blocks.json");
const oPageFiftyThree = require("./fixtures/lidl-page-53-blocks.json");

test("extracts fixed-package and variable-weight offers from positioned Lidl blocks", function () {
  const aOffers = LidlOfferCandidateParser.parsePage(oPageThree, {
    storeId: "lidl-gronauerstrasse-48599",
    validFrom: "2026-07-20",
    validTo: "2026-07-25"
  });

  assert.ok(aOffers.every(function (oOffer) {
    return oOffer.productKey === null && oOffer.storeId === "lidl-gronauerstrasse-48599";
  }));

  assert.deepEqual(aOffers.map(summarizeOffer), [
    {
      rawName: "Romatomaten",
      packageQuantity: 500,
      packageUnit: "g",
      price: 0.88,
      regularPrice: 1.11,
      basePrice: 1.76,
      basePriceUnit: "kg",
      priceType: "lidl-plus"
    },
    {
      rawName: "VEMONDO Veganer Bio Hafer Drink",
      packageQuantity: 2000,
      packageUnit: "ml",
      price: 2.99,
      regularPrice: null,
      basePrice: 1.5,
      basePriceUnit: "l",
      priceType: "offer"
    },
    {
      rawName: "Helle, kernlose Trauben",
      packageQuantity: 500,
      packageUnit: "g",
      price: 1.79,
      regularPrice: null,
      basePrice: 3.58,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "Snack Gurken",
      packageQuantity: 250,
      packageUnit: "g",
      price: 1.39,
      regularPrice: 1.69,
      basePrice: 5.56,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "GRAFSCHAFTER Vollkornbrot Quark-Möhre",
      packageQuantity: 250,
      packageUnit: "g",
      price: 3.49,
      regularPrice: null,
      basePrice: 13.96,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "Wassermelone",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 0.88,
      regularPrice: null,
      basePrice: 0.88,
      basePriceUnit: "kg",
      priceType: "offer"
    }
  ]);
});

test("keeps adjacent produce prices and variable-weight offers separated", function () {
  const aOffers = LidlOfferCandidateParser.parsePage(oPageFiftyThree);

  assert.deepEqual(aOffers.map(summarizeOffer), [
    {
      rawName: "Auberginen, lose",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 1.39,
      regularPrice: null,
      basePrice: 1.39,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "Zucchini, lose",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 0.99,
      regularPrice: null,
      basePrice: 0.99,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "Deutsche Zwetschgen, lose",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 1.79,
      regularPrice: 2.29,
      basePrice: 1.79,
      basePriceUnit: "kg",
      priceType: "offer"
    },
    {
      rawName: "Cantaloupemelone",
      packageQuantity: 1,
      packageUnit: "kg",
      price: 1.19,
      regularPrice: 1.49,
      basePrice: 1.19,
      basePriceUnit: "kg",
      priceType: "lidl-plus"
    },
    {
      rawName: "GRILLMEISTER Rinder-Rumpsteak",
      packageQuantity: 250,
      packageUnit: "g",
      price: 5.13,
      regularPrice: null,
      basePrice: 20.49,
      basePriceUnit: "kg",
      priceType: "offer"
    }
  ]);
});

function summarizeOffer(oOffer) {
  return {
    rawName: oOffer.rawName,
    packageQuantity: oOffer.packageQuantity,
    packageUnit: oOffer.packageUnit,
    price: oOffer.price,
    regularPrice: oOffer.regularPrice,
    basePrice: oOffer.basePrice,
    basePriceUnit: oOffer.basePriceUnit,
    priceType: oOffer.priceType
  };
}
