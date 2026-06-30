sap.ui.define([], function () {
  "use strict";

  function search(aProducts, sQuery) {
    var sNormalizedQuery = normalizeSearchText(sQuery);

    if (!sNormalizedQuery) {
      return aProducts.slice();
    }

    if (typeof window === "undefined" || !window.MiniSearch) {
      return fallbackSearch(aProducts, sNormalizedQuery);
    }

    var oMiniSearch = new window.MiniSearch({
      idField: "key",
      fields: ["key", "name", "normalizedName"],
      storeFields: ["key", "name", "quantity", "unit"],
      searchOptions: {
        prefix: true,
        fuzzy: 0.4
      }
    });
    var aSearchProducts = aProducts.map(function (oProduct) {
      return Object.assign({}, oProduct, {
        normalizedName: normalizeSearchText(oProduct.name)
      });
    });

    oMiniSearch.addAll(aSearchProducts);

    return oMiniSearch.search(sNormalizedQuery).map(function (oResult) {
      return {
        key: oResult.key,
        name: oResult.name,
        quantity: oResult.quantity,
        unit: oResult.unit
      };
    });
  }

  function fallbackSearch(aProducts, sQuery) {
    return aProducts.filter(function (oProduct) {
      return normalizeSearchText(oProduct.name).indexOf(sQuery) !== -1 ||
        normalizeSearchText(oProduct.key).indexOf(sQuery) !== -1;
    });
  }

  function normalizeSearchText(sText) {
    return (sText || "")
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss");
  }

  return {
    search: search
  };
});
