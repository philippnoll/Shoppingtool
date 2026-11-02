"use strict";

const ProductMatcher = require("./ProductMatcher");

const SOURCE_URL = "https://www.aldi-nord.de/angebote.html";
const SOURCE_ID = "aldi-nord-current-offers";
const SOURCE_NAME = "aldi-nord-web";
const STORE_ID = "aldi-nord-epe";
const STORE_CHAIN = "ALDI Nord";
const ALLOWED_UNITS = new Set(["g", "kg", "ml", "l", "Stk"]);
const DEFAULT_MINIMUM_MATCH_CONFIDENCE = 0.9;

function parsePage(sHtml) {
  const oNextData = extractNextData(sHtml);
  const oPageProps = oNextData && oNextData.props && oNextData.props.pageProps;

  if (!oPageProps || !isObject(oPageProps.page)) {
    throw new Error("ALDI Nord offers page changed: missing Next.js page data");
  }

  const oApiData = parseApiData(oPageProps.apiData);
  const oOfferResponse = oApiData.find(function (aEntry) {
    return Array.isArray(aEntry) && aEntry[0] === "OFFER_GET";
  });

  if (!oOfferResponse || !isObject(oOfferResponse[1])) {
    throw new Error("ALDI Nord offers page changed: OFFER_GET response is missing");
  }

  const oRequest = oOfferResponse[1].req;
  const oResponse = oOfferResponse[1].res;

  if (!isObject(oRequest) || oRequest.locale !== "de" || oRequest.week !== "current") {
    throw new Error("ALDI Nord offers page changed: expected the current German offer week");
  }

  if (!isObject(oResponse) || !isObject(oResponse.algoliaDataMap)) {
    throw new Error("ALDI Nord offers page changed: product offer map is missing");
  }

  const aProducts = Object.values(oResponse.algoliaDataMap);

  if (!aProducts.length || aProducts.some(function (oProduct) {
    return !isObject(oProduct);
  })) {
    throw new Error("ALDI Nord offers page changed: product offer map is empty or malformed");
  }

  if (oPageProps.page["@name"] !== "angebote" || oPageProps.locale !== "de") {
    throw new Error("ALDI Nord offers page changed: unexpected page or locale");
  }

  return {
    pageName: oPageProps.page["@name"],
    pagePath: oPageProps.page["@path"],
    locale: oPageProps.locale,
    request: oRequest,
    products: aProducts,
    campaignWindows: extractCampaignWindows(oResponse.categories)
  };
}

function createCandidates(oPage, oOptions) {
  const oContext = oOptions || {};
  const sFetchedAt = oContext.fetchedAt || new Date().toISOString();
  const sStoreId = oContext.storeId || STORE_ID;

  return oPage.products.map(function (oProduct) {
    const oPrice = isObject(oProduct.currentPrice) ? oProduct.currentPrice : {};
    const aPromotionPrices = Array.isArray(oProduct.promotionPrices)
      ? oProduct.promotionPrices
      : [];
    const oPromotion = aPromotionPrices.length === 1 && isObject(aPromotionPrices[0])
      ? aPromotionPrices[0]
      : {};
    const oPack = parseSalesUnit(oProduct.salesUnit);
    const aPriceLabels = extractPriceLabels(oPrice.priceTagLabels, oPromotion.priceTagLabels);

    return {
      source: SOURCE_NAME,
      sourceId: SOURCE_ID,
      sourceUrl: SOURCE_URL,
      sourceScope: "aldi-nord-chain",
      chain: STORE_CHAIN,
      storeId: sStoreId,
      sourceProductId: toStringOrNull(oProduct.objectID),
      sourceProductSlug: toStringOrNull(oProduct.productSlug),
      fetchedAt: sFetchedAt,
      rawName: typeof oProduct.name === "string" ? oProduct.name : null,
      productKey: null,
      salesUnit: typeof oProduct.salesUnit === "string" ? oProduct.salesUnit : null,
      packageQuantity: oPack.quantity,
      packageUnit: oPack.unit,
      packageCount: oPack.count,
      packageParseType: oPack.parseType,
      price: oPrice.priceValue,
      promotionPrice: oPromotion.priceValue,
      priceMismatch: oPrice.priceValue !== oPromotion.priceValue,
      regularPrice: getRegularPrice(oPrice),
      validFrom: oPromotion.validFromLocalDate || null,
      validTo: oPromotion.validUntilLocalDate || null,
      promotionCount: aPromotionPrices.length,
      priceType: "offer",
      priceLabels: aPriceLabels,
      conditionalPrice: hasConditionalPrice(aPriceLabels, oProduct),
      isAvailable: oProduct.isAvailable,
      isComingSoon: oProduct.isComingSoon,
      isRecall: oProduct.isRecall,
      parserConfidence: oPack.quantity === null ? 0.5 : 1,
      rawOffer: oProduct
    };
  });
}

