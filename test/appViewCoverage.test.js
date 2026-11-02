"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { XMLParser } = require("fast-xml-parser");

const sView = fs.readFileSync(path.join(__dirname, "../webapp/view/App.view.xml"), "utf8");
const oView = new XMLParser({ ignoreAttributes: false }).parse(sView);
const aPanels = oView["mvc:View"].Shell.App["f:DynamicPage"]["f:content"].VBox.Panel;
const oOptimizerPanel = aPanels.find(function (oPanel) {
  return oPanel["@_headerText"] === "Preisoptimierung mit aktuellen Angeboten";
});

for (const sPlan of ["bestStore", "splitPlan"]) {
  test(sPlan + " coverage expression renders zero, partial and complete item counts", function () {
    const sPrefix = "/optimizationResult/" + sPlan + "/";
    const aStatuses = oOptimizerPanel.VBox.ObjectStatus.filter(function (oStatus) {
      return oStatus["@_text"].includes("${" + sPrefix + "coveredItemCount}");
    });
    assert.equal(aStatuses.length, 1);
    const sBinding = aStatuses[0]["@_text"];
    assert.ok(sBinding.startsWith("{=") && sBinding.endsWith("}"));

    for (const iCovered of [0, 1, 4]) {
      const mValues = {
        [sPrefix + "coveredItemCount"]: iCovered,
        [sPrefix + "requestedItemCount"]: 4
      };
      // These bindings use JavaScript concatenation; substitute only model values.
      // This checks expression output without claiming a UI5 browser render.
      const sExpression = sBinding.slice(2, -1).replace(/\$\{([^}]+)\}/g, function (sMatch, sPath) {
        assert.ok(Object.hasOwn(mValues, sPath), "Unexpected model path: " + sPath);
        return JSON.stringify(mValues[sPath]);
      });
      assert.equal(vm.runInNewContext(sExpression), iCovered + " von 4 Listenartikeln abgedeckt");
    }
  });
}
