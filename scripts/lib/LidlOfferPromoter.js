"use strict";

const ProductMatcher = require("./ProductMatcher");

const ALLOWED_UNITS = new Set(["g", "kg", "ml", "l", "Stk"]);
const ALLOWED_PRICE_TYPES = new Set(["offer", "lidl-plus"]);
const DEFAULT_MINIMUM_PARSER_CONFIDENCE = 0.9;
const DEFAULT_MINIMUM_MATCH_CONFIDENCE = 0.9;

function promote(aCandidates, aStores, oOptions) {
  const aInputCandidates = Array.isArray(aCandidates) ? aCandidates : [];
  const mStores = buildStoreMap(aStores);
  const oPromotionOptions = oOptions || {};
  const sReferenceDate = normalizeReferenceDate(oPromotionOptions.referenceDate);
  const fMinimumParserConfidence = oPromotionOptions.minimumParserConfidence === undefined
    ? DEFAULT_MINIMUM_PARSER_CONFIDENCE
    : oPromotionOptions.minimumParserConfidence;
  const fMinimumMatchConfidence = oPromotionOptions.minimumMatchConfidence === undefined
    ? DEFAULT_MINIMUM_MATCH_CONFIDENCE
    : oPromotionOptions.minimumMatchConfidence;
  const oSeenSourceKeys = new Set();
  const aOptimizerOffers = [];
  const aReviewEntries = aInputCandidates.map(function (oCandidateInput, iCandidateIndex) {
    const oCandidate = isObject(oCandidateInput) ? oCandidateInput : {};
    const oMatch = ProductMatcher.match(oCandidate.rawName);
    const aReasons = validateCandidate(
      oCandidate,
      mStores,
      sReferenceDate,
      fMinimumParserConfidence
    );
    const sSourceKey = createSourceKey(oCandidate);
    const oPriceCondition = createPriceCondition(oCandidate.priceType);

    addMatchReason(aReasons, oMatch, fMinimumMatchConfidence);

    if (oPriceCondition) {
      aReasons.push("lidl-plus-required");
    }

    if (oSeenSourceKeys.has(sSourceKey)) {
      aReasons.push("duplicate-candidate");
    } else {
      oSeenSourceKeys.add(sSourceKey);
    }

    const oEntry = {
      candidateIndex: iCandidateIndex,
      status: aReasons.length ? "review" : "optimizer-ready",
      reasons: aReasons,
      candidate: oCandidateInput,
      parser: {
        confidence: oCandidate.confidence
      },
      match: oMatch,
      priceCondition: oPriceCondition
    };

    if (!aReasons.length) {
      aOptimizerOffers.push(createOptimizerOffer(oCandidate, mStores[oCandidate.storeId], oMatch));
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

function promoteDocument(oCandidateDocument, aStores, oOptions) {
  const oDocument = isObject(oCandidateDocument) ? oCandidateDocument : {};
  const aCandidates = Array.isArray(oDocument.candidates) ? oDocument.candidates : oDocument.offers;

  if (!Array.isArray(aCandidates)) {
    throw new Error("Candidate document must contain a candidates array");
  }

  const oPromotionOptions = oOptions || {};
  const sGeneratedAt = oPromotionOptions.generatedAt || new Date().toISOString();
  const oResult = promote(aCandidates, aStores, oPromotionOptions);
  const oMetadata = {
    source: oDocument.source || "lidl-pdf",
    flyerId: oDocument.flyerId || null,
    storeId: oDocument.storeId || null,
    validFrom: oDocument.validFrom || null,
    validTo: oDocument.validTo || null,
    generatedAt: sGeneratedAt,
    referenceDate: oResult.referenceDate,
    provenance: oDocument.provenance || null
  };

  return {
    review: Object.assign({
      kind: "lidl-offer-review"
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

function validateCandidate(oCandidate, mStores, sReferenceDate, fMinimumParserConfidence) {
  const aReasons = [];
  const bValidFrom = isIsoDate(oCandidate.validFrom);
  const bValidTo = isIsoDate(oCandidate.validTo);

  if (oCandidate.source !== "lidl-pdf") {
    aReasons.push("invalid-source");
  }

  if (oCandidate.chain !== "Lidl") {
    aReasons.push("invalid-chain");
  }

  if (!isNonEmptyString(oCandidate.rawName)) {
    aReasons.push("missing-raw-name");
  }

  if (!isNonEmptyString(oCandidate.storeId)) {
    aReasons.push("missing-store-id");
  } else if (!mStores[oCandidate.storeId]) {
    aReasons.push("unknown-store");
  } else if (mStores[oCandidate.storeId].chain !== oCandidate.chain) {
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

  if (!Number.isInteger(oCandidate.sourcePage) || oCandidate.sourcePage <= 0) {
    aReasons.push("invalid-source-page");
  }

  if (!isPositiveNumber(oCandidate.packageQuantity)) {
    aReasons.push("invalid-package-quantity");
  }

  if (!ALLOWED_UNITS.has(oCandidate.packageUnit)) {
    aReasons.push("unsupported-package-unit");
  }

  if (!isPositiveNumber(oCandidate.price)) {
    aReasons.push("invalid-price");
  }

  if (!ALLOWED_PRICE_TYPES.has(oCandidate.priceType)) {
    aReasons.push("unsupported-price-type");
  }

  if (!isConfidence(oCandidate.confidence)) {
    aReasons.push("invalid-parser-confidence");
  } else if (oCandidate.confidence < fMinimumParserConfidence) {
    aReasons.push("low-parser-confidence");
  }

  if (!hasSourcePosition(oCandidate.sourcePosition)) {
    aReasons.push("invalid-source-position");
  }

  return aReasons;
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

    return;
  }

  if (!isConfidence(oMatch.confidence) || oMatch.confidence < fMinimumMatchConfidence) {
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
    sourcePage: oCandidate.sourcePage,
    priceType: oCandidate.priceType,
    priceCondition: null,
    parserConfidence: oCandidate.confidence,
    matchType: oMatch.matchType,
    matchConfidence: oMatch.confidence,
    matchedTerm: oMatch.matchedTerm
  };
}

function createPriceCondition(sPriceType) {
  return sPriceType === "lidl-plus" ? {
    type: "loyalty-program",
    program: "Lidl Plus",
    required: true
  } : null;
}

function createSourceKey(oCandidate) {
  const oPosition = oCandidate.sourcePosition || {};

  return JSON.stringify([
    oCandidate.source,
    oCandidate.storeId,
    oCandidate.validFrom,
    oCandidate.validTo,
    oCandidate.sourcePage,
    oPosition.x,
    oPosition.y
  ]);
}

function createSummary(aReviewEntries, aOptimizerOffers) {
  const mReasonCounts = countValues(aReviewEntries.flatMap(function (oEntry) {
    return oEntry.reasons;
  }));
  const mMatchTypeCounts = countValues(aReviewEntries.map(function (oEntry) {
    return oEntry.match.matchType;
  }));

  return {
    candidateCount: aReviewEntries.length,
    optimizerReadyCount: aOptimizerOffers.length,
    reviewCount: aReviewEntries.length - aOptimizerOffers.length,
    reasonCounts: mReasonCounts,
    matchTypeCounts: mMatchTypeCounts
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
    ? vReferenceDate.toISOString().slice(0, 10)
    : vReferenceDate || new Date().toISOString().slice(0, 10);

  if (!isIsoDate(sReferenceDate)) {
    throw new Error("referenceDate must use YYYY-MM-DD");
  }

  return sReferenceDate;
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

function hasSourcePosition(oPosition) {
  return isObject(oPosition) && Number.isFinite(oPosition.x) && Number.isFinite(oPosition.y);
}

function isObject(vValue) {
  return Boolean(vValue) && typeof vValue === "object" && !Array.isArray(vValue);
}

module.exports = {
  promote: promote,
  promoteDocument: promoteDocument
};