function promote(aCandidates, aStores, oOptions) {
  const aInputCandidates = Array.isArray(aCandidates) ? aCandidates : [];
  const mStores = buildStoreMap(aStores);
  const oPromotionOptions = oOptions || {};
  const sReferenceDate = normalizeReferenceDate(oPromotionOptions.referenceDate);
  const fMinimumMatchConfidence = oPromotionOptions.minimumMatchConfidence === undefined
    ? DEFAULT_MINIMUM_MATCH_CONFIDENCE
    : oPromotionOptions.minimumMatchConfidence;
  const oSeenSourceKeys = new Set();
  const aOptimizerOffers = [];
  const aReviewEntries = aInputCandidates.map(function (oInput, iIndex) {
    const oCandidate = isObject(oInput) ? oInput : {};
    const oMatch = ProductMatcher.match(oCandidate.rawName);
    const aReasons = validateCandidate(oCandidate, mStores, sReferenceDate);
    const sSourceKey = createSourceKey(oCandidate);

    addMatchReason(aReasons, oMatch, fMinimumMatchConfidence);

    if (hasSourceProductConflict(oCandidate, oMatch)) {
      aReasons.push("source-product-variant");
    }

    if (oCandidate.conditionalPrice) {
      aReasons.push("conditional-price");
    }

    if (oSeenSourceKeys.has(sSourceKey)) {
      aReasons.push("duplicate-candidate");
    } else {
      oSeenSourceKeys.add(sSourceKey);
    }

    const oEntry = {
      candidateIndex: iIndex,
      status: aReasons.length ? "review" : "optimizer-ready",
      reasons: aReasons,
      candidate: oInput,
      parser: {
        confidence: oCandidate.parserConfidence
      },
      match: oMatch,
      priceCondition: oCandidate.conditionalPrice ? {
        type: "conditional-promotion",
        labels: oCandidate.priceLabels || [],
        required: true
      } : null
    };

    if (!aReasons.length) {
      aOptimizerOffers.push(createOptimizerOffer(
        oCandidate,
        mStores[oCandidate.storeId],
        oMatch
      ));
    }

    return oEntry;
  });

  return {
    referenceDate: sReferenceDate,
    summary: createSummary(aReviewEntries, aOptimizerOffers),
    optimizerOffers: aOptimizerOffers,
    reviewEntries: aReviewEntries
  };
}

function promotePage(sHtml, aStores, oOptions) {
  const oOptionsValue = oOptions || {};
  const oPage = parsePage(sHtml);
  const sFetchedAt = oOptionsValue.fetchedAt || new Date().toISOString();
  const aCandidates = createCandidates(oPage, {
    fetchedAt: sFetchedAt,
    storeId: oOptionsValue.storeId
  });
  const oResult = promote(aCandidates, aStores, oOptionsValue);
  const oStore = buildStoreMap(aStores)[oOptionsValue.storeId || STORE_ID];
  const oMetadata = {
    source: SOURCE_NAME,
    sourceId: SOURCE_ID,
    sourceUrl: SOURCE_URL,
    sourceScope: "aldi-nord-chain",
    storeId: oOptionsValue.storeId || STORE_ID,
    storeName: oStore ? oStore.name : null,
    chain: STORE_CHAIN,
    locale: oPage.locale,
    requestedWeek: oPage.request.week,
    campaignWindows: oPage.campaignWindows,
    fetchedAt: sFetchedAt,
    generatedAt: oOptionsValue.generatedAt || new Date().toISOString(),
    referenceDate: oResult.referenceDate,
    storeSelection: oStore ? {
      storeId: oStore.id,
      storeChain: oStore.chain,
      postalCode: oStore.postalCode,
      city: oStore.city
    } : null,
    localApplicability: {
      scope: "aldi-nord-chain",
      basis: "the selected store belongs to the ALDI Nord chain shown by the official offers page",
      storeLevelStockKnown: false
    }
  };

  return {
    candidates: Object.assign({
      kind: "aldi-nord-offer-candidates"
    }, oMetadata, {
      candidateCount: aCandidates.length,
      candidates: aCandidates
    }),
    review: Object.assign({
      kind: "aldi-nord-offer-review"
    }, oMetadata, {
      summary: oResult.summary,
      entries: oResult.reviewEntries
    }),
    optimizer: Object.assign({
      kind: "optimizer-ready-offers"
    }, oMetadata, {
      offerCount: oResult.optimizerOffers.length,
      offers: oResult.optimizerOffers
    })
  };
}

