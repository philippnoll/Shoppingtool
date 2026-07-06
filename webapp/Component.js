sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "shoppingtool/model/ProductCatalog",
  "shoppingtool/model/MockOffers"
], function (UIComponent, JSONModel, ProductCatalog, MockOffers) {
  "use strict";

  return UIComponent.extend("shoppingtool.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      this.setModel(new JSONModel({
        inputText: "",
        quickProductText: "",
        productCatalog: ProductCatalog,
        productSuggestions: ProductCatalog,
        offers: MockOffers,
        optimizationResult: {
          hasResult: false,
          bestStore: {
            storeName: "",
            totalPrice: 0,
            matchedItems: [],
            missingItems: []
          },
          splitPlan: {
            totalPrice: 0,
            savingsComparedToBestStore: 0,
            storeCount: 0,
            stores: [],
            matchedItems: [],
            missingItems: []
          },
          stores: []
        },
        items: [],
        nextId: 1
      }));
    }
  });
});
