"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const KkCatalogSource = require("./lib/KkCatalogSource");
const KkOfferCandidateParser = require("./lib/KkOfferCandidateParser");
const KkOfferPromoter = require("./lib/KkOfferPromoter");

const OUTPUT_DIR = path.join("data", "normalized", "offers", "kk");
const STORES_PATH = path.join("data", "stores.json");

async function main() {
  const oArguments = parseArguments(process.argv.slice(2));
  const [oSource, sStoresJson] = await Promise.all([
    KkCatalogSource.discover(),
    fs.readFile(STORES_PATH, "utf8")
  ]);
  const aStores = JSON.parse(sStoresJson);
  const sGeneratedAt = new Date().toISOString();
  const oCandidateDocument = KkOfferCandidateParser.parse(Object.assign({}, oSource, {
    generatedAt: sGeneratedAt
  }));
  const oPromotionDocuments = KkOfferPromoter.promoteDocument(oCandidateDocument, aStores, {
    referenceDate: oArguments.referenceDate,
    generatedAt: sGeneratedAt,
    storeIds: oArguments.storeIds
  });
  const oSourceSnapshot = {
    manifestPath: path.relative(process.cwd(), oSource.manifestPath),
    manifestSha256: oSource.manifestSha256,
    resources: oSource.manifest.resources.map(function (oResource) {
      return {
        localPath: oResource.localPath,
        sha256: oResource.sha256
      };
    })
  };
  oCandidateDocument.sourceSnapshot = oSourceSnapshot;
  oPromotionDocuments.review.sourceSnapshot = oSourceSnapshot;
  oPromotionDocuments.optimizer.sourceSnapshot = oSourceSnapshot;
  const sOutputStem = oSource.catalogId + "-" + oSource.manifestSha256.slice(0, 16);
  const sCandidateOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".candidates.json");
  const sReviewOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".review.json");
  const sOptimizerOutputPath = path.join(OUTPUT_DIR, sOutputStem + ".optimizer-ready.json");

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeJson(sCandidateOutputPath, oCandidateDocument),
    writeJson(sReviewOutputPath, oPromotionDocuments.review),
    writeJson(sOptimizerOutputPath, oPromotionDocuments.optimizer)
  ]);

  const aResourceRecords = oSource.manifest.resources;
  const iReusedResources = aResourceRecords.filter(function (oResource) {
    return oResource.reusedFromCache;
  }).length;

  console.log("K+K offer pipeline completed");
  console.log("Catalog:", oSource.catalogId);
  console.log("Pages:", oSource.pageCount);
  console.log("Cached resources reused:", iReusedResources + "/" + aResourceRecords.length);
  console.log("Validity:", oCandidateDocument.validFrom || "missing", "to", oCandidateDocument.validTo || "missing");
  console.log("Candidates:", oCandidateDocument.candidateCount);
  console.log("Optimizer store offers:", oPromotionDocuments.optimizer.offerCount);
  console.log("Unique source offers:", oPromotionDocuments.optimizer.businessOfferCount);
  console.log("Needs review:", oPromotionDocuments.review.summary.reviewCount);
  console.log("Store selection:", oPromotionDocuments.review.storeSelectionStatus);
  console.log("Candidates:", sCandidateOutputPath);
  console.log("Review:", sReviewOutputPath);
  console.log("Optimizer:", sOptimizerOutputPath);
}

function parseArguments(aArguments) {
  const oParsed = {
    referenceDate: undefined,
    storeIds: []
  };

  for (let iIndex = 0; iIndex < aArguments.length; iIndex += 1) {
    const sArgument = aArguments[iIndex];

    if (sArgument === "--as-of" && aArguments[iIndex + 1]) {
      oParsed.referenceDate = aArguments[iIndex + 1];
      iIndex += 1;
    } else if (sArgument === "--store-id" && aArguments[iIndex + 1]) {
      oParsed.storeIds.push(aArguments[iIndex + 1]);
      iIndex += 1;
    } else {
      throw new Error(
        "Usage: npm run parse:kk-offers -- [--as-of YYYY-MM-DD] [--store-id <explicit-epe-store-id> ...]"
      );
    }
  }

  return oParsed;
}

function writeJson(sFilePath, oValue) {
  return fs.writeFile(sFilePath, JSON.stringify(oValue, null, 2) + "\n", "utf8");
}

main().catch(function (oError) {
  console.error(oError.message);
  process.exitCode = 1;
});
