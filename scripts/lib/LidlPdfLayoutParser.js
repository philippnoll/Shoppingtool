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
  const aLines = toArray(oBlock.line).map(function (oLine) {
    return toArray(oLine.word).map(readWord).join(" ");
  });

  return {
    text: aLines.join("\n"),
    xMin: oBlock.xMin,
    yMin: oBlock.yMin,
    xMax: oBlock.xMax,
    yMax: oBlock.yMax
  };
}

function readWord(vWord) {
  if (typeof vWord === "string" || typeof vWord === "number") {
    return String(vWord);
  }

  return String(vWord["#text"] || "");
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
