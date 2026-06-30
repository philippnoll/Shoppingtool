sap.ui.define([
  "shoppingtool/model/ProductCatalog",
  "shoppingtool/model/ProductSearch"
], function (ProductCatalog, ProductSearch) {
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
  var UNIT_ALIASES = {
    g: "g",
    kg: "kg",
    l: "l",
    ml: "ml",
    stk: "Stk",
    stueck: "Stk",
    stuecke: "Stk"
  };

  function parse(sInput) {
    return sInput
      .split(/(?:[\n,;]+|\s+(?:und|\+)\s+)/i)
      .map(function (sToken) {
        return sToken.trim();
      })
      .filter(Boolean)
      .reduce(function (aItems, sToken) {
        return aItems.concat(splitWhitespaceItems(sToken));
      }, [])
      .map(recognizeProduct);
  }

  function recognizeProduct(sRawText) {
    var oAmount = parseAmount(sRawText);
    var sProductText = oAmount.productText;
    var sKey = normalizeKey(sProductText);
    var oRule = PRODUCT_RULES[sKey];
    var oSearchMatch = ProductSearch.search(ProductCatalog, sProductText)[0];

    if (oRule) {
      return {
        rawText: sRawText,
        name: oRule.name,
        quantity: getQuantity(oAmount, oRule.quantity),
        unit: getUnit(oAmount, oRule.unit)
      };
    }

    if (oSearchMatch) {
      return {
        rawText: sRawText,
        name: oSearchMatch.name,
        quantity: getQuantity(oAmount, oSearchMatch.quantity || 1),
        unit: getUnit(oAmount, oSearchMatch.unit || "Stk")
      };
    }

    return {
      rawText: sRawText,
      name: toTitleCase(sProductText),
      quantity: getQuantity(oAmount, 1),
      unit: getUnit(oAmount, "Stk")
    };
  }

  function splitWhitespaceItems(sToken) {
    var aWords = sToken.split(/\s+/);
    var aItems = [];
    var iIndex = 0;

    if (aWords.length < 2) {
      return [sToken];
    }

    while (iIndex < aWords.length) {
      var aItemWords = [];

      if (isQuantityWord(aWords[iIndex])) {
        aItemWords.push(aWords[iIndex]);
        iIndex += 1;

        if (aWords[iIndex] && normalizeKey(aWords[iIndex]) === "x") {
          aItemWords.push(aWords[iIndex]);
          iIndex += 1;
        }

        if (aWords[iIndex] && UNIT_ALIASES[normalizeKey(aWords[iIndex])]) {
          aItemWords.push(aWords[iIndex]);
          iIndex += 1;
        }
      }

      if (!aWords[iIndex]) {
        return [sToken];
      }

      aItemWords.push(aWords[iIndex]);
      iIndex += 1;
      aItems.push(aItemWords.join(" "));
    }

    if (aItems.length < 2 || !aItems.every(hasProductMatch)) {
      return [sToken];
    }

    return aItems;
  }

  function hasProductMatch(sRawText) {
    var sProductText = parseAmount(sRawText).productText;

    return Boolean(PRODUCT_RULES[normalizeKey(sProductText)] || ProductSearch.search(ProductCatalog, sProductText)[0]);
  }

  function parseAmount(sRawText) {
    var oAmountMatch = sRawText.match(/^(\d+(?:[,.]\d+)?)\s*(?:x\s*)?(?:(g|kg|ml|l|stk|stück|stücke|stueck|stuecke)\s+)?(.+)$/i);
    var sUnit;

    if (!oAmountMatch) {
      return {
        productText: sRawText.trim(),
        quantity: null,
        unit: null
      };
    }

    sUnit = oAmountMatch[2] ? UNIT_ALIASES[normalizeKey(oAmountMatch[2])] : null;

    return {
      productText: oAmountMatch[3].trim(),
      quantity: Number(oAmountMatch[1].replace(",", ".")),
      unit: sUnit
    };
  }

  function getQuantity(oAmount, iDefaultQuantity) {
    return oAmount.quantity === null ? iDefaultQuantity : oAmount.quantity;
  }

  function getUnit(oAmount, sDefaultUnit) {
    return oAmount.unit || sDefaultUnit;
  }

  function isQuantityWord(sText) {
    return /^\d+(?:[,.]\d+)?x?$/i.test(sText);
  }

  function normalizeKey(sText) {
    return (sText || "")
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss");
  }

  function toTitleCase(sText) {
    return sText.charAt(0).toUpperCase() + sText.slice(1).toLowerCase();
  }

  return {
    parse: parse
  };
});
