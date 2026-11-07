"use strict";

const ProductMatcher = require("./ProductMatcher");

const SOURCE_ID = "kk-catalog-text";
const CHAIN_NAME = "K+K";
const ALLOWED_UNITS = new Set(["g", "kg", "ml", "l", "Stk"]);
const DEFAULT_MINIMUM_PARSER_CONFIDENCE = 0.9;
const DEFAULT_MINIMUM_MATCH_CONFIDENCE = 0.9;

function promoteDocument(oCandidateDocument, aStores, oOptions) {
  const oDocument = isObject(oCandidateDocument) ? oCandidateDocument : {};
  const aCandidates = Array.isArray(oDocument.candidates) ? oDocument.candidates : null;

  if (!aCandidates) {
    throw new Error("K+K candidate document must contain a candidates array");
  }

  const oPromotionOptions = oOptions || {};
  const aSelectedStores = resolveSelectedStores(oPromotionOptions.storeIds, aStores);
  const sGeneratedAt = oPromotionOptions.generatedAt || new Date().toISOString();
  const oResult = promote(aCandidates, aSelectedStores, oPromotionOptions);
  const oMetadata = {
    source: oDocument.source || SOURCE_ID,
    chain: oDocument.chain || CHAIN_NAME,
    flyerId: oDocument.flyerId || oDocument.catalogId || null,
    catalogId: oDocument.catalogId || oDocument.flyerId || null,
    storeIds: aSelectedStores.map(function (oStore) {
      return oStore.id;
    }),
    storeSelectionStatus: aSelectedStores.length ? "explicit" : "pending",
    validFrom: oDocument.validFrom || null,
    validTo: oDocument.validTo || null,
    generatedAt: sGeneratedAt,
    referenceDate: oResult.referenceDate
  };

  return {
    review: Object.assign({
      kind: "kk-offer-review"
    }, oMetadata, {
      summary: oResult.summary,
      entries: oResult.reviewEntries
    }),
    optimizer: Object.assign({
      kind: "optimizer-ready-offers"
    }, oMetadata, {
      offerCount: oResult.optimizerOffers.length,
      businessOfferCount: countUniqueSourceOffers(oResult.optimizerOffers),
      offers: oResult.optimizerOffers
    })
  };
}

