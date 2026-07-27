"use strict";

const LidlOfferPipeline = require("./lib/LidlOfferPipeline");

async function main() {
  const oArguments = parseArguments(process.argv.slice(2));
  const oResult = await LidlOfferPipeline.run({
    referenceDate: oArguments.referenceDate,
    force: oArguments.force,
    discoveryUrl: process.env.LIDL_OFFERS_URL,
    flyerApiUrl: process.env.LIDL_FLYER_API_URL,
    storeId: process.env.LIDL_STORE_ID,
    timeoutMs: process.env.LIDL_REQUEST_TIMEOUT_MS,
    maxAttempts: process.env.LIDL_REQUEST_MAX_ATTEMPTS,
    retryDelayMs: process.env.LIDL_RETRY_DELAY_MS,
    discoveryCacheMs: process.env.LIDL_DISCOVERY_CACHE_MS
  });
  const oReport = oResult.qualityReport;

  console.log("Lidl offer pipeline completed");
  console.log("Flyer:", oReport.source.flyerId, "(" + oReport.source.validFrom + " to " + oReport.source.validTo + ")");
  console.log("Pages processed:", oReport.pagesProcessed);
  console.log("Candidates:", oReport.candidateCount);
  console.log("Match outcomes:", JSON.stringify(oReport.matchOutcomes));
  console.log("Optimizer-ready:", oReport.promotionCount);
  console.log("Needs review:", oReport.reviewCount);
  console.log("Review reasons:", JSON.stringify(oReport.reviewReasons));
  console.log("Warnings:", oReport.warnings.length ? oReport.warnings.join(" | ") : "none");
  console.log("Artifact reuse:", JSON.stringify(oReport.artifactReuse));
  console.log("Quality report:", oReport.outputs.qualityReport);
}

function parseArguments(aArguments) {
  const oResult = {
    force: false,
    referenceDate: undefined
  };

  for (let iIndex = 0; iIndex < aArguments.length; iIndex += 1) {
    const sArgument = aArguments[iIndex];

    if (sArgument === "--force") {
      oResult.force = true;
    } else if (sArgument === "--as-of" && aArguments[iIndex + 1]) {
      oResult.referenceDate = aArguments[iIndex + 1];
      iIndex += 1;
    } else {
      throw new Error("Usage: npm run pipeline:lidl -- [--as-of YYYY-MM-DD] [--force]");
    }
  }

  return oResult;
}

main().catch(function (oError) {
  console.error(oError.message);

  if (oError.code) {
    console.error("Code:", oError.code);
  }

  process.exitCode = 1;
});
