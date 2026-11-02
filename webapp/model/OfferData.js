sap.ui.define([], function () {
  "use strict";

  var OFFER_SNAPSHOT_URL = "data/offers/optimizer-ready.json";
  var STORE_CATALOG_URL = "data/stores.json";
  var ALLOWED_UNITS = ["g", "kg", "ml", "l", "stk"];

  function load(oOptions) {
    var oConfig = oOptions || {};
    var fFetch = oConfig.fetch || window.fetch.bind(window);
    var sReferenceDate = toIsoDate(oConfig.now || new Date());

    return Promise.all([
      fetchJson(fFetch, STORE_CATALOG_URL),
      fetchJson(fFetch, OFFER_SNAPSHOT_URL)
    ]).then(function (aDocuments) {
      return filterSnapshot(aDocuments[1], aDocuments[0], sReferenceDate);
    });
  }

  function filterSnapshot(oSnapshot, aStores, sReferenceDate) {
    var mStores;
    var aOffers;
    var aAcceptedOffers = [];
    var aExcludedReasons = [];

    if (!Array.isArray(aStores) || !aStores.length || !aStores.every(isValidStore)) {
      throw createError("invalid-store-catalog");
    }

    if (!isObject(oSnapshot) || oSnapshot.kind !== "optimizer-ready-offers" || !Array.isArray(oSnapshot.offers)) {
      throw createError("invalid-offer-snapshot");
    }

    if (oSnapshot.offerCount !== undefined && oSnapshot.offerCount !== oSnapshot.offers.length) {
      throw createError("invalid-offer-snapshot");
    }

    mStores = aStores.reduce(function (mResult, oStore) {
      mResult[oStore.id] = oStore;
      return mResult;
    }, Object.create(null));
    aOffers = oSnapshot.offers;

    aOffers.forEach(function (oOffer) {
      var sReason = getExclusionReason(oOffer, mStores, sReferenceDate);

      if (sReason) {
        aExcludedReasons.push(sReason);
      } else {
        aAcceptedOffers.push(oOffer);
      }
    });

    return {
      offers: aAcceptedOffers,
      excludedCount: aExcludedReasons.length,
      excludedReasons: aExcludedReasons,
      referenceDate: sReferenceDate,
      generatedAt: oSnapshot.generatedAt || "",
      isDemo: oSnapshot.source === "test-fixture"
    };
  }

  function getExclusionReason(oOffer, mStores, sReferenceDate) {
    var oStore;
    var bValidFrom;
    var bValidTo;

    if (!isObject(oOffer)) {
      return "invalid-offer";
    }

    oStore = mStores[oOffer.storeId];
    if (!oStore) {
      return "unknown-store";
    }

    if (oOffer.chain !== oStore.chain || oOffer.storeName !== oStore.name) {
      return "store-identity-mismatch";
    }

    if (!isNonEmptyString(oOffer.source) || !isNonEmptyString(oOffer.productKey) || !isNonEmptyString(oOffer.offerName)) {
      return "invalid-offer";
    }

    if (!isPositiveNumber(oOffer.price) || !isPositiveNumber(oOffer.packageQuantity) || !isAllowedUnit(oOffer.packageUnit)) {
      return "invalid-offer";
    }

    if (oOffer.priceType !== "offer" || oOffer.priceCondition !== null) {
      return "conditional-price";
    }

    bValidFrom = isIsoDate(oOffer.validFrom);
    bValidTo = isIsoDate(oOffer.validTo);

    if (!bValidFrom || !bValidTo || oOffer.validFrom > oOffer.validTo) {
      return "invalid-validity";
    }

    if (oOffer.validTo < sReferenceDate) {
      return "expired";
    }

    if (oOffer.validFrom > sReferenceDate) {
      return "not-yet-valid";
    }

    return "";
  }

  function fetchJson(fFetch, sUrl) {
    return fFetch(sUrl, { cache: "no-store" }).then(function (oResponse) {
      if (!oResponse || !oResponse.ok) {
        throw createError("request-failed");
      }

      return oResponse.json().catch(function () {
        throw createError("invalid-json");
      });
    }).catch(function (oError) {
      if (oError && oError.code) {
        throw oError;
      }

      throw createError("request-failed");
    });
  }

  function isValidStore(oStore) {
    return isObject(oStore) && isNonEmptyString(oStore.id) &&
      isNonEmptyString(oStore.chain) && isNonEmptyString(oStore.name);
  }

  function isAllowedUnit(sUnit) {
    return typeof sUnit === "string" && ALLOWED_UNITS.indexOf(sUnit.toLowerCase()) !== -1;
  }

  function isIsoDate(sValue) {
    var oDate;

    if (typeof sValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sValue)) {
      return false;
    }

    oDate = new Date(sValue + "T00:00:00.000Z");
    return !Number.isNaN(oDate.getTime()) && oDate.toISOString().slice(0, 10) === sValue;
  }

  function toIsoDate(vValue) {
    var sDate = vValue instanceof Date ? vValue.toISOString().slice(0, 10) : vValue;

    if (!isIsoDate(sDate)) {
      throw createError("invalid-reference-date");
    }

    return sDate;
  }

  function isPositiveNumber(vValue) {
    return Number.isFinite(vValue) && vValue > 0;
  }

  function isNonEmptyString(sValue) {
    return typeof sValue === "string" && Boolean(sValue.trim());
  }

  function isObject(vValue) {
    return Boolean(vValue) && typeof vValue === "object" && !Array.isArray(vValue);
  }

  function createError(sCode) {
    var oError = new Error(sCode);
    oError.code = sCode;
    return oError;
  }

  return {
    load: load,
    filterSnapshot: filterSnapshot
  };
});
