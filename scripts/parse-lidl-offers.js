"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const LidlOfferCandidateParser = require("./lib/LidlOfferCandidateParser");
const LidlPdfLayoutParser = require("./lib/LidlPdfLayoutParser");

const OUTPUT_DIR = path.join("data", "normalized", "offers", "lidl");

async function main() {
  const sLayoutPath = process.argv[2];
  const sNormalizedFlyerPath = process.argv[3];

  if (!sLayoutPath || !sNormalizedFlyerPath) {
    throw new Error("Usage: npm run parse:lidl-offers -- <bbox-html> <normalized-flyer-json>");
  }

  const [sLayoutXhtml, sFlyerJson] = await Promise.all([
    fs.readFile(sLayoutPath, "utf8"),
    fs.readFile(sNormalizedFlyerPath, "utf8")
  ]);
  const oFlyer = JSON.parse(sFlyerJson);
  const aPages = LidlPdfLayoutParser.parseLayout(sLayoutXhtml);
  const oContext = {
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo
  };
  const aOffers = aPages.flatMap(function (oPage) {
    return LidlOfferCandidateParser.parsePage(oPage, oContext);
  });
  const oOutput = {
    source: "lidl-pdf",
    flyerId: oFlyer.flyerId,
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo,
    generatedAt: new Date().toISOString(),
    candidateCount: aOffers.length,
    offers: aOffers
  };
  const sOutputName = path.basename(sLayoutPath).replace(/\.bbox\.html$/, ".offers.json");
  const sOutputPath = path.join(OUTPUT_DIR, sOutputName);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(sOutputPath, JSON.stringify(oOutput, null, 2) + "\n", "utf8");

  console.log("Lidl offer candidates parsed");
  console.log("Pages:", aPages.length);
  console.log("Candidates:", aOffers.length);
  console.log("Output:", sOutputPath);
}

main().catch(function (oError) {
  console.error(oError.message);
  process.exitCode = 1;
});
