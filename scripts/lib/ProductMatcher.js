"use strict";

const ProductCatalog = require("../../webapp/model/ProductCatalog");

function match(sRawName, aProducts) {
  const sNormalizedName = normalizeText(sRawName);
  const aCatalog = aProducts || ProductCatalog;
  const aMatches = [];
  const aExcludedProductKeys = [];

  if (!sNormalizedName) {
    return createUnmatchedResult(sRawName, "none", [], []);
  }

  aCatalog.forEach(function (oProduct) {
    if (isExcluded(sNormalizedName, oProduct.offerExclusions || [])) {
      aExcludedProductKeys.push(oProduct.key);
      return;
    }

    const oMatch = findProductMatch(sNormalizedName, oProduct);

    if (oMatch) {
      aMatches.push(Object.assign({ productKey: oProduct.key }, oMatch));
    }
  });

  if (aMatches.length > 1) {
    return createUnmatchedResult(sRawName, "ambiguous", aMatches.map(function (oMatch) {
      return oMatch.productKey;
    }), aExcludedProductKeys);
  }

  if (aMatches.length === 1) {
    return {
      rawName: sRawName,
      productKey: aMatches[0].productKey,
      matchType: aMatches[0].matchType,
      confidence: aMatches[0].confidence,
      matchedTerm: aMatches[0].matchedTerm,
      candidateKeys: [aMatches[0].productKey],
      excludedProductKeys: aExcludedProductKeys.sort()
    };
  }

  return createUnmatchedResult(
    sRawName,
    aExcludedProductKeys.length ? "excluded" : "none",
    [],
    aExcludedProductKeys
  );
}

function findProductMatch(sNormalizedName, oProduct) {
  const aCatalogTerms = uniqueNormalizedTerms([oProduct.key, oProduct.name]);
  const aOfferAliases = uniqueNormalizedTerms(oProduct.offerAliases || []);

  return findExactMatch(sNormalizedName, aCatalogTerms, "catalog-exact", 1) ||
    findExactMatch(sNormalizedName, aOfferAliases, "offer-alias-exact", 0.98) ||
    findContainedMatch(sNormalizedName, aCatalogTerms, "catalog-term", 0.95) ||
    findContainedMatch(sNormalizedName, aOfferAliases, "offer-alias-term", 0.9);
}

function findExactMatch(sNormalizedName, aTerms, sMatchType, fConfidence) {
  const sMatchedTerm = aTerms.find(function (sTerm) {
    return sNormalizedName === sTerm;
  });

  return sMatchedTerm ? {
    matchType: sMatchType,
    confidence: fConfidence,
    matchedTerm: sMatchedTerm
  } : null;
}

function findContainedMatch(sNormalizedName, aTerms, sMatchType, fConfidence) {
  const sMatchedTerm = aTerms.find(function (sTerm) {
    return containsWholeTerm(sNormalizedName, sTerm);
  });

  return sMatchedTerm ? {
    matchType: sMatchType,
    confidence: fConfidence,
    matchedTerm: sMatchedTerm
  } : null;
}

function isExcluded(sNormalizedName, aExclusions) {
  const sCompactName = compactText(sNormalizedName);

  return aExclusions.some(function (sExclusion) {
    const sNormalizedExclusion = normalizeText(sExclusion);

    return containsWholeTerm(sNormalizedName, sNormalizedExclusion) ||
      sCompactName.indexOf(compactText(sNormalizedExclusion)) !== -1;
  });
}

function containsWholeTerm(sText, sTerm) {
  return (" " + sText + " ").indexOf(" " + sTerm + " ") !== -1;
}

function uniqueNormalizedTerms(aTerms) {
  return Array.from(new Set(aTerms.map(normalizeText).filter(Boolean)));
}

function normalizeText(sText) {
  return String(sText || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(sText) {
  return sText.replace(/\s+/g, "");
}

function createUnmatchedResult(sRawName, sMatchType, aCandidateKeys, aExcludedProductKeys) {
  return {
    rawName: sRawName,
    productKey: null,
    matchType: sMatchType,
    confidence: 0,
    matchedTerm: null,
    candidateKeys: Array.from(new Set(aCandidateKeys)).sort(),
    excludedProductKeys: Array.from(new Set(aExcludedProductKeys)).sort()
  };
}

module.exports = {
  match: match
};
