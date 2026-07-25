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
    {
      key: "butter",
      name: "Butter",
      quantity: 1,
      unit: "Stk",
      category: "Kuehlung",
      aliases: ["buttermann"],
      offerAliases: ["markenbutter"],
      offerExclusions: ["buttermilch"]
    },
    {
      key: "milch",
      name: "Milch",
      quantity: 1,
      unit: "l",
      category: "Kuehlung",
      aliases: [],
      offerAliases: [],
      offerExclusions: ["buttermilch", "milchreis", "milchschnitte"]
    },
    {
      key: "tomaten",
      name: "Tomaten",
      quantity: 500,
      unit: "g",
      category: "Gemuese",
      aliases: ["tomate"],
      offerAliases: ["romatomaten", "rispentomaten"],
      offerExclusions: ["tomatenketchup", "tomatensauce", "gehackte tomaten"]
    },
    {
      key: "brot",
      name: "Brot",
      quantity: 1,
      unit: "Stk",
      category: "Backwaren",
      aliases: [],
      offerAliases: ["vollkornbrot"],
      offerExclusions: []
    },
    {
      key: "eier",
      name: "Eier",
      quantity: 10,
      unit: "Stk",
      category: "Kuehlung",
      aliases: [],
      offerAliases: [],
      offerExclusions: []
    },
    {
      key: "kaese",
      name: "Kaese",
      quantity: 1,
      unit: "Stk",
      category: "Aufschnitt",
      aliases: [],
      offerAliases: [],
      offerExclusions: []
    },
    {
      key: "nudeln",
      name: "Nudeln",
      quantity: 500,
      unit: "g",
      category: "Vorrat",
      aliases: [],
      offerAliases: [],
      offerExclusions: []
    },
    {
      key: "reis",
      name: "Reis",
      quantity: 1,
      unit: "kg",
      category: "Vorrat",
      aliases: [],
      offerAliases: ["spitzenreis"],
      offerExclusions: ["milchreis"]
    },
    {
      key: "bananen",
      name: "Bananen",
      quantity: 1,
      unit: "kg",
      category: "Obst",
      aliases: [],
      offerAliases: [],
      offerExclusions: []
    },
    {
      key: "aepfel",
      name: "Aepfel",
      quantity: 1,
      unit: "kg",
      category: "Obst",
      aliases: [],
      offerAliases: [],
      offerExclusions: []
    }
  ];
}));
