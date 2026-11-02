"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const AldiNordOfferAdapter = require("./lib/AldiNordOfferAdapter");
const AldiNordOfferSource = require("./lib/AldiNordOfferSource");

const RAW_DIRECTORY = path.join("data", "raw", "offers", "aldi-nord");
const OUTPUT_DIRECTORY = path.join("data", "normalized", "offers", "aldi-nord");
const STORES_PATH = path.join("data", "stores.json");

async function main() {
  const oArguments = parseArguments(process.argv.slice(2));
  const [sStoresJson] = await Promise.all([
    fs.readFile(STORES_PATH, "utf8"),
    fs.mkdir(OUTPUT_DIRECTORY, { recursive: true })
  ]);
  const aStores = JSON.parse(sStoresJson);
  const oStore = aStores.find(function (oEntry) {
    return oEntry.id === AldiNordOfferAdapter.STORE_ID;
  });

  if (!oStore || oStore.chain !== "ALDI Nord") {
    throw new Error("ALDI Nord Epe is missing or has a mismatched chain in data/stores.json");
  }

  const oSnapshot = await AldiNordOfferSource.getSnapshot({
    directory: RAW_DIRECTORY,
    forceRefresh: oArguments.forceRefresh,
    validate: function (sHtml) {
      AldiNordOfferAdapter.parsePage(sHtml);
    }
  });
  const sGeneratedAt = new Date().toISOString();
  const oDocuments = AldiNordOfferAdapter.promotePage(oSnapshot.html, aStores, {
    referenceDate: oArguments.referenceDate,
    fetchedAt: oSnapshot.metadata.fetchedAt,
    generatedAt: sGeneratedAt
  });
  const oSourceSnapshot = {
    path: path.relative(process.cwd(), oSnapshot.htmlPath),
    sha256: oSnapshot.metadata.sha256,
    reused: oSnapshot.reused
  };

  [oDocuments.candidates, oDocuments.review, oDocuments.optimizer].forEach(function (oDocument) {
    oDocument.sourceSnapshot = oSourceSnapshot;
  });

  const sFileStem = oSnapshot.metadata.fetchedAt.replace(/[-:.]/g, "").replace(/Z$/, "Z") +
    "-as-of-" + oDocuments.optimizer.referenceDate;
  const sCandidatesPath = path.join(OUTPUT_DIRECTORY, sFileStem + ".candidates.json");
  const sReviewPath = path.join(OUTPUT_DIRECTORY, sFileStem + ".review.json");
  const sOptimizerPath = path.join(OUTPUT_DIRECTORY, sFileStem + ".optimizer-ready.json");

  await Promise.all([
    writeJson(sCandidatesPath, oDocuments.candidates),
    writeJson(sReviewPath, oDocuments.review),
    writeJson(sOptimizerPath, oDocuments.optimizer)
  ]);

  console.log("ALDI Nord offer pipeline completed");
  console.log("Source page:", AldiNordOfferSource.SOURCE_URL);
  console.log("Snapshot:", oSourceSnapshot.path, oSnapshot.reused ? "(reused)" : "(downloaded)");
  console.log("Store mapping:", oStore.name, "(" + oStore.id + ")");
  console.log("Reference date:", oDocuments.optimizer.referenceDate);
  console.log("Candidates:", oDocuments.candidates.candidateCount);
  console.log("Optimizer-ready:", oDocuments.optimizer.offerCount);
  console.log("Needs review:", oDocuments.review.summary.reviewCount);
  console.log("Review reasons:", JSON.stringify(oDocuments.review.summary.reasonCounts));
  console.log("Candidates:", sCandidatesPath);
  console.log("Review:", sReviewPath);
  console.log("Optimizer:", sOptimizerPath);
  console.log("Scope: ALDI Nord chain offers; not a live stock or individual-store claim.");
}

function parseArguments(aArguments) {
  const oOptions = {
    forceRefresh: false,
    referenceDate: undefined
  };

  for (let iIndex = 0; iIndex < aArguments.length; iIndex += 1) {
    if (aArguments[iIndex] === "--refresh") {
      oOptions.forceRefresh = true;
    } else if (aArguments[iIndex] === "--as-of" && aArguments[iIndex + 1]) {
      oOptions.referenceDate = aArguments[iIndex + 1];
      iIndex += 1;
    } else {
      throw new Error(
        "Usage: npm run fetch:aldi-nord-offers -- [--refresh] [--as-of YYYY-MM-DD]"
      );
    }
  }

  if (oOptions.referenceDate && !AldiNordOfferAdapter.isIsoDate(oOptions.referenceDate)) {
    throw new Error("--as-of must use a valid YYYY-MM-DD date");
  }

  return oOptions;
}

async function writeJson(sFilePath, oValue) {
  await fs.writeFile(sFilePath, JSON.stringify(oValue, null, 2) + "\n", "utf8");
}

if (require.main === module) {
  main().catch(function (oError) {
    console.error(oError.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments: parseArguments,
  main: main
};
