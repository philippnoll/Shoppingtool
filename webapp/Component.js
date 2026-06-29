sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
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
        productCatalog: [
          { key: "butter", name: "Butter" },
          { key: "milch", name: "Milch" },
          { key: "tomaten", name: "Tomaten" },
          { key: "brot", name: "Brot" },
          { key: "eier", name: "Eier" },
          { key: "kaese", name: "Kaese" },
          { key: "nudeln", name: "Nudeln" },
          { key: "reis", name: "Reis" }
        ],
        items: [],
        nextId: 1
      }));
    }
  });
});
