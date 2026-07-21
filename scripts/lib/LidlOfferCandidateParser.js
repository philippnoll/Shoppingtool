"use strict";

const CURRENT_PRICE_PATTERN = /^(\d{1,3}(?:[.,]\d{2}))\*?(?:\s+-\d+%)?$/;
const CURRENT_PRICE_WORD_PATTERN = /^(\d{1,3}(?:[.,]\d{2}))\*$/;
const PACKAGE_PATTERN = /\b(?:Je|Ca\.)\s+(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|St(?:ue|ü)ck)\b/i;
const BASE_PRICE_PATTERN = /\b1\s*(kg|l)\s*=\s*(\d+(?:[.,]\d+)?)/i;
const WEIGHT_UNIT_PRICE_PATTERN = /\bkg-Preis\s*=\s*(\d+(?:[.,]\d+)?)/i;

function parsePage(oPage, oContext) {
  const oSourceContext = oContext || {};
  const aBlocks = oPage.blocks || [];
  const aPriceBlocks = extractCurrentPriceBlocks(aBlocks);
  const oUsedPriceBlocks = new Set();
  const aOffers = aBlocks
    .map(function (oDetailBlock) {
      return buildFixedPackageOffer(oPage, oDetailBlock, aBlocks, aPriceBlocks, oUsedPriceBlocks, oSourceContext);
    })
    .filter(Boolean);

  aPriceBlocks.forEach(function (oPriceBlock) {
    if (oUsedPriceBlocks.has(oPriceBlock)) {
      return;
    }

    const oVariableWeightOffer = buildVariableWeightOffer(oPage, oPriceBlock, aBlocks, oSourceContext);

    if (oVariableWeightOffer) {
      oUsedPriceBlocks.add(oPriceBlock);
      aOffers.push(oVariableWeightOffer);
    }
  });

  return mergeConditionalPrices(aOffers).sort(compareOfferPosition);
}

function buildFixedPackageOffer(oPage, oDetailBlock, aBlocks, aPriceBlocks, oUsedPriceBlocks, oContext) {
  const oPackage = parsePackage(oDetailBlock.text);

  if (!oPackage) {
    return null;
  }

  const oPriceBlock = findNearestAvailablePrice(oDetailBlock, aPriceBlocks, oUsedPriceBlocks);
  const oTitleBlock = findTitleBlock(oDetailBlock, aBlocks);

  if (!oPriceBlock || !oTitleBlock) {
    return null;
  }

  oUsedPriceBlocks.add(oPriceBlock);

  return createOffer({
    page: oPage,
    context: oContext,
    titleBlock: oTitleBlock,
    detailBlock: oDetailBlock,
    priceBlock: oPriceBlock,
    packageQuantity: oPackage.totalQuantity,
    packageUnit: oPackage.unit,
    packageCount: oPackage.count,
    itemQuantity: oPackage.itemQuantity,
    regularPrice: findRegularPrice(oPriceBlock, aBlocks),
    basePrice: parseBasePrice(oDetailBlock.text),
    priceType: hasNearbyPriceCondition(oPriceBlock, aBlocks, /Lidl Plus/i, 100) ? "lidl-plus" : "offer",
    confidence: 0.9
  });
}

