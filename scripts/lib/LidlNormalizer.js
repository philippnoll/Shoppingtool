"use strict";

function normalizeFlyer(oResponse, oOptions) {
  var oFlyer;
  var oConfig = oOptions || {};

  if (!oResponse || !oResponse.flyer) {
    throw new TypeError("A Lidl response with a flyer is required");
  }

  oFlyer = oResponse.flyer;

  return {
    source: "lidl-flyer",
    chain: "Lidl",
    storeId: oConfig.storeId || null,
    flyerId: oFlyer.id,
    flyerName: oFlyer.name,
    title: oFlyer.title,
    validFrom: oFlyer.offerStartDate || oFlyer.startDate,
    validTo: oFlyer.offerEndDate || oFlyer.endDate,
    sourceUrl: oFlyer.flyerUrlAbsolute,
    fetchedAt: oConfig.fetchedAt || null,
    pages: (oFlyer.pages || []).map(normalizePage)
  };
}

function normalizePage(oPage) {
  return {
    sourcePage: oPage.number,
    rawKeywords: oPage.keyWords || "",
    rawDescription: oPage.altText || "",
    imageUrl: oPage.zoom || oPage.image || null
  };
}

module.exports = {
  normalizeFlyer: normalizeFlyer
};