function promote(aCandidates, aStores, oOptions) {
  const aInputCandidates = Array.isArray(aCandidates) ? aCandidates : [];
  const aSelectedStores = Array.isArray(aStores) ? aStores : [];
  const oPromotionOptions = oOptions || {};
  const sReferenceDate = normalizeReferenceDate(oPromotionOptions.referenceDate);
  const fMinimumParserConfidence = oPromotionOptions.minimumParserConfidence === undefined
    ? DEFAULT_MINIMUM_PARSER_CONFIDENCE
    : oPromotionOptions.minimumParserConfidence;
  const fMinimumMatchConfidence = oPromotionOptions.minimumMatchConfidence === undefined
    ? DEFAULT_MINIMUM_MATCH_CONFIDENCE
    : oPromotionOptions.minimumMatchConfidence;
  const oSeenSourceIds = new Set();
  const aOptimizerOffers = [];
  const aReviewEntries = aInputCandidates.map(function (oCandidateInput, iCandidateIndex) {
    const oCandidate = isObject(oCandidateInput) ? oCandidateInput : {};
    const oMatch = ProductMatcher.match(oCandidate.rawName);
    const aReasons = validateCandidate(oCandidate, sReferenceDate, fMinimumParserConfidence);
    const sSourceOfferId = oCandidate.sourceOfferId || null;

    addMatchReason(aReasons, oMatch, fMinimumMatchConfidence);

    if (sSourceOfferId && oSeenSourceIds.has(sSourceOfferId)) {
      aReasons.push("duplicate-candidate");
    } else if (sSourceOfferId) {
      oSeenSourceIds.add(sSourceOfferId);
    }

    if (!aSelectedStores.length) {
      aReasons.push("store-selection-pending");
    }

    const oEntry = {
      candidateIndex: iCandidateIndex,
      status: aReasons.length ? "review" : "optimizer-ready",
      reasons: Array.from(new Set(aReasons)),
      candidate: oCandidateInput,
      parser: {
        confidence: oCandidate.confidence
      },
      match: oMatch,
      priceCondition: null
    };

    if (!aReasons.length) {
      aSelectedStores.forEach(function (oStore) {
        aOptimizerOffers.push(createOptimizerOffer(oCandidate, oStore, oMatch));
      });
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

function validateCandidate(oCandidate, sReferenceDate, fMinimumParserConfidence) {
  const aReasons = [];
  const bValidFrom = isIsoDate(oCandidate.validFrom);
  const bValidTo = isIsoDate(oCandidate.validTo);

  if (oCandidate.source !== SOURCE_ID) {
    aReasons.push("invalid-source");
  }

  if (oCandidate.chain !== CHAIN_NAME) {
    aReasons.push("invalid-chain");
  }

  if (!isNonEmptyString(oCandidate.sourceOfferId)) {
    aReasons.push("missing-source-offer-id");
  }

  if (!isNonEmptyString(oCandidate.rawName)) {
    aReasons.push("missing-raw-name");
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
    aReasons.push(oCandidate.packageQuantity === null || oCandidate.packageQuantity === undefined
      ? "missing-package-quantity"
      : "invalid-package-quantity");
  }

  if (!ALLOWED_UNITS.has(oCandidate.packageUnit)) {
    aReasons.push(oCandidate.packageUnit === null || oCandidate.packageUnit === undefined
      ? "missing-package-unit"
      : "unsupported-package-unit");
  }

  if (!isPositiveNumber(oCandidate.price)) {
    aReasons.push(oCandidate.price === null || oCandidate.price === undefined
      ? "missing-price"
      : "invalid-price");
  }

  if (oCandidate.priceType !== "offer") {
    aReasons.push("unsupported-price-type");
  }

  if (!isConfidence(oCandidate.confidence)) {
    aReasons.push("invalid-parser-confidence");
  } else if (oCandidate.confidence < fMinimumParserConfidence) {
    aReasons.push("low-parser-confidence");
  }

  if (!isObject(oCandidate.sourceEvidence) ||
    !isNonEmptyString(oCandidate.sourceEvidence.textUrl) ||
    !isNonEmptyString(oCandidate.sourceEvidence.excerpt)) {
    aReasons.push("missing-source-evidence");
  }

  (oCandidate.sourceEvidence && Array.isArray(oCandidate.sourceEvidence.reviewHints)
    ? oCandidate.sourceEvidence.reviewHints
    : []).forEach(function (sHint) {
    aReasons.push(sHint);
  });

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
    storeId: oStore.id,
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
    matchedTerm: oMatch.matchedTerm,
    sourceOfferId: oCandidate.sourceOfferId
  };
}

function resolveSelectedStores(aStoreIds, aStores) {
  const aRequestedIds = Array.isArray(aStoreIds) ? aStoreIds : [];
  const mStores = (Array.isArray(aStores) ? aStores : []).reduce(function (mResult, oStore) {
    if (oStore && oStore.id) {
      mResult[oStore.id] = oStore;
    }

    return mResult;
  }, {});
  const aSeenIds = new Set();

  return aRequestedIds.map(function (sStoreId) {
    if (!isNonEmptyString(sStoreId)) {
      throw new Error("K+K storeIds must contain non-empty store IDs");
    }

    if (aSeenIds.has(sStoreId)) {
      throw new Error("Duplicate K+K store ID: " + sStoreId);
    }

    aSeenIds.add(sStoreId);
    const oStore = mStores[sStoreId];

    if (!oStore) {
      throw new Error("Unknown K+K store ID: " + sStoreId);
    }

    if (oStore.chain !== CHAIN_NAME) {
      throw new Error("Store chain mismatch for K+K source: " + sStoreId);
    }

    if (String(oStore.postalCode || "") !== "48599" || !/epe/i.test(String(oStore.city || ""))) {
      throw new Error("K+K source is limited to the verified 48599 Epe store area: " + sStoreId);
    }

    return oStore;
  });
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
    optimizerReadyBusinessCount: countUniqueSourceOffers(aOptimizerOffers),
    reviewCount: aReviewEntries.filter(function (oEntry) {
      return oEntry.status === "review";
    }).length,
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

function countUniqueSourceOffers(aOffers) {
  return new Set(aOffers.map(function (oOffer) {
    return oOffer.sourceOfferId;
  })).size;
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

function isObject(vValue) {
  return Boolean(vValue) && typeof vValue === "object" && !Array.isArray(vValue);
}

module.exports = {
  promote: promote,
  promoteDocument: promoteDocument
};