function buildVariableWeightOffer(oPage, oPriceBlock, aBlocks, oContext) {
  const oKgPriceMarker = findNearestBlock(oPriceBlock, aBlocks.filter(function (oBlock) {
    return /kg-Preis/i.test(oBlock.text);
  }), 100);

  if (!oKgPriceMarker) {
    return null;
  }

  if (WEIGHT_UNIT_PRICE_PATTERN.test(oKgPriceMarker.text)) {
    return null;
  }

  const oTitleBlock = findInlineTitleBlock(oKgPriceMarker) || aBlocks
    .filter(isPotentialTitle)
    .filter(function (oBlock) {
      return oBlock.yMin <= oKgPriceMarker.yMin + 5 &&
        Math.abs(centerY(oKgPriceMarker) - centerY(oBlock)) <= 170 &&
        centerX(oBlock) <= centerX(oKgPriceMarker) + 60 &&
        Math.abs(centerX(oKgPriceMarker) - centerX(oBlock)) <= 170;
    })
    .sort(function (oLeft, oRight) {
      return weightedColumnDistance(oLeft, oKgPriceMarker) - weightedColumnDistance(oRight, oKgPriceMarker);
    })[0];

  if (!oTitleBlock) {
    return null;
  }

  const fPrice = parseCurrentPrice(oPriceBlock.text);

  return createOffer({
    page: oPage,
    context: oContext,
    titleBlock: oTitleBlock,
    detailBlock: oKgPriceMarker,
    priceBlock: oPriceBlock,
    packageQuantity: 1,
    packageUnit: "kg",
    packageCount: 1,
    itemQuantity: 1,
    regularPrice: findRegularPrice(oPriceBlock, aBlocks),
    basePrice: {
      price: fPrice,
      unit: "kg"
    },
    priceType: hasNearbyPriceCondition(oPriceBlock, aBlocks, /Lidl Plus/i, 100) ? "lidl-plus" : "offer",
    confidence: 0.75
  });
}

function createOffer(oInput) {
  const oBasePrice = oInput.basePrice || {};

  return {
    source: "lidl-pdf",
    chain: "Lidl",
    storeId: oInput.context.storeId || null,
    validFrom: oInput.context.validFrom || null,
    validTo: oInput.context.validTo || null,
    sourcePage: oInput.page.sourcePage,
    rawName: normalizeText(oInput.titleBlock.text),
    productKey: null,
    packageQuantity: oInput.packageQuantity,
    packageUnit: oInput.packageUnit,
    packageCount: oInput.packageCount,
    itemQuantity: oInput.itemQuantity,
    price: oInput.price === undefined ? parseCurrentPrice(oInput.priceBlock.text) : oInput.price,
    regularPrice: oInput.regularPrice,
    basePrice: oBasePrice.price || null,
    basePriceUnit: oBasePrice.unit || null,
    priceType: oInput.priceType,
    confidence: oInput.confidence,
    sourcePosition: {
      x: oInput.priceBlock.xMin,
      y: oInput.priceBlock.yMin
    }
  };
}

function parsePackage(sText) {
  const oMatch = sText.match(PACKAGE_PATTERN);

  if (!oMatch) {
    return null;
  }

  const iCount = Number(oMatch[1] || 1);
  const fItemQuantity = parseNumber(oMatch[2]);

  return {
    count: iCount,
    itemQuantity: fItemQuantity,
    totalQuantity: iCount * fItemQuantity,
    unit: normalizeUnit(oMatch[3])
  };
}

function parseBasePrice(sText) {
  const oMatch = sText.match(BASE_PRICE_PATTERN);

  if (oMatch) {
    return {
      price: parseNumber(oMatch[2]),
      unit: oMatch[1].toLowerCase()
    };
  }

  const oWeightUnitPriceMatch = sText.match(WEIGHT_UNIT_PRICE_PATTERN);

  return oWeightUnitPriceMatch ? {
    price: parseNumber(oWeightUnitPriceMatch[1]),
    unit: "kg"
  } : null;
}

function findTitleBlock(oDetailBlock, aBlocks) {
  const oExternalTitleBlock = aBlocks
    .filter(isPotentialTitle)
    .filter(function (oBlock) {
      const fVerticalGap = oDetailBlock.yMin - oBlock.yMax;

      return Math.abs(oDetailBlock.xMin - oBlock.xMin) <= 15 && fVerticalGap >= 0 && fVerticalGap <= 80;
    })
    .sort(function (oLeft, oRight) {
      return oRight.yMax - oLeft.yMax;
    })[0];

  return oExternalTitleBlock || findInlineTitleBlock(oDetailBlock);
}

function isPotentialTitle(oBlock) {
  const sText = normalizeText(oBlock.text);

  return Boolean(sText) &&
    !/\d+[.,]\d{2}|Ursprung|Klasse|\bJe\b|kg-Preis|Lidl Plus|Aktion|Erhältlich|Saison|Highlight|Angebot|©|HHZ/i.test(sText) &&
    !/^(Neu|Im Aufsteller|Vom Jungbullen\.?|d\s*\)|-?\d+\s*%|\d+\s*(?:kg|g|ml|l|Stück)|HER LAN SC|GUT AFT ES|IRTSCH DW|DE AUS UT)$/i.test(sText) &&
    !/(?:www\.|\.de\b)/i.test(sText);
}

