"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const LidlNormalizer = require("./lib/LidlNormalizer");

const DEFAULT_STORE_ID = "lidl-gronauerstrasse-48599";
const OUTPUT_DIR = path.join("data", "normalized", "flyers", "lidl");

async function main() {
  const sInputPath = process.argv[2];

  if (!sInputPath) {
    throw new Error("Usage: npm run normalize:lidl -- <path-to-lidl-json>");
  }

  const sAnalysisPath = sInputPath.replace(/\.json$/, ".analysis.json");
  const [sRawResponse, sRawAnalysis] = await Promise.all([
    fs.readFile(sInputPath, "utf8"),
    fs.readFile(sAnalysisPath, "utf8")
  ]);
  const oResponse = JSON.parse(sRawResponse);
  const oAnalysis = JSON.parse(sRawAnalysis);
  const oNormalizedFlyer = LidlNormalizer.normalizeFlyer(oResponse, {
    storeId: process.env.LIDL_STORE_ID || DEFAULT_STORE_ID,
    fetchedAt: oAnalysis.fetchedAt
  });
  const sOutputName = path.basename(sInputPath, ".json") + ".normalized.json";
  const sOutputPath = path.join(OUTPUT_DIR, sOutputName);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(sOutputPath, JSON.stringify(oNormalizedFlyer, null, 2) + "\n", "utf8");

  console.log("Lidl flyer normalized");
  console.log("Pages:", oNormalizedFlyer.pages.length);
  console.log("Valid:", oNormalizedFlyer.validFrom, "to", oNormalizedFlyer.validTo);
  console.log("Output:", sOutputPath);
}

main().catch(function (oError) {
  console.error(oError.message);
  process.exitCode = 1;
});
