sap.ui.define([], function () {
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

  function parse(sInput) {
    return sInput
      .split(/[\n,;]+/)
      .map(function (sToken) {
        return sToken.trim();
      })
      .filter(Boolean)
      .map(recognizeProduct);
  }

  function recognizeProduct(sRawText) {
    var oQuantityMatch = sRawText.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/);
    var fQuantity = oQuantityMatch ? Number(oQuantityMatch[1].replace(",", ".")) : null;
    var sProductText = oQuantityMatch ? oQuantityMatch[2] : sRawText;
    var sKey = sProductText.toLowerCase();
    var oRule = PRODUCT_RULES[sKey];

    if (oRule) {
      return {
        rawText: sRawText,
        name: oRule.name,
        quantity: fQuantity || oRule.quantity,
        unit: oRule.unit
      };
    }

    return {
      rawText: sRawText,
      name: toTitleCase(sProductText),
      quantity: fQuantity || 1,
      unit: "Stk"
    };
  }

  function toTitleCase(sText) {
    return sText.charAt(0).toUpperCase() + sText.slice(1).toLowerCase();
  }

  return {
    parse: parse
  };
});
