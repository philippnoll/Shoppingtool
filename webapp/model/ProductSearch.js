sap.ui.define([], function () {
  "use strict";

  function search(aProducts, sQuery) {
    var sNormalizedQuery = (sQuery || "").trim();

    if (!sNormalizedQuery) {
      return aProducts.slice();
    }

    if (!window.MiniSearch) {
      return fallbackSearch(aProducts, sNormalizedQuery);
    }

    var oMiniSearch = new window.MiniSearch({
      idField: "key",
      fields: ["name"],
      storeFields: ["key", "name"],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2
      }
    });

    oMiniSearch.addAll(aProducts);

    return oMiniSearch.search(sNormalizedQuery).map(function (oResult) {
      return {
        key: oResult.key,
        name: oResult.name
      };
    });
  }

  function fallbackSearch(aProducts, sQuery) {
    var sNormalizedQuery = sQuery.toLowerCase();

    return aProducts.filter(function (oProduct) {
      return oProduct.name.toLowerCase().indexOf(sNormalizedQuery) !== -1;
    });
  }

  return {
    search: search
  };
});
