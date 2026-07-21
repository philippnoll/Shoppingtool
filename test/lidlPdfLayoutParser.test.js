"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const LidlPdfLayoutParser = require("../scripts/lib/LidlPdfLayoutParser");

test("converts positioned Lidl PDF words into sorted text blocks", function () {
  const sFixturePath = path.join(__dirname, "fixtures", "lidl-page-bbox-sample.html");
  const sXhtml = fs.readFileSync(sFixturePath, "utf8");
  const aPages = LidlPdfLayoutParser.parseLayout(sXhtml);

  assert.equal(aPages.length, 1);
  assert.equal(aPages[0].sourcePage, 1);
  assert.equal(aPages[0].width, 467.717);
  assert.deepEqual(aPages[0].blocks.map(withoutWords), [
    {
      text: "Romatomaten",
      xMin: 209.9662,
      yMin: 87.561,
      xMax: 265.2662,
      yMax: 99.521
    },
    {
      text: "Je 500 g\n1 kg = 1.76",
      xMin: 209.9662,
      yMin: 100.3099,
      xMax: 281.5822,
      yMax: 145.5339
    },
    {
      text: "0.88*",
      xMin: 209.9662,
      yMin: 177.45,
      xMax: 269.6462,
      yMax: 220.37
    }
  ]);
  assert.deepEqual(aPages[0].blocks[0].words, [
    { text: "Romatomaten" }
  ]);
});

function withoutWords(oBlock) {
  const oResult = Object.assign({}, oBlock);

  delete oResult.words;

  return oResult;
}
