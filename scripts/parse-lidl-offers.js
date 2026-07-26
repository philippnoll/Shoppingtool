"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const LidlOfferCandidateParser = require("./lib/LidlOfferCandidateParser");
const LidlOfferPromoter = require("./lib/LidlOfferPromoter");
const LidlPdfLayoutParser = require("./lib/LidlPdfLayoutParser");

const OUTPUT_DIR = path.join("data", "normalized", "offers", "lidl");
const STORES_PATH = path.join("data", "stores.json");

async function main() {
  const aArguments = process.argv.slice(2);
  const sLayoutPath = aArguments[0];
  const sNormalizedFlyerPath = aArguments[1];
  const sReferenceDate = parseReferenceDateOption(aArguments.slice(2));

  if (!sLayoutPath || !sNormalizedFlyerPath) {
    throw new Error(
      "Usage: npm run parse:lidl-offers -- <bbox-html> <normalized-flyer-json> [--as-of YYYY-MM-DD]"
    );
  }

  const [sLayoutXhtml, sFlyerJson, sStoresJson] = await Promise.all([
    fs.readFile(sLayoutPath, "utf8"),
    fs.readFile(sNormalizedFlyerPath, "utf8"),
    fs.readFile(STORES_PATH, "utf8")
  ]);
  const oFlyer = JSON.parse(sFlyerJson);
  const aStores = JSON.parse(sStoresJson);
  const aPages = LidlPdfLayoutParser.parseLayout(sLayoutXhtml);
  const oContext = {
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo
  };
  const aCandidates = aPages.flatMap(function (oPage) {
    return LidlOfferCandidateParser.parsePage(oPage, oContext);
  });
  const sGeneratedAt = new Date().toISOString();
  const oCandidateDocument = {
    kind: "lidl-offer-candidates",
    source: "lidl-pdf",
    flyerId: oFlyer.flyerId,
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo,
    generatedAt: sGeneratedAt,
    candidateCount: aCandidates.length,
    candidates: aCandidates
  };
  const oPromotionDocuments = LidlOfferPromoter.promoteDocument(oCandidateDocument, aStores, {
    referenceDate: sReferenceDate,
    generatedAt: sGeneratedAt
  });
  const sOutputStem = path.basename(sLayoutPath).replace(/\.bbox\.html$/, "");
  const sCandidateOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".candidates.json");
  const sReviewOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".review.json");
  const sOptimizerOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".optimizer-ready.json");

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeJson(sCandidateOutputPath, oCandidateDocument),
    writeJson(sReviewOutputPath, oPromotionDocuments.review),
    writeJson(sOptimizerOutputPath, oPromotionDocuments.optimizer)
  ]);

  console.log("Lidl offer pipeline completed");
  console.log("Pages:", aPages.length);
  console.log("Candidates:", aCandidates.length);
  console.log("Optimizer-ready:", oPromotionDocuments.optimizer.offerCount);
  console.log("Needs review:", oPromotionDocuments.review.summary.reviewCount);
  console.log("Candidates:", sCandidateOutputPath);
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
