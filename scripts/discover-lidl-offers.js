"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_LIDL_OFFERS_URL = "https://www.lidl.de/c/online-prospekte/s10005610";
const RAW_OUTPUT_DIR = path.join("data", "raw", "offers", "lidl");
const USER_AGENT = "Shoppingtool/0.1 private local offer discovery";

async function main() {
  const sUrl = process.env.LIDL_OFFERS_URL || DEFAULT_LIDL_OFFERS_URL;
  const sTimestamp = new Date().toISOString();
  const sFileTimestamp = sTimestamp.replace(/[:.]/g, "-");

  await fs.mkdir(RAW_OUTPUT_DIR, { recursive: true });

  const oResponse = await fetch(sUrl, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "de-DE,de;q=0.9,en;q=0.7",
      "user-agent": USER_AGENT
    }
  });
  const sBody = await oResponse.text();
  const oAnalysis = analyzeResponse({
    requestedUrl: sUrl,
    finalUrl: oResponse.url,
    status: oResponse.status,
    contentType: oResponse.headers.get("content-type"),
    fetchedAt: sTimestamp,
    body: sBody
  });
  const sRawExtension = oAnalysis.bodyType === "json" ? ".json" : ".html";
  const sHtmlPath = path.join(RAW_OUTPUT_DIR, sFileTimestamp + sRawExtension);
  const sAnalysisPath = path.join(RAW_OUTPUT_DIR, sFileTimestamp + ".analysis.json");

  await fs.writeFile(sHtmlPath, sBody, "utf8");
  await fs.writeFile(sAnalysisPath, JSON.stringify(oAnalysis, null, 2) + "\n", "utf8");

  printSummary(oAnalysis, sHtmlPath, sAnalysisPath);
}

function analyzeResponse(oInput) {
  var oJson = tryParseJson(oInput.body);

  if (oJson) {
    return analyzeJson(oInput, oJson);
  }

  return analyzeHtml(oInput);
}

function analyzeJson(oInput, oJson) {
  var oFlyer = oJson.flyer || {};
  var aPages = oFlyer.pages || [];
  var aProducts = Object.values(oFlyer.products || {});
  var aLinks = aPages.flatMap(function (oPage) {
    return (oPage.links || []).map(function (oLink) {
      return {
        page: oPage.number,
        type: oLink.displayType,
        title: oLink.title,
        productId: oLink.productDetails && oLink.productDetails.productId
      };
    });
  });

  return {
    requestedUrl: oInput.requestedUrl,
    finalUrl: oInput.finalUrl,
    status: oInput.status,
    contentType: oInput.contentType,
    fetchedAt: oInput.fetchedAt,
    bodyType: "json",
    charLength: oInput.body.length,
    topLevelKeys: Object.keys(oJson),
    success: oJson.success,
    message: oJson.message,
    warnings: oJson.warnings || [],
    flyer: {
      id: oFlyer.id,
      name: oFlyer.name,
      title: oFlyer.title,
      status: oFlyer.status,
      startDate: oFlyer.startDate,
      endDate: oFlyer.endDate,
      offerStartDate: oFlyer.offerStartDate,
      offerEndDate: oFlyer.offerEndDate,
      pdfUrl: oFlyer.pdfUrl,
      pageCount: aPages.length,
      productCount: aProducts.length,
      linkCount: aLinks.length,
      productLinkCount: aLinks.filter(function (oLink) {
        return oLink.type === "product";
      }).length,
      recipeLinkCount: aLinks.filter(function (oLink) {
        return oLink.type === "recipe";
      }).length,
      relatedFlyerCount: (oFlyer.relatedFlyers || []).length
    },
    sampleProducts: aProducts.slice(0, 10).map(summarizeProduct),
    foodKeywordPages: findFoodKeywordPages(aPages)
  };
}

function analyzeHtml(oInput) {
  const sHtml = oInput.body;

  return {
    requestedUrl: oInput.requestedUrl,
    finalUrl: oInput.finalUrl,
    status: oInput.status,
    contentType: oInput.contentType,
    fetchedAt: oInput.fetchedAt,
    bodyType: "html",
    charLength: sHtml.length,
    scriptCount: countMatches(sHtml, /<script\b/gi),
    nextData: extractScriptById(sHtml, "__NEXT_DATA__"),
    nuxtData: extractScriptById(sHtml, "__NUXT_DATA__"),
    jsonLd: extractJsonLd(sHtml),
    leafletOffers: extractLeafletOffers(sHtml),
    keywordHints: {
      angebot: countMatches(sHtml, /angebot/gi),
      price: countMatches(sHtml, /price/gi),
      product: countMatches(sHtml, /product/gi),
      artikel: countMatches(sHtml, /artikel/gi)
    }
  };
}

