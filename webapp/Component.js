sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "shoppingtool/model/ProductCatalog"
], function (UIComponent, JSONModel, ProductCatalog) {
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
        filter: "all",
        productCatalog: ProductCatalog,
        items: [],
        nextId: 1
      }));
    }
  });
});
