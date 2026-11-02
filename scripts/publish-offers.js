"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_SNAPSHOT_FIELDS = ["kind", "source", "offerCount", "generatedAt", "offers"];
const PUBLIC_OFFER_FIELDS = [
  "storeId", "storeName", "chain", "productKey", "offerName", "packageQuantity",
  "packageUnit", "price", "validFrom", "validTo", "source", "priceType", "priceCondition"
];

function publish(snapshotPath, projectRoot) {
  const sProjectRoot = projectRoot || PROJECT_ROOT;
  const oSnapshot = readJson(snapshotPath);
  const aStores = readJson(path.join(sProjectRoot, "data", "stores.json"));

  if (!oSnapshot || oSnapshot.kind !== "optimizer-ready-offers" || !Array.isArray(oSnapshot.offers)) {
    throw new Error("Only an optimizer-ready offers document can be published");
  }

  if (oSnapshot.offerCount !== undefined && oSnapshot.offerCount !== oSnapshot.offers.length) {
    throw new Error("Optimizer-ready offerCount does not match offers");
  }

  if (!Array.isArray(aStores) || !aStores.length) {
    throw new Error("The store catalog is missing or invalid");
  }

  const oPublicSnapshot = projectFields(oSnapshot, PUBLIC_SNAPSHOT_FIELDS);
  oPublicSnapshot.offers = oSnapshot.offers.map(function (oOffer) {
    if (!oOffer || typeof oOffer !== "object" || Array.isArray(oOffer)) {
      throw new Error("Optimizer-ready offers must be objects");
    }

    return projectFields(oOffer, PUBLIC_OFFER_FIELDS);
  });

  const sPublicDirectory = path.join(sProjectRoot, "webapp", "data");
  const sOffersDirectory = path.join(sPublicDirectory, "offers");
  fs.mkdirSync(sOffersDirectory, { recursive: true });
  fs.writeFileSync(path.join(sPublicDirectory, "stores.json"), JSON.stringify(aStores, null, 2) + "\n");
  fs.writeFileSync(path.join(sOffersDirectory, "optimizer-ready.json"), JSON.stringify(oPublicSnapshot, null, 2) + "\n");

  return {
    offerCount: oSnapshot.offers.length,
    publicOffersPath: "webapp/data/offers/optimizer-ready.json"
  };
}

function projectFields(oSource, aFields) {
  return aFields.reduce(function (oResult, sField) {
    if (Object.prototype.hasOwnProperty.call(oSource, sField)) {
      oResult[sField] = oSource[sField];
    }

    return oResult;
  }, {});
}

function readJson(sPath) {
  let sContents;

  try {
    sContents = fs.readFileSync(sPath, "utf8");
  } catch {
    throw new Error("Could not read the requested JSON input");
  }

  try {
    return JSON.parse(sContents);
  } catch {
    throw new Error("The requested JSON input is invalid");
  }
}

if (require.main === module) {
  const sSnapshotPath = process.argv[2];

  if (!sSnapshotPath) {
    console.error("Usage: npm run publish:offers -- <optimizer-ready-json>");
    process.exitCode = 1;
  } else {
    try {
      const oResult = publish(sSnapshotPath);
      console.log("Published", oResult.offerCount, "offers to", oResult.publicOffersPath);
    } catch (oError) {
      console.error(oError.message);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  publish: publish
};
