"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const LidlOfferPromoter = require("./lib/LidlOfferPromoter");

const STORES_PATH = path.join("data", "stores.json");

async function main() {
  const aArguments = process.argv.slice(2);
  const sCandidatePath = aArguments[0];
  const sReferenceDate = parseReferenceDateOption(aArguments.slice(1));

  if (!sCandidatePath) {
    throw new Error(
      "Usage: npm run promote:lidl-offers -- <candidate-json> [--as-of YYYY-MM-DD]"
    );
  }

  const [sCandidateJson, sStoresJson] = await Promise.all([
    fs.readFile(sCandidatePath, "utf8"),
    fs.readFile(STORES_PATH, "utf8")
  ]);
  const oCandidateDocument = JSON.parse(sCandidateJson);
  const aStores = JSON.parse(sStoresJson);
  const oDocuments = LidlOfferPromoter.promoteDocument(oCandidateDocument, aStores, {
    referenceDate: sReferenceDate
  });
  const sOutputStem = path.basename(sCandidatePath)
    .replace(/\.(?:candidates|offers)\.json$/, "");
  const sOutputDirectory = path.dirname(sCandidatePath);
  const sReviewOutputPath = path.join(sOutputDirectory, sOutputStem + ".review.json");
  const sOptimizerOutputPath = path.join(sOutputDirectory, sOutputStem + ".optimizer-ready.json");

  await Promise.all([
    writeJson(sReviewOutputPath, oDocuments.review),
    writeJson(sOptimizerOutputPath, oDocuments.optimizer)
  ]);

  console.log("Lidl offer promotion completed");
  console.log("Reference date:", oDocuments.review.referenceDate);
  console.log("Candidates:", oDocuments.review.summary.candidateCount);
  console.log("Optimizer-ready:", oDocuments.optimizer.offerCount);
  console.log("Needs review:", oDocuments.review.summary.reviewCount);
  console.log("Reasons:", JSON.stringify(oDocuments.review.summary.reasonCounts));
  console.log("Review:", sReviewOutputPath);
  console.log("Optimizer:", sOptimizerOutputPath);
}

function parseReferenceDateOption(aArguments) {
  if (!aArguments.length) {
    return undefined;
  }

  if (aArguments.length === 2 && aArguments[0] === "--as-of" && aArguments[1]) {
    return aArguments[1];
  }

  throw new Error("Optional argument must be --as-of YYYY-MM-DD");
}

function writeJson(sFilePath, oValue) {
  return fs.writeFile(sFilePath, JSON.stringify(oValue, null, 2) + "\n", "utf8");
}

main().catch(function (oError) {
  console.error(oError.message);
  process.exitCode = 1;
});
