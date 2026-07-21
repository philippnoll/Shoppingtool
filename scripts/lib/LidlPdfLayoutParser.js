"use strict";

const { XMLParser } = require("fast-xml-parser");

function parseLayout(sXhtml) {
  const oParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true
  });
  const oDocument = oParser.parse(sXhtml);
  const aPages = toArray(oDocument.html.body.doc.page);

  return aPages.map(function (oPage, iPageIndex) {
    return {
      sourcePage: iPageIndex + 1,
      width: oPage.width,
      height: oPage.height,
      blocks: extractBlocks(oPage)
    };
  });
}

function extractBlocks(oPage) {
  return toArray(oPage.flow)
    .flatMap(function (oFlow) {
      return toArray(oFlow.block);
    })
    .map(normalizeBlock)
    .sort(comparePosition);
}

function normalizeBlock(oBlock) {
  const aWords = [];
  const aLines = toArray(oBlock.line).map(function (oLine) {
    const aLineWords = toArray(oLine.word).map(normalizeWord);

    aWords.push.apply(aWords, aLineWords);

    return aLineWords.map(function (oWord) {
      return oWord.text;
    }).join(" ");
  });

  return {
    text: aLines.join("\n"),
    xMin: oBlock.xMin,
    yMin: oBlock.yMin,
    xMax: oBlock.xMax,
    yMax: oBlock.yMax,
    words: aWords
  };
}

function normalizeWord(vWord) {
  if (typeof vWord === "string" || typeof vWord === "number") {
    return {
      text: String(vWord)
    };
  }

  return {
    text: String(vWord["#text"] || ""),
    xMin: vWord.xMin,
    yMin: vWord.yMin,
    xMax: vWord.xMax,
    yMax: vWord.yMax
  };
}

function comparePosition(oLeft, oRight) {
  if (oLeft.yMin !== oRight.yMin) {
    return oLeft.yMin - oRight.yMin;
  }

  return oLeft.xMin - oRight.xMin;
}

function toArray(vValue) {
  if (!vValue) {
    return [];
  }

  return Array.isArray(vValue) ? vValue : [vValue];
}

module.exports = {
  parseLayout: parseLayout
};
