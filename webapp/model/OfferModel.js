sap.ui.define([
  "shoppingtool/model/OfferData"
], function (OfferData) {
  "use strict";

  function createInitialData() {
    return {
      status: "loading",
      loading: true,
      offers: [],
      excludedCount: 0,
      excludedReasons: [],
      referenceDate: "",
      generatedAt: "",
      isDemo: false,
      loadedAt: "",
      errorMessage: ""
    };
  }

  function refresh(oModel, oOptions) {
    oModel.setData(createInitialData());

    return OfferData.load(oOptions).then(function (oResult) {
      oModel.setData({
        status: oResult.offers.length ? "ready" : "empty",
        loading: false,
        offers: oResult.offers,
        excludedCount: oResult.excludedCount,
        excludedReasons: oResult.excludedReasons,
        referenceDate: oResult.referenceDate,
        generatedAt: oResult.generatedAt,
        isDemo: oResult.isDemo,
        loadedAt: new Date().toISOString(),
        errorMessage: ""
      });

      return oResult;
    }).catch(function (oError) {
      oModel.setData({
        status: "error",
        loading: false,
        offers: [],
        excludedCount: 0,
        excludedReasons: [],
        referenceDate: "",
        generatedAt: "",
        isDemo: false,
        loadedAt: "",
        errorMessage: getErrorMessage(oError)
      });

      return null;
    });
  }

  function getErrorMessage(oError) {
    if (oError && (oError.code === "invalid-offer-snapshot" || oError.code === "invalid-json")) {
      return "Die veröffentlichte Angebotsdatei ist ungültig. Bitte nur einen optimizer-ready Snapshot veröffentlichen.";
    }

    if (oError && oError.code === "invalid-store-catalog") {
      return "Die Markt-Stammdaten konnten nicht gelesen werden. Bitte die Veröffentlichung prüfen.";
    }

    return "Angebote konnten nicht geladen werden. Prüfe die Veröffentlichung und den Server und versuche es erneut.";
  }

  return {
    createInitialData: createInitialData,
    refresh: refresh
  };
});