function tryParseJson(sText) {
  try {
    return JSON.parse(sText);
  } catch {
    return null;
  }
}

function summarizeProduct(oProduct) {
  return {
    productId: oProduct.productId,
    title: oProduct.title,
    brand: oProduct.brand,
    price: oProduct.price,
    currencySymbol: oProduct.currencySymbol,
    categoryPrimary: oProduct.categoryPrimary
  };
}

function findFoodKeywordPages(aPages) {
  return aPages
    .filter(function (oPage) {
      return /milch|butter|tomat|pasta|barilla|magnum|koch|kasseler|kartoffel|paprika|obst|gemuese|gemüse|kaese|käse|fleisch|wurst/i.test(oPage.keyWords || "");
    })
    .slice(0, 20)
    .map(function (oPage) {
      return {
        page: oPage.number,
        keyWords: (oPage.keyWords || "").slice(0, 300),
        altText: oPage.altText
      };
    });
}

function extractLeafletOffers(sHtml) {
  return extractJsonLd(sHtml)
    .filter(function (oJsonLd) {
      return oJsonLd.parseable && oJsonLd.data && oJsonLd.data["@type"] === "OfferCatalog";
    })
    .flatMap(function (oJsonLd) {
      return oJsonLd.data.itemListElement || [];
    })
    .map(function (oItem) {
      return {
        type: oItem["@type"],
        name: oItem.name,
        url: oItem.url,
        image: oItem.image
      };
    });
}

function extractScriptById(sHtml, sId) {
  const oMatch = sHtml.match(new RegExp("<script[^>]+id=[\"']" + sId + "[\"'][^>]*>([\\s\\S]*?)<\\/script>", "i"));

  if (!oMatch) {
    return {
      found: false
    };
  }

  return summarizePotentialJson(oMatch[1]);
}

function extractJsonLd(sHtml) {
  const aMatches = Array.from(sHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  return aMatches.map(function (oMatch) {
    return summarizePotentialJson(oMatch[1]);
  });
}

function summarizePotentialJson(sText) {
  const sTrimmedText = decodeHtmlEntities(sText.trim());

  try {
    const vJson = JSON.parse(sTrimmedText);

    return {
      found: true,
      parseable: true,
      topLevelType: Array.isArray(vJson) ? "array" : typeof vJson,
      topLevelKeys: Array.isArray(vJson) ? [] : Object.keys(vJson).slice(0, 30),
      data: vJson,
      snippet: sTrimmedText.slice(0, 500)
    };
  } catch (oError) {
    return {
      found: true,
      parseable: false,
      error: oError.message,
      snippet: sTrimmedText.slice(0, 500)
    };
  }
}

function decodeHtmlEntities(sText) {
  return sText
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function countMatches(sText, rPattern) {
  return (sText.match(rPattern) || []).length;
}

function printSummary(oAnalysis, sHtmlPath, sAnalysisPath) {
  console.log("Lidl discovery finished");
  console.log("Status:", oAnalysis.status);
  console.log("Final URL:", oAnalysis.finalUrl);
  console.log("Body type:", oAnalysis.bodyType);
  console.log("Chars:", oAnalysis.charLength);

  if (oAnalysis.bodyType === "json") {
    console.log("Flyer:", oAnalysis.flyer.name, oAnalysis.flyer.title);
    console.log("Pages:", oAnalysis.flyer.pageCount);
    console.log("Products:", oAnalysis.flyer.productCount);
    console.log("Food keyword pages:", oAnalysis.foodKeywordPages.length);
  } else {
    console.log("Scripts:", oAnalysis.scriptCount);
    console.log("JSON-LD blocks:", oAnalysis.jsonLd.length);
    console.log("Leaflet offers:", oAnalysis.leafletOffers.length);
    console.log("__NEXT_DATA__:", oAnalysis.nextData.found ? "found" : "not found");
    console.log("__NUXT_DATA__:", oAnalysis.nuxtData.found ? "found" : "not found");
  }

  console.log("Raw response:", sHtmlPath);
  console.log("Analysis:", sAnalysisPath);
}

main().catch(function (oError) {
  console.error(oError);
  process.exitCode = 1;
});
