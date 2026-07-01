sap.ui.define([], function () {
  "use strict";

  function optimize(aItems, aOffers) {
    var aStores = buildStores(aOffers).map(function (oStore) {
      return evaluateStore(oStore, aItems);
    });

    aStores.sort(compareStoreResults);

    return {
      hasResult: aStores.length > 0,
      bestStore: aStores[0] || {
        storeName: "",
        totalPrice: 0,
        matchedItems: [],
        missingItems: []
      },
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
      var oOffer = findOffer(oStore.offers, oItem);
      var oMatchedItem;

      if (!oOffer) {
        aMissingItems.push(oItem);
        return;
      }

      oMatchedItem = buildMatchedItem(oItem, oOffer);
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

  function findOffer(aOffers, oItem) {
    return aOffers.find(function (oOffer) {
      return oOffer.productKey === oItem.productKey && oOffer.packageUnit === oItem.unit;
    });
  }

  function buildMatchedItem(oItem, oOffer) {
    var iPackages = Math.ceil(oItem.quantity / oOffer.packageQuantity);
    var fTotalPrice = roundCurrency(iPackages * oOffer.price);

    return {
      itemId: oItem.id,
      productKey: oItem.productKey,
      name: oItem.name,
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

  function compareStoreResults(oLeft, oRight) {
    if (oLeft.missingItems.length !== oRight.missingItems.length) {
      return oLeft.missingItems.length - oRight.missingItems.length;
    }

    return oLeft.totalPrice - oRight.totalPrice;
  }

  function roundCurrency(fValue) {
    return Math.round((fValue + Number.EPSILON) * 100) / 100;
  }

  return {
    optimize: optimize
  };
});
