"use strict";

const { URL } = require("node:url");

const SOURCE_ID = "kk-catalog-text";
const CHAIN_NAME = "K+K";
const KNOWN_PASTA_OFFER = /\bBarilla\s+La\s+Collezione\b/i;
const EXPLICIT_VALIDITY = /\bKW\s*(\d{1,2})\s*\/\s*(\d{2})\.(\d{2})\.(\d{4})\s*[–-]\s*(\d{2})\.(\d{2})\.(\d{4})\b/gi;

function parse(oSource) {
  const oInput = isObject(oSource) ? oSource : {};
  const aPages = Array.isArray(oInput.pages) ? oInput.pages : [];
  const oValidity = extractValidity(aPages);
  const aCandidates = [];
  const aPastaPages = aPages.filter(function (oPage) {
    return KNOWN_PASTA_OFFER.test(String(oPage.text || ""));
  });

  if (aPastaPages.length) {
    aCandidates.push(createPastaCandidate(oInput, aPastaPages, oValidity));
  }

  const aApplePages = aPages.filter(function (oPage) {
    return /\bTAFELÄPFEL\b/i.test(String(oPage.text || ""));
  });

  if (aApplePages.length) {
    aCandidates.push(createIncompleteAppleCandidate(oInput, aApplePages, oValidity));
  }

  return {
    kind: "kk-offer-candidates",
    source: SOURCE_ID,
    chain: CHAIN_NAME,
    flyerId: oInput.catalogId || null,
    catalogId: oInput.catalogId || null,
    viewerCatalogId: oInput.viewerCatalogId || null,
    viewerUrl: oInput.viewerUrl || null,
    catalogXmlUrl: oInput.catalogXmlUrl || null,
    fetchedAt: oInput.fetchedAt || null,
    pageCount: oInput.pageCount || aPages.length,
    validFrom: oValidity.validFrom,
    validTo: oValidity.validTo,
    validityEvidence: oValidity.evidence,
    validityStatus: oValidity.status,
    storeScope: {
      postalCode: "48599",
      city: "Gronau-Epe",
      sharedFlyer: true,
      sourceUrl: "https://www.klaas-und-kock.de/naechster-kk/",
      locations: [
        "Gronauer Str. 105a",
        "Amtsweg 3",
        "Feldkamp 81"
      ]
    },
    parserCoverage: {
      supportedPatterns: [
        "Barilla La Collezione package with an exact printed base price",
        "Tafeläpfel without an explicitly associable package quantity"
      ],
      note: "Other catalog items are retained in the raw source pages but are not parsed into candidates by this conservative first adapter."
    },
    generatedAt: oInput.generatedAt || new Date().toISOString(),
    candidateCount: aCandidates.length,
    candidates: aCandidates
  };
}

function createPastaCandidate(oSource, aPages, oValidity) {
  const oPrimaryPage = aPages[0];
  const oFacts = aPages.length === 1 ? extractPastaFacts(oPrimaryPage.text) : null;
  const sSourcePage = getPageNumber(oPrimaryPage);
  const sCatalogId = oSource.catalogId || "unknown-catalog";
  const sSourcePageUrl = createPageUrl(oSource, sCatalogPagePath(sCatalogId, sSourcePage, "text"));
  const sImageUrl = createPageUrl(oSource, sCatalogPagePath(sCatalogId, sSourcePage, "normal"));

  return {
    sourceOfferId: sCatalogId + ":barilla-la-collezione",
    source: SOURCE_ID,
    chain: CHAIN_NAME,
    rawName: "Barilla La Collezione",
    productKey: null,
    storeId: null,
    validFrom: oValidity.validFrom,
    validTo: oValidity.validTo,
    sourcePage: sSourcePage,
    sourcePages: aPages.map(getPageNumber),
    packageQuantity: oFacts && oFacts.packageQuantity,
    packageUnit: oFacts && oFacts.packageUnit,
    packageCount: oFacts ? 1 : null,
    itemQuantity: oFacts && oFacts.packageQuantity,
    price: oFacts && oFacts.price,
    regularPrice: null,
    basePrice: oFacts && oFacts.basePrice,
    basePriceUnit: oFacts ? "kg" : null,
    priceType: "offer",
    confidence: oFacts ? 0.93 : 0.35,
    priceDerivation: oFacts ? "explicit-base-price-times-explicit-package-quantity" : null,
    sourceEvidence: {
      textUrl: sSourcePageUrl,
      imageUrl: sImageUrl,
      excerpt: oFacts ? oFacts.excerpt : String(oPrimaryPage.text || "").slice(0, 500),
      packageEvidence: oFacts && oFacts.packageEvidence,
      basePriceEvidence: oFacts && oFacts.basePriceEvidence,
      priceDerivation: oFacts && oFacts.priceDerivation,
      reviewHints: oFacts ? [] : ["product-appears-more-than-once-or-package-and-base-price-cannot-be-paired-safely"]
    }
  };
}

