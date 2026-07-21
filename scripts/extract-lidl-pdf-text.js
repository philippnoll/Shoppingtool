"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const util = require("node:util");

const execFile = util.promisify(childProcess.execFile);
const OUTPUT_DIR = path.join("data", "raw", "offers", "lidl", "pdf-text");

async function main() {
  const sPdfPath = process.argv[2];

  if (!sPdfPath) {
    throw new Error("Usage: npm run extract:lidl-pdf -- <path-to-lidl-pdf>");
  }

  const sOutputName = path.basename(sPdfPath, path.extname(sPdfPath)) + ".txt";
  const sOutputPath = path.join(OUTPUT_DIR, sOutputName);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await execFile("pdftotext", ["-layout", sPdfPath, sOutputPath]);

  const oStats = await fs.stat(sOutputPath);

  console.log("Lidl PDF text extracted");
  console.log("Bytes:", oStats.size);
  console.log("Output:", sOutputPath);
}

main().catch(function (oError) {
  console.error(oError.message);
  process.exitCode = 1;
});
