sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "shoppingtool/model/ProductRecognition",
  "shoppingtool/model/ProductSearch"
], function (Controller, MessageToast, ProductRecognition, ProductSearch) {
  "use strict";

  return Controller.extend("shoppingtool.controller.App", {
    onRecognize: function () {
      var oModel = this.getView().getModel();
      var sInput = (oModel.getProperty("/inputText") || "").trim();

      if (!sInput) {
        MessageToast.show("Bitte gib zuerst Produkte ein.");
        return;
      }

      var aItems = oModel.getProperty("/items").slice();
      var iNextId = oModel.getProperty("/nextId");
      var aRecognizedItems = ProductRecognition.parse(sInput).map(function (oCandidate) {
        return Object.assign({ id: iNextId++, purchased: false }, oCandidate);
      });

      oModel.setProperty("/items", aItems.concat(aRecognizedItems));
      oModel.setProperty("/nextId", iNextId);
      oModel.setProperty("/inputText", "");

      MessageToast.show(aRecognizedItems.length + " Artikel erkannt.");
    },

    onProductSuggestionSelected: function (oEvent) {
      var oSelectedItem = oEvent.getParameter("selectedItem");

      if (oSelectedItem) {
        this.getView().getModel().setProperty("/quickProductText", oSelectedItem.getText());
      }
    },

    onSuggestProduct: function (oEvent) {
      var oModel = this.getView().getModel();
      var sValue = oEvent.getParameter("suggestValue");
      var aProductCatalog = oModel.getProperty("/productCatalog");

      oModel.setProperty("/productSuggestions", ProductSearch.search(aProductCatalog, sValue));
    },

    onAppendQuickProduct: function () {
      var oModel = this.getView().getModel();
      var sQuickProductText = (oModel.getProperty("/quickProductText") || "").trim();
      var sInputText = (oModel.getProperty("/inputText") || "").trim();

      if (!sQuickProductText) {
        MessageToast.show("Bitte waehle oder tippe zuerst ein Produkt.");
        return;
      }

      oModel.setProperty("/inputText", sInputText ? sInputText + ", " + sQuickProductText : sQuickProductText);
      oModel.setProperty("/quickProductText", "");
    },

    onDeleteItem: function (oEvent) {
      var oModel = this.getView().getModel();
      var sPath = oEvent.getSource().getBindingContext().getPath();
      var iIndex = Number(sPath.split("/").pop());
      var aItems = oModel.getProperty("/items").slice();

      aItems.splice(iIndex, 1);
      oModel.setProperty("/items", aItems);
    }
  });
});
