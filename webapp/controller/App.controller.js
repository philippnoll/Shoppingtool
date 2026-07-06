sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "shoppingtool/model/ProductRecognition",
  "shoppingtool/model/ShoppingOptimizer"
], function (Controller, MessageToast, ProductRecognition, ShoppingOptimizer) {
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
      this._clearOptimizationResult();

      MessageToast.show(aRecognizedItems.length + " Artikel erkannt.");
    },

    onDeleteItem: function (oEvent) {
      var oModel = this.getView().getModel();
      var sPath = oEvent.getSource().getBindingContext().getPath();
      var iIndex = Number(sPath.split("/").pop());
      var aItems = oModel.getProperty("/items").slice();

      aItems.splice(iIndex, 1);
      oModel.setProperty("/items", aItems);
      this._clearOptimizationResult();
    },

    onOptimizeShopping: function () {
      var oModel = this.getView().getModel();
      var aItems = oModel.getProperty("/items");
      var aOffers = oModel.getProperty("/offers");
      var oSettings = oModel.getProperty("/optimizationSettings");

      if (!aItems.length) {
        MessageToast.show("Bitte lege zuerst Artikel in die Einkaufsliste.");
        return;
      }

      oModel.setProperty("/optimizationResult", ShoppingOptimizer.optimize(aItems, aOffers, oSettings));
    },

    _clearOptimizationResult: function () {
      this.getView().getModel().setProperty("/optimizationResult", {
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
          effectiveSavings: 0,
          extraStoreCount: 0,
          extraStorePenalty: 7,
          totalExtraStorePenalty: 0,
          isWorthwhile: false,
          storeCount: 0,
          stores: [],
          matchedItems: [],
          missingItems: []
        },
        stores: []
      });
    }
  });
});