function validateCandidate(oCandidate, mStores, sReferenceDate) {
  const aReasons = [];
  const bValidFrom = isIsoDate(oCandidate.validFrom);
  const bValidTo = isIsoDate(oCandidate.validTo);
  const oStore = mStores[oCandidate.storeId];

  if (oCandidate.source !== SOURCE_NAME || oCandidate.sourceId !== SOURCE_ID) {
    aReasons.push("invalid-source");
  }

  if (oCandidate.sourceScope !== "aldi-nord-chain") {
    aReasons.push("unknown-source-scope");
  }

  if (oCandidate.chain !== STORE_CHAIN) {
    aReasons.push("invalid-chain");
  }

  if (!isNonEmptyString(oCandidate.rawName)) {
    aReasons.push("missing-raw-name");
  }

  if (!isNonEmptyString(oCandidate.sourceProductId)) {
    aReasons.push("missing-source-product-id");
  }

  if (!isNonEmptyString(oCandidate.storeId)) {
    aReasons.push("missing-store-id");
  } else if (oCandidate.storeId !== STORE_ID) {
    aReasons.push("not-target-store");
  }

  if (isNonEmptyString(oCandidate.storeId) && !oStore) {
    aReasons.push("unknown-store");
  }

  if (oStore && oStore.chain !== oCandidate.chain) {
    aReasons.push("store-chain-mismatch");
  }

  if (!bValidFrom) {
    aReasons.push("invalid-valid-from");
  }

  if (!bValidTo) {
    aReasons.push("invalid-valid-to");
  }

  if (bValidFrom && bValidTo) {
    if (oCandidate.validFrom > oCandidate.validTo) {
      aReasons.push("invalid-validity-range");
    } else if (oCandidate.validTo < sReferenceDate) {
      aReasons.push("expired");
    } else if (oCandidate.validFrom > sReferenceDate) {
      aReasons.push("not-yet-valid");
    }
  }

  if (!isNonEmptyString(oCandidate.salesUnit)) {
    aReasons.push("missing-sales-unit");
  }

  if (!isPositiveNumber(oCandidate.packageQuantity)) {
    aReasons.push("missing-package-quantity");
  }

  if (!ALLOWED_UNITS.has(oCandidate.packageUnit)) {
    aReasons.push("unsupported-package-unit");
  }

  if (!isPositiveNumber(oCandidate.price)) {
    aReasons.push("invalid-price");
  }

  if (oCandidate.promotionCount !== 1) {
    aReasons.push("ambiguous-promotion-price");
  }

  if (oCandidate.priceMismatch) {
    aReasons.push("price-source-mismatch");
  }

  if (!Number.isInteger(oCandidate.packageCount) || oCandidate.packageCount <= 0) {
    aReasons.push("invalid-package-count");
  }

  if (!isConfidence(oCandidate.parserConfidence)) {
    aReasons.push("invalid-parser-confidence");
  } else if (oCandidate.parserConfidence < 0.9) {
    aReasons.push("low-parser-confidence");
  }

  if (oCandidate.isAvailable !== true) {
    aReasons.push("source-unavailable");
  }

  if (oCandidate.isComingSoon === true) {
    aReasons.push("source-coming-soon");
  }

  if (oCandidate.isRecall === true) {
    aReasons.push("source-recalled");
  }

  return aReasons;
}

function hasSourceProductConflict(oCandidate, oMatch) {
  return oMatch.productKey === "reis" && /djuvec|reis[- ]?gericht/i.test(oCandidate.rawName || "");
}

function addMatchReason(aReasons, oMatch, fMinimumMatchConfidence) {
  if (!oMatch.productKey) {
    if (oMatch.matchType === "excluded") {
      aReasons.push("excluded-product");
    } else if (oMatch.matchType === "ambiguous") {
      aReasons.push("ambiguous-product");
    } else {
      aReasons.push("unmatched-product");
    }
  } else if (!isConfidence(oMatch.confidence) || oMatch.confidence < fMinimumMatchConfidence) {
    aReasons.push("low-match-confidence");
  }
}