function createIncompleteAppleCandidate(oSource, aPages, oValidity) {
  const oPrimaryPage = aPages.find(function (oPage) {
    return getPageNumber(oPage) === 4;
  }) || aPages[0];
  const iNameStart = String(oPrimaryPage.text || "").search(/\bTAFELÄPFEL\b/i);
  const sExcerpt = iNameStart < 0
    ? "TAFELÄPFEL"
    : String(oPrimaryPage.text || "").slice(Math.max(0, iNameStart - 35), iNameStart + 150).trim();
  const sCatalogId = oSource.catalogId || "unknown-catalog";
  const sSourcePage = getPageNumber(oPrimaryPage);

  return {
    sourceOfferId: sCatalogId + ":tafelaepfel",
    source: SOURCE_ID,
    chain: CHAIN_NAME,
    rawName: "Tafeläpfel",
    productKey: null,
    storeId: null,
    validFrom: oValidity.validFrom,
    validTo: oValidity.validTo,
    sourcePage: sSourcePage,
    sourcePages: aPages.map(getPageNumber),
    packageQuantity: null,
    packageUnit: null,
    packageCount: null,
    itemQuantity: null,
    price: null,
    regularPrice: null,
    basePrice: null,
    basePriceUnit: null,
    priceType: "offer",
    confidence: 0.25,
    sourceEvidence: {
      textUrl: createPageUrl(oSource, sCatalogPagePath(sCatalogId, sSourcePage, "text")),
      imageUrl: createPageUrl(oSource, sCatalogPagePath(sCatalogId, sSourcePage, "normal")),
      excerpt: sExcerpt,
      reviewHints: [
        "package-quantity-not-explicitly-associated-with-the-item",
        "price-not-safely-associated-by-the-text-layer"
      ]
    }
  };
}

