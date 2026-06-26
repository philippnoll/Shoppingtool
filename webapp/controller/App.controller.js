sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "shoppingtool/model/ProductRecognition"
], function (Controller, MessageToast, Filter, FilterOperator, ProductRecognition) {
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
        return Object.assign({ id: iNextId++, status: "candidate" }, oCandidate);
      });

      oModel.setProperty("/items", aItems.concat(aRecognizedItems));
      oModel.setProperty("/nextId", iNextId);
      oModel.setProperty("/inputText", "");
      this._applyItemFilter();

      MessageToast.show(aRecognizedItems.length + " Artikel erkannt.");
    },

    onConfirmItem: function (oEvent) {
      var sPath = oEvent.getSource().getBindingContext().getPath();
      this.getView().getModel().setProperty(sPath + "/status", "confirmed");
      this._applyItemFilter();
    },

    onFilterChange: function (oEvent) {
      this.getView().getModel().setProperty("/filter", oEvent.getSource().getSelectedKey());
      this._applyItemFilter();
    },

    onDeleteItem: function (oEvent) {
      var oModel = this.getView().getModel();
      var sPath = oEvent.getSource().getBindingContext().getPath();
      var iIndex = Number(sPath.split("/").pop());
      var aItems = oModel.getProperty("/items").slice();

      aItems.splice(iIndex, 1);
      oModel.setProperty("/items", aItems);
      this._applyItemFilter();
    },

    _applyItemFilter: function () {
      var sFilter = this.getView().getModel().getProperty("/filter");
      var oBinding = this.byId("shoppingList").getBinding("items");
      var aFilters = [];

      if (sFilter !== "all") {
        aFilters.push(new Filter("status", FilterOperator.EQ, sFilter));
      }

      oBinding.filter(aFilters);
    }
  });
});