function createOptimizerOffer(oCandidate, oStore, oMatch) {
  return {
    storeId: oCandidate.storeId,
    storeName: oStore.name,
    chain: oStore.chain,
    productKey: oMatch.productKey,
    offerName: oCandidate.rawName,
    packageQuantity: oCandidate.packageQuantity,
    packageUnit: oCandidate.packageUnit,
    price: oCandidate.price,
    validFrom: oCandidate.validFrom,
    validTo: oCandidate.validTo,
    source: oCandidate.source,
    sourceId: oCandidate.sourceId,
    sourceUrl: oCandidate.sourceUrl,
    sourceProductId: oCandidate.sourceProductId,
    sourceScope: oCandidate.sourceScope,
    localApplicability: {
      scope: oCandidate.sourceScope,
      storeLevelStockKnown: false
    },
    fetchedAt: oCandidate.fetchedAt,
    priceType: oCandidate.priceType
  };
}

function parseSalesUnit(sSalesUnit) {
  if (typeof sSalesUnit !== "string") {
    return emptyPack();
  }

  const sUnit = sSalesUnit.trim();
  const oMeasuredPack = sUnit.match(
    /^(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+|(?:\.\d{3})+)?)\s*[- ]?\s*(kg|g|ml|l)\b/i
  );

  if (oMeasuredPack) {
    const fCount = oMeasuredPack[1] ? Number(oMeasuredPack[1]) : 1;
    const fQuantity = parseLocalizedNumber(oMeasuredPack[2]);
    const sUnitName = oMeasuredPack[3].toLowerCase();

    if (Number.isFinite(fCount) && fCount > 0 && Number.isFinite(fQuantity) && fQuantity > 0) {
      return {
        quantity: roundQuantity(fCount * fQuantity),
        unit: sUnitName,
        count: fCount,
        parseType: oMeasuredPack[1] ? "multipack-measure" : "measured-pack"
      };
    }
  }

  const oCountPack = sUnit.match(/^(\d+)\s*[- ]?er\s*[- ]?pack(?:ung)?$/i);

  if (oCountPack && Number(oCountPack[1]) > 0) {
    return {
      quantity: Number(oCountPack[1]),
      unit: "Stk",
      count: Number(oCountPack[1]),
      parseType: "count-pack"
    };
  }

  if (/^stück$/i.test(sUnit)) {
    return {
      quantity: 1,
      unit: "Stk",
      count: 1,
      parseType: "single-piece"
    };
  }

  return emptyPack();
}

function parseLocalizedNumber(sValue) {
  const sNumber = String(sValue);
  const sNormalized = sNumber.indexOf(",") !== -1
    ? sNumber.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(sNumber)
      ? sNumber.replace(/\./g, "")
      : sNumber;
  const fValue = Number(sNormalized);

  return Number.isFinite(fValue) ? fValue : null;
}

function extractNextData(sHtml) {
  const oMatch = String(sHtml || "").match(
    /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i
  );

  if (!oMatch) {
    throw new Error("ALDI Nord offers page changed: __NEXT_DATA__ was not found");
  }

  try {
    return JSON.parse(oMatch[1]);
  } catch {
    throw new Error("ALDI Nord offers page changed: __NEXT_DATA__ is not valid JSON");
  }
}

function parseApiData(vApiData) {
  if (typeof vApiData !== "string") {
    throw new Error("ALDI Nord offers page changed: apiData is not a JSON string");
  }

  try {
    const vParsed = JSON.parse(vApiData);

    if (!Array.isArray(vParsed)) {
      throw new Error("apiData is not a list");
    }

    return vParsed;
  } catch {
    throw new Error("ALDI Nord offers page changed: apiData could not be decoded");
  }
}

function extractCampaignWindows(vCategories) {
  if (!Array.isArray(vCategories)) {
    return [];
  }

  const mWindows = new Map();

  vCategories.filter(function (oCategory) {
    return isObject(oCategory) && isIsoDate(oCategory.startDate) && isIsoDate(oCategory.endDate);
  }).forEach(function (oCategory) {
    const oWindow = {
      title: oCategory.title || null,
      validFrom: oCategory.startDate,
      validTo: oCategory.endDate
    };
    mWindows.set(JSON.stringify(oWindow), oWindow);
  });

  return Array.from(mWindows.values());
}

function extractPriceLabels() {
  const mLabels = new Map();

  Array.prototype.slice.call(arguments).forEach(function (oLabels) {
    if (isObject(oLabels)) {
      Object.keys(oLabels).sort().forEach(function (sKey) {
        const vLabel = oLabels[sKey];

        if (typeof vLabel === "string" && vLabel.trim()) {
          const oLabel = { key: sKey, text: vLabel.trim() };
          mLabels.set(JSON.stringify(oLabel), oLabel);
        }
      });
    }
  });

  return Array.from(mLabels.values());
}