function extractPastaFacts(sPageText) {
  const sText = String(sPageText || "");
  const oNameMatch = KNOWN_PASTA_OFFER.exec(sText);

  if (!oNameMatch) {
    return null;
  }

  const sAfterName = sText.slice(oNameMatch.index);
  const oNextProductHeading = /\n\s*M[üu]ller[’'´]s\b/i.exec(sAfterName);
  const sOfferSection = oNextProductHeading
    ? sAfterName.slice(0, oNextProductHeading.index)
    : sAfterName.slice(0, 280);
  const aPackageMatches = Array.from(sOfferSection.matchAll(/(\d+(?:[.,]\d+)?)\s*(g|kg)\s+(Tube|Packung)\b/gi));
  const aUnitPriceMatches = Array.from(sOfferSection.matchAll(/1\s*kg\s*=\s*(\d+(?:[.,]\d{2})?)/gi));
  const aPastaPackages = aPackageMatches.filter(function (oMatch) {
    return oMatch[3].toLowerCase() === "packung";
  });

  if (aPackageMatches.length !== aUnitPriceMatches.length || aPastaPackages.length !== 1) {
    return null;
  }

  const oPackageMatch = aPastaPackages[0];
  const iPackageIndex = aPackageMatches.indexOf(oPackageMatch);
  const fPackageAmount = parseGermanNumber(oPackageMatch[1]);
  const sPackageUnit = oPackageMatch[2].toLowerCase();
  const fBasePrice = parseGermanNumber(aUnitPriceMatches[iPackageIndex][1]);

  if (!isPositiveNumber(fPackageAmount) || !isPositiveNumber(fBasePrice)) {
    return null;
  }

  const fQuantityInGrams = sPackageUnit === "kg" ? fPackageAmount * 1000 : fPackageAmount;
  const fUnroundedPrice = fBasePrice * fQuantityInGrams / 1000;
  const fPrice = Math.round((fUnroundedPrice + Number.EPSILON) * 100) / 100;

  if (Math.abs(fPrice - fUnroundedPrice) > 0.000001 || !isPositiveNumber(fPrice)) {
    return null;
  }

  const sPackageEvidence = oPackageMatch[0];
  const sBasePriceEvidence = aUnitPriceMatches[iPackageIndex][0];

  return {
    packageQuantity: fQuantityInGrams,
    packageUnit: "g",
    price: fPrice,
    basePrice: fBasePrice,
    packageEvidence: sPackageEvidence,
    basePriceEvidence: sBasePriceEvidence,
    priceDerivation: fBasePrice + " EUR/kg × " + fQuantityInGrams + " g ÷ 1000 = " + fPrice.toFixed(2) + " EUR",
    excerpt: sOfferSection.trim().slice(0, 500)
  };
}

function extractValidity(aPages) {
  const aRanges = [];

  aPages.forEach(function (oPage) {
    const sText = String(oPage.text || "");

    for (const oMatch of sText.matchAll(EXPLICIT_VALIDITY)) {
      const sValidFrom = germanDateToIso(oMatch[2], oMatch[3], oMatch[4]);
      const sValidTo = germanDateToIso(oMatch[5], oMatch[6], oMatch[7]);

      if (sValidFrom && sValidTo) {
        aRanges.push({
          week: Number(oMatch[1]),
          validFrom: sValidFrom,
          validTo: sValidTo,
          page: getPageNumber(oPage),
          text: oMatch[0]
        });
      }
    }
  });

  const aUniqueRanges = Array.from(new Map(aRanges.map(function (oRange) {
    return [oRange.validFrom + "/" + oRange.validTo, oRange];
  })).values());

  if (aUniqueRanges.length !== 1) {
    return {
      validFrom: null,
      validTo: null,
      status: aUniqueRanges.length ? "conflicting" : "missing",
      evidence: aRanges
    };
  }

  const oRange = aUniqueRanges[0];

  if (oRange.validFrom > oRange.validTo) {
    return {
      validFrom: null,
      validTo: null,
      status: "invalid-range",
      evidence: aRanges
    };
  }

  return {
    validFrom: oRange.validFrom,
    validTo: oRange.validTo,
    status: "explicit",
    evidence: aRanges
  };
}

function germanDateToIso(sDay, sMonth, sYear) {
  const iDay = Number(sDay);
  const iMonth = Number(sMonth);
  const iYear = Number(sYear);
  const oDate = new Date(Date.UTC(iYear, iMonth - 1, iDay));

  if (oDate.getUTCFullYear() !== iYear || oDate.getUTCMonth() !== iMonth - 1 || oDate.getUTCDate() !== iDay) {
    return null;
  }

  return [String(iYear).padStart(4, "0"), String(iMonth).padStart(2, "0"), String(iDay).padStart(2, "0")].join("-");
}

function parseGermanNumber(sValue) {
  const sText = String(sValue || "").trim();
  const sNumber = sText.includes(",")
    ? sText.replace(/\./g, "").replace(",", ".")
    : sText;

  return Number(sNumber);
}

function createPageUrl(oSource, sRelativePath) {
  if (oSource.viewerUrl) {
    return new URL(sRelativePath, ensureTrailingSlash(oSource.viewerUrl)).toString();
  }

  return null;
}

function sCatalogPagePath(sCatalogId, iPage, sAssetDirectory) {
  return "catalogs/" + sCatalogId + "/" + sAssetDirectory + "/bk_" + iPage + (sAssetDirectory === "text" ? ".txt" : ".jpg");
}

function getPageNumber(oPage) {
  return Number.isInteger(oPage.number) ? oPage.number : null;
}

function ensureTrailingSlash(sUrl) {
  return sUrl.endsWith("/") ? sUrl : sUrl + "/";
}

function isPositiveNumber(fValue) {
  return Number.isFinite(fValue) && fValue > 0;
}

function isObject(vValue) {
  return Boolean(vValue) && typeof vValue === "object" && !Array.isArray(vValue);
}

module.exports = {
  parse: parse,
  extractValidity: extractValidity,
  extractPastaFacts: extractPastaFacts
};
