/* global module */

(function (fnCreateCatalog) {
  "use strict";

  if (typeof sap !== "undefined" && sap.ui && sap.ui.define) {
    sap.ui.define([], fnCreateCatalog);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = fnCreateCatalog();
  }
}(function () {
  "use strict";

  return [
    { key: "butter", name: "Butter", quantity: 1, unit: "Stk", category: "Kuehlung" },
    { key: "milch", name: "Milch", quantity: 1, unit: "l", category: "Kuehlung" },
    { key: "tomaten", name: "Tomaten", quantity: 500, unit: "g", category: "Gemuese" },
    { key: "brot", name: "Brot", quantity: 1, unit: "Stk", category: "Backwaren" },
    { key: "eier", name: "Eier", quantity: 10, unit: "Stk", category: "Kuehlung" },
    { key: "kaese", name: "Kaese", quantity: 1, unit: "Stk", category: "Aufschnitt" },
    { key: "nudeln", name: "Nudeln", quantity: 500, unit: "g", category: "Vorrat" },
    { key: "reis", name: "Reis", quantity: 1, unit: "kg", category: "Vorrat" },
    { key: "bananen", name: "Bananen", quantity: 1, unit: "kg", category: "Obst" },
    { key: "aepfel", name: "Aepfel", quantity: 1, unit: "kg", category: "Obst" }
  ];
}));