function hasConditionalPrice(aLabels, oProduct) {
  const sSourceText = [
    oProduct && oProduct.shortDescription,
    oProduct && oProduct.longDescription
  ].filter(function (sText) {
    return typeof sText === "string";
  }).join(" ");
  const aTexts = (Array.isArray(aLabels) ? aLabels : []).map(function (oLabel) {
    return oLabel.text;
  }).concat(sSourceText);

  return aTexts.some(function (sText) {
    return /gratis|\bkaufen\b|\bapp\b|coupon|gutschein|nur\s+mit|kundenkarte|kundenkonto/i.test(sText);
  });
}

function getRegularPrice(oPrice) {
  const oStrikePrice = isObject(oPrice.strikePrice) ? oPrice.strikePrice : {};

  return isPositiveNumber(oStrikePrice.strikePriceValue) ? oStrikePrice.strikePriceValue : null;
}

function createSourceKey(oCandidate) {
  return JSON.stringify([
    oCandidate.source,
    oCandidate.storeId,
    oCandidate.sourceProductId,
    oCandidate.validFrom,
    oCandidate.validTo
  ]);
}

function createSummary(aEntries, aOffers) {
  const aReasons = aEntries.flatMap(function (oEntry) {
    return oEntry.reasons;
  });
  const aMatchTypes = aEntries.map(function (oEntry) {
    return oEntry.match.matchType;
  });

  return {
    candidateCount: aEntries.length,
    optimizerReadyCount: aOffers.length,
    reviewCount: aEntries.length - aOffers.length,
    duplicateCount: aReasons.filter(function (sReason) {
      return sReason === "duplicate-candidate";
    }).length,
    reasonCounts: countValues(aReasons),
    matchTypeCounts: countValues(aMatchTypes)
  };
}

function countValues(aValues) {
  return Array.from(new Set(aValues)).sort().reduce(function (mCounts, sValue) {
    mCounts[sValue] = aValues.filter(function (sCandidateValue) {
      return sCandidateValue === sValue;
    }).length;
    return mCounts;
  }, {});
}

function buildStoreMap(aStores) {
  return (Array.isArray(aStores) ? aStores : []).reduce(function (mStores, oStore) {
    if (oStore && oStore.id) {
      mStores[oStore.id] = oStore;
    }

    return mStores;
  }, {});
}

function normalizeReferenceDate(vReferenceDate) {
  const sReferenceDate = vReferenceDate instanceof Date
    ? getBerlinDate(vReferenceDate)
    : vReferenceDate || getBerlinDate(new Date());

  if (!isIsoDate(sReferenceDate)) {
    throw new Error("referenceDate must use YYYY-MM-DD");
  }

  return sReferenceDate;
}

function getBerlinDate(oDate) {
  const mParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(oDate).reduce(function (mValues, oPart) {
    mValues[oPart.type] = oPart.value;
    return mValues;
  }, {});

  return mParts.year + "-" + mParts.month + "-" + mParts.day;
}

function isIsoDate(sValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sValue || ""))) {
    return false;
  }

  const oDate = new Date(sValue + "T00:00:00.000Z");

  return !Number.isNaN(oDate.getTime()) && oDate.toISOString().slice(0, 10) === sValue;
}

function isConfidence(fValue) {
  return Number.isFinite(fValue) && fValue >= 0 && fValue <= 1;
}

function isPositiveNumber(fValue) {
  return Number.isFinite(fValue) && fValue > 0;
}

function isNonEmptyString(sValue) {
  return typeof sValue === "string" && Boolean(sValue.trim());
}

function toStringOrNull(vValue) {
  return vValue === undefined || vValue === null ? null : String(vValue);
}

function roundQuantity(fQuantity) {
  return Number(fQuantity.toFixed(6));
}

function emptyPack() {
  return {
    quantity: null,
    unit: null,
    count: null,
    parseType: "unsupported"
  };
}

function isObject(vValue) {
  return Boolean(vValue) && typeof vValue === "object" && !Array.isArray(vValue);
}

module.exports = {
  SOURCE_URL: SOURCE_URL,
  STORE_ID: STORE_ID,
  parsePage: parsePage,
  createCandidates: createCandidates,
  promote: promote,
  promotePage: promotePage,
  parseSalesUnit: parseSalesUnit,
  hasConditionalPrice: hasConditionalPrice,
  isIsoDate: isIsoDate
};
