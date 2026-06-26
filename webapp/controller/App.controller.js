sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast"
], function (Controller, MessageToast) {
  "use strict";

  var PRODUCT_RULES = {
    buttermann: { name: "Butter", quantity: 1, unit: "Stk" },
    butter: { name: "Butter", quantity: 1, unit: "Stk" },
    milch: { name: "Milch", quantity: 1, unit: "l" },
    tomaten: { name: "Tomaten", quantity: 500, unit: "g" },
    tomate: { name: "Tomaten", quantity: 500, unit: "g" },
    brot: { name: "Brot", quantity: 1, unit: "Stk" },
    eier: { name: "Eier", quantity: 10, unit: "Stk" }
  };

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
      var aRecognizedItems = this._parseInput(sInput).map(function (oCandidate) {
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
    },

    _parseInput: function (sInput) {
      return sInput
        .split(/[\n,;]+/)
        .map(function (sToken) {
          return sToken.trim();
        })
        .filter(Boolean)
        .map(this._recognizeProduct.bind(this));
    },

    _recognizeProduct: function (sRawText) {
      var oQuantityMatch = sRawText.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/);
      var fQuantity = oQuantityMatch ? Number(oQuantityMatch[1].replace(",", ".")) : null;
      var sProductText = oQuantityMatch ? oQuantityMatch[2] : sRawText;
      var sKey = sProductText.toLowerCase();
      var oRule = PRODUCT_RULES[sKey];

      if (oRule) {
        return {
          rawText: sRawText,
          name: oRule.name,
          quantity: fQuantity || oRule.quantity,
          unit: oRule.unit
        };
      }

      return {
        rawText: sRawText,
        name: this._toTitleCase(sProductText),
        quantity: fQuantity || 1,
        unit: "Stk"
      };
    },

    _toTitleCase: function (sText) {
      return sText.charAt(0).toUpperCase() + sText.slice(1).toLowerCase();
    }
  });
});