function findInlineTitleBlock(oDetailBlock) {
  const sFirstLine = String(oDetailBlock.text || "").split("\n")[0].trim();
  const oInlineBlock = Object.assign({}, oDetailBlock, {
    text: sFirstLine
  });

  return isPotentialTitle(oInlineBlock) && !/^(Versch|Gekühlt|Tiefgefroren|In der|Mit |Ca\.|Standard)/i.test(sFirstLine)
    ? oInlineBlock
    : null;
}

function findNearestAvailablePrice(oDetailBlock, aPriceBlocks, oUsedPriceBlocks) {
  return aPriceBlocks
    .filter(function (oPriceBlock) {
      return !oUsedPriceBlocks.has(oPriceBlock) &&
        (centerX(oPriceBlock) >= centerX(oDetailBlock) - 40 ||
          (oPriceBlock.yMin >= oDetailBlock.yMax - 5 && centerX(oPriceBlock) >= centerX(oDetailBlock) - 90)) &&
        Math.abs(centerX(oDetailBlock) - centerX(oPriceBlock)) <= 180 &&
        Math.abs(centerY(oDetailBlock) - centerY(oPriceBlock)) <= 120;
    })
    .sort(function (oLeft, oRight) {
      return distanceBetween(oDetailBlock, oLeft) - distanceBetween(oDetailBlock, oRight);
    })[0];
}

function findRegularPrice(oPriceBlock, aBlocks) {
  const fCurrentPrice = parseCurrentPrice(oPriceBlock.text);
  const aRegularPrices = aBlocks
    .filter(function (oBlock) {
      const bContainsPriceContext = /(?:%|UVP|Normalpreis|\bd\s*\))/i.test(oBlock.text) ||
        hasNearbyText(oBlock, aBlocks, /%/, 60) ||
        (oPriceBlock.parentBlock === oBlock && /\d+[.,]\d{2}/.test(oBlock.text));

      return oBlock !== oPriceBlock && bContainsPriceContext && /\d+[.,]\d{2}/.test(oBlock.text);
    })
    .filter(function (oBlock) {
      return distanceBetween(oBlock, oPriceBlock) <= 110;
    })
    .flatMap(function (oBlock) {
      return Array.from(oBlock.text.matchAll(/(\d+[.,]\d{2})/g))
        .map(function (oMatch) {
          return parseNumber(oMatch[1]);
        })
        .filter(function (fPrice) {
          return fPrice > fCurrentPrice;
        })
        .map(function (fPrice) {
          return {
            price: fPrice,
            distance: distanceBetween(oBlock, oPriceBlock)
          };
        });
    })
    .sort(function (oLeft, oRight) {
      return oLeft.distance - oRight.distance;
    });

  return aRegularPrices.length ? aRegularPrices[0].price : null;
}

function hasNearbyText(oReferenceBlock, aBlocks, rPattern, fMaxDistance) {
  return aBlocks.some(function (oBlock) {
    return normalizeText(oBlock.text).length <= 80 &&
      oBlock.yMax - oBlock.yMin <= 60 &&
      rPattern.test(oBlock.text) &&
      distanceBetween(oReferenceBlock, oBlock) <= fMaxDistance;
  });
}

function hasNearbyPriceCondition(oReferenceBlock, aBlocks, rPattern, fMaxDistance) {
  return aBlocks.some(function (oBlock) {
    return oBlock.yMin <= oReferenceBlock.yMin + 5 &&
      Math.abs(centerX(oBlock) - centerX(oReferenceBlock)) <= 60 &&
      normalizeText(oBlock.text).length <= 80 &&
      oBlock.yMax - oBlock.yMin <= 60 &&
      rPattern.test(oBlock.text) &&
      distanceBetween(oReferenceBlock, oBlock) <= fMaxDistance;
  });
}

