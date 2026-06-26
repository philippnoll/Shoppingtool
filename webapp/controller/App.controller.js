sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "shoppingtool/model/ProductRecognition"
], function (Controller, MessageToast, ProductRecognition) {
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

      MessageToast.show(aRecognizedItems.length + " Artikel erkannt.");
    },

    onConfirmItem: function (oEvent) {
      var sPath = oEvent.getSource().getBindingContext().getPath();
      this.getView().getModel().setProperty(sPath + "/status", "confirmed");
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
