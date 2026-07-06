sap.ui.define([], function () {
  "use strict";

  function optimize(aItems, aOffers) {
    var aStores = buildStores(aOffers).map(function (oStore) {
      return evaluateStore(oStore, aItems);
    });
    var oBestStore;

    aStores.sort(compareStoreResults);
    oBestStore = aStores[0] || createEmptyStoreResult();

    return {
      hasResult: aStores.length > 0,
      bestStore: oBestStore,
      splitPlan: buildSplitPlan(aItems, aOffers, oBestStore),
      stores: aStores
    };
  }

  function buildStores(aOffers) {
    var mStores = {};

    aOffers.forEach(function (oOffer) {
      if (!mStores[oOffer.storeId]) {
        mStores[oOffer.storeId] = {
          storeId: oOffer.storeId,
          storeName: oOffer.storeName,
          chain: oOffer.chain,
          offers: []
        };
      }

      mStores[oOffer.storeId].offers.push(oOffer);
    });

    return Object.keys(mStores).map(function (sStoreId) {
      return mStores[sStoreId];
    });
  }

  function evaluateStore(oStore, aItems) {
    var aMatchedItems = [];
    var aMissingItems = [];
    var fTotalPrice = 0;

    aItems.forEach(function (oItem) {
      var oMatchedItem = findBestMatchedItem(oStore.offers, oItem);

      if (!oMatchedItem) {
        aMissingItems.push(oItem);
        return;
      }

      aMatchedItems.push(oMatchedItem);
      fTotalPrice += oMatchedItem.totalPrice;
    });

    return {
      storeId: oStore.storeId,
      storeName: oStore.storeName,
      chain: oStore.chain,
      totalPrice: roundCurrency(fTotalPrice),
      matchedItems: aMatchedItems,
      missingItems: aMissingItems
    };
  }

  function buildSplitPlan(aItems, aOffers, oBestStore) {
    var aMatchedItems = [];
    var aMissingItems = [];
    var fTotalPrice = 0;

    aItems.forEach(function (oItem) {
      var oMatchedItem = findBestMatchedItem(aOffers, oItem);

      if (!oMatchedItem) {
        aMissingItems.push(oItem);
        return;
      }

      aMatchedItems.push(oMatchedItem);
      fTotalPrice += oMatchedItem.totalPrice;
    });

    return {
      totalPrice: roundCurrency(fTotalPrice),
      savingsComparedToBestStore: roundCurrency(oBestStore.totalPrice - fTotalPrice),
      storeCount: countStores(aMatchedItems),
      stores: buildSplitStores(aMatchedItems),
      matchedItems: aMatchedItems,
      missingItems: aMissingItems
    };
  }

  function findBestMatchedItem(aOffers, oItem) {
    var oBestMatchedItem = null;

    aOffers.forEach(function (oOffer) {
      var oMatchedItem;

      if (oOffer.productKey !== oItem.productKey || !haveCompatibleUnits(oOffer.packageUnit, oItem.unit)) {
        return;
      }

      oMatchedItem = buildMatchedItem(oItem, oOffer);

      if (!oBestMatchedItem || oMatchedItem.totalPrice < oBestMatchedItem.totalPrice) {
        oBestMatchedItem = oMatchedItem;
      }
    });

    return oBestMatchedItem;
  }

  function buildMatchedItem(oItem, oOffer) {
    var fRequestedQuantity = convertToBaseQuantity(oItem.quantity, oItem.unit);
    var fPackageQuantity = convertToBaseQuantity(oOffer.packageQuantity, oOffer.packageUnit);
    var iPackages = Math.ceil(fRequestedQuantity / fPackageQuantity);
    var fTotalPrice = roundCurrency(iPackages * oOffer.price);

    return {
      itemId: oItem.id,
      productKey: oItem.productKey,
      name: oItem.name,
      storeId: oOffer.storeId,
      storeName: oOffer.storeName,
      chain: oOffer.chain,
      requestedQuantity: oItem.quantity,
      requestedUnit: oItem.unit,
      offerName: oOffer.offerName,
      packageQuantity: oOffer.packageQuantity,
      packageUnit: oOffer.packageUnit,
      packagePrice: oOffer.price,
      packages: iPackages,
      totalPrice: fTotalPrice
    };
  }

  function buildSplitStores(aMatchedItems) {
    var mStores = {};

    aMatchedItems.forEach(function (oMatchedItem) {
      if (!mStores[oMatchedItem.storeId]) {
        mStores[oMatchedItem.storeId] = {
          storeId: oMatchedItem.storeId,
          storeName: oMatchedItem.storeName,
          chain: oMatchedItem.chain,
          totalPrice: 0,
          matchedItems: []
        };
      }

      mStores[oMatchedItem.storeId].matchedItems.push(oMatchedItem);
      mStores[oMatchedItem.storeId].totalPrice += oMatchedItem.totalPrice;
    });

    return Object.keys(mStores).map(function (sStoreId) {
      mStores[sStoreId].totalPrice = roundCurrency(mStores[sStoreId].totalPrice);
      return mStores[sStoreId];
    });
  }

  function countStores(aMatchedItems) {
    var mStoreIds = {};

    aMatchedItems.forEach(function (oMatchedItem) {
      mStoreIds[oMatchedItem.storeId] = true;
    });

    return Object.keys(mStoreIds).length;
  }

  function haveCompatibleUnits(sLeftUnit, sRightUnit) {
    return getUnitFamily(sLeftUnit) === getUnitFamily(sRightUnit);
  }

  function getUnitFamily(sUnit) {
    var sNormalizedUnit = normalizeUnit(sUnit);

    if (sNormalizedUnit === "g" || sNormalizedUnit === "kg") {
      return "weight";
    }

    if (sNormalizedUnit === "ml" || sNormalizedUnit === "l") {
      return "volume";
    }

    if (sNormalizedUnit === "stk") {
      return "piece";
    }

    return sNormalizedUnit;
  }

  function convertToBaseQuantity(fQuantity, sUnit) {
    var sNormalizedUnit = normalizeUnit(sUnit);

    if (sNormalizedUnit === "kg" || sNormalizedUnit === "l") {
      return fQuantity * 1000;
    }

    return fQuantity;
  }

  function normalizeUnit(sUnit) {
    return (sUnit || "").trim().toLowerCase();
  }

  function compareStoreResults(oLeft, oRight) {
    if (oLeft.missingItems.length !== oRight.missingItems.length) {
      return oLeft.missingItems.length - oRight.missingItems.length;
    }

    return oLeft.totalPrice - oRight.totalPrice;
  }

  function roundCurrency(fValue) {
    return Math.round((fValue + Number.EPSILON) * 100) / 100;
  }

  function createEmptyStoreResult() {
    return {
      storeName: "",
      totalPrice: 0,
      matchedItems: [],
      missingItems: []
    };
  }

  return {
    optimize: optimize
  };
});