function mergeConditionalPrices(aOffers) {
  const aMergedOffers = [];

  aOffers.forEach(function (oOffer) {
    const oExistingOffer = aMergedOffers.find(function (oCandidate) {
      return oCandidate.sourcePage === oOffer.sourcePage &&
        oCandidate.rawName === oOffer.rawName &&
        oCandidate.packageUnit === oOffer.packageUnit &&
        oCandidate.packageQuantity === oOffer.packageQuantity;
    });

    if (!oExistingOffer) {
      aMergedOffers.push(oOffer);
      return;
    }

    const oCheaperOffer = oOffer.price < oExistingOffer.price ? oOffer : oExistingOffer;
    const oMoreExpensiveOffer = oCheaperOffer === oOffer ? oExistingOffer : oOffer;

    if (oCheaperOffer.priceType === "lidl-plus") {
      oCheaperOffer.regularPrice = oMoreExpensiveOffer.price;
      aMergedOffers[aMergedOffers.indexOf(oExistingOffer)] = oCheaperOffer;
      return;
    }

    aMergedOffers.push(oOffer);
  });

  return aMergedOffers;
}

function findNearestBlock(oReferenceBlock, aBlocks, fMaxDistance) {
  const oNearestBlock = aBlocks.sort(function (oLeft, oRight) {
    return distanceBetween(oReferenceBlock, oLeft) - distanceBetween(oReferenceBlock, oRight);
  })[0];

  return oNearestBlock && distanceBetween(oReferenceBlock, oNearestBlock) <= fMaxDistance ? oNearestBlock : null;
}

function isCurrentPriceBlock(oBlock) {
  const sText = normalizeText(oBlock.text);

  return CURRENT_PRICE_PATTERN.test(sText) && (sText.includes("*") || oBlock.yMax - oBlock.yMin >= 25);
}

function extractCurrentPriceBlocks(aBlocks) {
  return aBlocks.flatMap(function (oBlock) {
    if (isCurrentPriceBlock(oBlock)) {
      return [oBlock];
    }

    return (oBlock.words || [])
      .filter(function (oWord) {
        return CURRENT_PRICE_WORD_PATTERN.test(normalizeText(oWord.text));
      })
      .map(function (oWord) {
        return {
          text: oWord.text,
          xMin: oWord.xMin,
          yMin: oWord.yMin,
          xMax: oWord.xMax,
          yMax: oWord.yMax,
          parentBlock: oBlock
        };
      });
  }).filter(hasCoordinates);
}

function hasCoordinates(oBlock) {
  return [oBlock.xMin, oBlock.yMin, oBlock.xMax, oBlock.yMax].every(Number.isFinite);
}

function parseCurrentPrice(sText) {
  const oMatch = normalizeText(sText).match(CURRENT_PRICE_PATTERN);

  return oMatch ? parseNumber(oMatch[1]) : null;
}

function normalizeUnit(sUnit) {
  const sNormalizedUnit = sUnit.toLowerCase();

  return /^st/.test(sNormalizedUnit) ? "Stk" : sNormalizedUnit;
}

function parseNumber(sValue) {
  return Number(String(sValue).replace(",", "."));
}

function normalizeText(sText) {
  return String(sText || "")
    .replace(/\u00ad\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceBetween(oLeft, oRight) {
  return Math.hypot(centerX(oLeft) - centerX(oRight), centerY(oLeft) - centerY(oRight));
}

function weightedColumnDistance(oLeft, oRight) {
  return Math.abs(centerX(oLeft) - centerX(oRight)) * 2 + Math.abs(centerY(oLeft) - centerY(oRight));
}

function compareOfferPosition(oLeft, oRight) {
  const fRowDifference = oLeft.sourcePosition.y - oRight.sourcePosition.y;

  if (Math.abs(fRowDifference) <= 15) {
    return oLeft.sourcePosition.x - oRight.sourcePosition.x;
  }

  return fRowDifference;
}

function centerX(oBlock) {
  return (oBlock.xMin + oBlock.xMax) / 2;
}

function centerY(oBlock) {
  return (oBlock.yMin + oBlock.yMax) / 2;
}

module.exports = {
  parsePage: parsePage
};
