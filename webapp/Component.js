sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "shoppingtool/model/OfferModel"
], function (UIComponent, JSONModel, OfferModel) {
  "use strict";

  return UIComponent.extend("shoppingtool.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      this.setModel(new JSONModel({
        inputText: "",
        optimizationSettings: {
          extraStorePenalty: 7
        },
        optimizationResult: {
          hasResult: false
        },
        items: [],
        nextId: 1
      }));

      this.setModel(new JSONModel(OfferModel.createInitialData()), "offers");
      OfferModel.refresh(this.getModel("offers"));
      this._scheduleOfferDateRefresh();
      this._onVisibilityChange = this._onVisibilityChange.bind(this);
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    },

    onExit: function () {
      clearTimeout(this._offerDateRefreshTimer);
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
    },

    _onVisibilityChange: function () {
      if (document.visibilityState === "visible") {
        this._refreshVisibleOffers();
      }
    },

    _scheduleOfferDateRefresh: function () {
      var oNow = new Date();
      var oNextUtcDate = new Date(Date.UTC(oNow.getUTCFullYear(), oNow.getUTCMonth(), oNow.getUTCDate() + 1));

      clearTimeout(this._offerDateRefreshTimer);
      this._offerDateRefreshTimer = setTimeout(function () {
        this._refreshVisibleOffers();
        this._scheduleOfferDateRefresh();
      }.bind(this), oNextUtcDate.getTime() - oNow.getTime());
    },

    _refreshVisibleOffers: function () {
      this.getModel().setProperty("/optimizationResult", { hasResult: false });
      OfferModel.refresh(this.getModel("offers"));
    }
  });
});
