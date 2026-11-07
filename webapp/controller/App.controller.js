sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "shoppingtool/model/ProductRecognition",
  "shoppingtool/model/ShoppingOptimizer",
  "shoppingtool/model/OfferModel"
], function (Controller, MessageToast, ProductRecognition, ShoppingOptimizer, OfferModel) {
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
      var oOffersModel = this.getView().getModel("offers");
      var sOfferStatus = oOffersModel.getProperty("/status");
      var aItems = oModel.getProperty("/items");
      var aOffers = oOffersModel.getProperty("/offers");
      var oSettings = oModel.getProperty("/optimizationSettings");

      if (!aItems.length) {
        MessageToast.show("Bitte lege zuerst Artikel in die Einkaufsliste.");
        return;
      }

      if (sOfferStatus === "loading") {
        MessageToast.show("Aktuelle Angebote werden noch geladen.");
        return;
      }

      if (sOfferStatus === "error") {
        MessageToast.show("Lade zuerst aktuelle Angebotsdaten oder versuche es erneut.");
        return;
      }

      if (oOffersModel.getProperty("/referenceDate") !== new Date().toISOString().slice(0, 10)) {
        this.onRefreshOffers();
        MessageToast.show("Angebote für den heutigen Tag werden neu geladen. Bitte danach erneut optimieren.");
        return;
      }

      oModel.setProperty("/optimizationResult", ShoppingOptimizer.optimize(aItems, aOffers, oSettings));
    },

    onRefreshOffers: function () {
      this._clearOptimizationResult();
      return OfferModel.refresh(this.getView().getModel("offers"));
    },

    onListItemChanged: function () {
      this._clearOptimizationResult();
    },

    _clearOptimizationResult: function () {
      this.getView().getModel().setProperty("/optimizationResult", {
        hasResult: false
      });
    }
  });
});
