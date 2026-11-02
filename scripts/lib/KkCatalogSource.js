"use strict";

/* global AbortSignal */

const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const fs = require("node:fs/promises");
const path = require("node:path");
const { setTimeout } = require("node:timers");
const { URL } = require("node:url");
const { XMLParser } = require("fast-xml-parser");

const DEFAULT_VIEWER_URL = "https://www.klaas-und-kock.de/kataloge/blaetterkatalog2/";
const DEFAULT_RAW_ROOT = path.join("data", "raw", "offers", "kk");
const USER_AGENT = "Shoppingtool/0.1 public K+K offer source";
const REQUEST_TIMEOUT_MS = 15000;
const PAGE_INTERVAL_MS = 250;
const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@"
});

async function discover(oOptions) {
  const oDiscoveryOptions = oOptions || {};
  const sViewerUrl = oDiscoveryOptions.viewerUrl || DEFAULT_VIEWER_URL;
  const sRawRoot = oDiscoveryOptions.rawRoot || DEFAULT_RAW_ROOT;
  const fnFetch = oDiscoveryOptions.fetchImpl || globalThis.fetch;
  const iPageIntervalMs = oDiscoveryOptions.pageIntervalMs === undefined
    ? PAGE_INTERVAL_MS
    : oDiscoveryOptions.pageIntervalMs;
  const iTimeoutMs = oDiscoveryOptions.timeoutMs || REQUEST_TIMEOUT_MS;

  if (typeof fnFetch !== "function") {
    throw new Error("K+K discovery requires a Fetch-compatible function");
  }

  const oViewer = await requestResource(sViewerUrl, {
    expectedContentType: /text\/html/i,
    fetchImpl: fnFetch,
    timeoutMs: iTimeoutMs
  });
  const sViewerHtml = oViewer.body.toString("utf8");
  const sViewerCatalogId = parseViewerCatalogId(sViewerHtml);
  const sCatalogId = sViewerCatalogId.replace(/::catalog$/i, "");
  const sCatalogDirectory = path.join(sRawRoot, sCatalogId);
  const sViewerHost = new URL(sViewerUrl).origin;
  const oPreviousManifest = await readPreviousManifest(sCatalogDirectory);
  const sFetchedAt = new Date().toISOString();
  const aResourceRecords = [];

  await fs.mkdir(sCatalogDirectory, { recursive: true });
  aResourceRecords.push(await saveResource(oViewer, sCatalogDirectory, "viewer.html", sViewerHost));

  const sCatalogUrl = new URL("catalogs/" + sCatalogId + "/xml/catalog.xml", ensureTrailingSlash(sViewerUrl)).toString();
  const sCatalogPath = path.join(sCatalogDirectory, "catalog.xml");
  const oCatalogResponse = await requestResource(sCatalogUrl, {
    cachePath: sCatalogPath,
    previousRecord: findPreviousRecord(oPreviousManifest, sCatalogUrl),
    expectedContentType: /xml/i,
    fetchImpl: fnFetch,
    timeoutMs: iTimeoutMs
  });
  const oCatalogXml = parseCatalogXml(oCatalogResponse.body);

  if (oCatalogXml.name !== sCatalogId) {
    throw new Error("K+K catalog XML name does not match the ID in the official viewer");
  }

  if (!Number.isInteger(oCatalogXml.pageCount) || oCatalogXml.pageCount < 1 || oCatalogXml.pageCount > 100) {
    throw new Error("K+K catalog XML has an invalid page count");
  }

  aResourceRecords.push(await saveResource(oCatalogResponse, sCatalogDirectory, "catalog.xml", sViewerHost));

  const aPages = [];

  for (let iPage = 1; iPage <= oCatalogXml.pageCount; iPage += 1) {
    if (iPage > 1 && iPageIntervalMs > 0) {
      await delay(iPageIntervalMs);
    }

    const sPageUrl = new URL(
      "catalogs/" + sCatalogId + "/text/bk_" + iPage + ".txt",
      ensureTrailingSlash(sViewerUrl)
    ).toString();
    const sRelativePagePath = path.join("pages", "bk_" + iPage + ".txt");
    const sPagePath = path.join(sCatalogDirectory, sRelativePagePath);
    const oPageResponse = await requestResource(sPageUrl, {
      cachePath: sPagePath,
      previousRecord: findPreviousRecord(oPreviousManifest, sPageUrl),
      expectedContentType: /text\/plain/i,
      fetchImpl: fnFetch,
      timeoutMs: iTimeoutMs
    });
    const oPageRecord = await saveResource(oPageResponse, sCatalogDirectory, sRelativePagePath, sViewerHost);

    aResourceRecords.push(oPageRecord);
    aPages.push({
      number: iPage,
      text: oPageResponse.body.toString("utf8"),
      textUrl: sPageUrl,
      localPath: sRelativePagePath,
      etag: oPageRecord.etag,
      lastModified: oPageRecord.lastModified
    });
  }

  const oManifest = {
    kind: "kk-public-catalog-source",
    fetchedAt: sFetchedAt,
    viewerUrl: sViewerUrl,
    viewerCatalogId: sViewerCatalogId,
    catalogId: sCatalogId,
    catalogXmlUrl: sCatalogUrl,
    pageCount: oCatalogXml.pageCount,
    resources: aResourceRecords
  };

  await writeJson(path.join(sCatalogDirectory, "manifest.json"), oManifest);

  return {
    source: "kk-catalog-text",
    viewerUrl: sViewerUrl,
    viewerCatalogId: sViewerCatalogId,
    catalogId: sCatalogId,
    catalogXmlUrl: sCatalogUrl,
    pageCount: oCatalogXml.pageCount,
    fetchedAt: sFetchedAt,
    rawDirectory: sCatalogDirectory,
    pages: aPages,
    manifest: oManifest
  };
}

function parseViewerCatalogId(sViewerHtml) {
  const aMatches = Array.from(String(sViewerHtml || "").matchAll(/\bcatalog\s*:\s*["']([^"']+::catalog)["']/gi));
  const aUniqueIds = Array.from(new Set(aMatches.map(function (oMatch) {
    return oMatch[1];
  })));

  if (aUniqueIds.length !== 1 || !/^[a-z0-9_-]+::catalog$/i.test(aUniqueIds[0] || "")) {
    throw new Error("Could not identify one safe catalog ID in the official K+K viewer HTML");
  }

  return aUniqueIds[0];
}

function parseCatalogXml(oBody) {
  let oParsed;

  try {
    oParsed = XML_PARSER.parse(Buffer.from(oBody).toString("utf8"));
  } catch (oError) {
    throw new Error("Could not parse K+K catalog XML: " + oError.message);
  }

  const oCatalog = oParsed && oParsed.catalog;

  if (!oCatalog || typeof oCatalog !== "object") {
    throw new Error("K+K catalog XML does not contain a catalog root element");
  }

  return {
    name: oCatalog["@name"],
    pageCount: Number(oCatalog["@nofpages"])
  };
}

async function requestResource(sUrl, oOptions) {
  const oRequestOptions = oOptions || {};
  const fnFetch = oRequestOptions.fetchImpl || globalThis.fetch;
  const sCachePath = oRequestOptions.cachePath;
  const oPreviousRecord = oRequestOptions.previousRecord || {};
  let oCachedBody = null;

  if (sCachePath) {
    try {
      oCachedBody = await fs.readFile(sCachePath);
    } catch (oError) {
      if (oError.code !== "ENOENT") {
        throw oError;
      }
    }
  }

  const mHeaders = {
    accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.8",
    "accept-language": "de-DE,de;q=0.9,en;q=0.7",
    "user-agent": USER_AGENT
  };

  if (oCachedBody && oPreviousRecord.etag) {
    mHeaders["if-none-match"] = oPreviousRecord.etag;
  }

  let oResponse;

  for (let iAttempt = 0; iAttempt < 2; iAttempt += 1) {
    try {
      oResponse = await fnFetch(sUrl, {
        method: "GET",
        headers: mHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(oRequestOptions.timeoutMs || REQUEST_TIMEOUT_MS)
      });
    } catch (oError) {
      if (isTlsError(oError) || iAttempt > 0) {
        throw new Error("K+K source request failed for " + sUrl + ": " + oError.message);
      }

      await delay(500);
      continue;
    }

    if ((oResponse.status === 408 || oResponse.status >= 500) && iAttempt === 0) {
      const iRetryDelay = getRetryDelay(oResponse.headers.get("retry-after"));

      if (iRetryDelay > 5000) {
        throw new Error("K+K requested a retry delay above the 5 second bound; stopping");
      }

      await delay(iRetryDelay);
      continue;
    }

    break;
  }

  const sFinalUrl = oResponse.url || sUrl;
  const oFinalUrl = new URL(sFinalUrl);

  if (oFinalUrl.protocol !== "https:" || oFinalUrl.origin !== new URL(sUrl).origin) {
    throw new Error("K+K source redirected outside its verified HTTPS origin: " + sFinalUrl);
  }

  if (oResponse.status === 304) {
    if (!oCachedBody) {
      throw new Error("K+K returned 304 without a reusable local source file: " + sUrl);
    }

    return {
      body: oCachedBody,
      requestedUrl: sUrl,
      finalUrl: sFinalUrl,
      status: 304,
      contentType: oResponse.headers.get("content-type") || oPreviousRecord.contentType || null,
      etag: oResponse.headers.get("etag") || oPreviousRecord.etag || null,
      lastModified: oResponse.headers.get("last-modified") || oPreviousRecord.lastModified || null,
      reusedFromCache: true
    };
  }

  if (oResponse.status === 429) {
    throw new Error("K+K source returned HTTP 429; stopping without retrying or bypassing limits");
  }

  if (oResponse.status < 200 || oResponse.status >= 300) {
    throw new Error("K+K source returned HTTP " + oResponse.status + " for " + sUrl);
  }

  const sContentType = oResponse.headers.get("content-type") || "";

  if (oRequestOptions.expectedContentType && !oRequestOptions.expectedContentType.test(sContentType)) {
    throw new Error("Unexpected K+K content type " + sContentType + " for " + sUrl);
  }

  const oBody = Buffer.from(await oResponse.arrayBuffer());

  return {
    body: oBody,
    requestedUrl: sUrl,
    finalUrl: sFinalUrl,
    status: oResponse.status,
    contentType: sContentType,
    etag: oResponse.headers.get("etag"),
    lastModified: oResponse.headers.get("last-modified"),
    reusedFromCache: false
  };
}

async function saveResource(oResource, sCatalogDirectory, sRelativePath, sExpectedOrigin) {
  const sLocalPath = path.join(sCatalogDirectory, sRelativePath);
  const oFinalUrl = new URL(oResource.finalUrl);

  if (oFinalUrl.protocol !== "https:" || oFinalUrl.origin !== sExpectedOrigin) {
    throw new Error("Refusing to save a K+K resource from an unexpected origin");
  }

  await fs.mkdir(path.dirname(sLocalPath), { recursive: true });

  if (!oResource.reusedFromCache) {
    await fs.writeFile(sLocalPath, oResource.body);
  }

  return {
    requestedUrl: oResource.requestedUrl,
    finalUrl: oResource.finalUrl,
    status: oResource.status,
    contentType: oResource.contentType,
    etag: oResource.etag,
    lastModified: oResource.lastModified,
    localPath: path.relative(path.dirname(sCatalogDirectory), sLocalPath),
    bytes: oResource.body.length,
    sha256: crypto.createHash("sha256").update(oResource.body).digest("hex"),
    reusedFromCache: oResource.reusedFromCache
  };
}

async function readPreviousManifest(sCatalogDirectory) {
  const aManifestPaths = [
    path.join(sCatalogDirectory, "manifest.json"),
    path.join(sCatalogDirectory, "research-manifest.json")
  ];

  for (const sManifestPath of aManifestPaths) {
    try {
      return JSON.parse(await fs.readFile(sManifestPath, "utf8"));
    } catch (oError) {
      if (oError.code !== "ENOENT") {
        throw oError;
      }
    }
  }

  return null;
}

function findPreviousRecord(oManifest, sUrl) {
  const aResources = oManifest && Array.isArray(oManifest.resources) ? oManifest.resources : [];

  return aResources.find(function (oResource) {
    return oResource && oResource.requestedUrl === sUrl;
  }) || null;
}

function ensureTrailingSlash(sUrl) {
  return sUrl.endsWith("/") ? sUrl : sUrl + "/";
}

function isTlsError(oError) {
  const sCode = String(oError.code || "");
  const sMessage = String(oError.message || "");

  return /CERT|TLS|SSL/i.test(sCode + " " + sMessage);
}

function getRetryDelay(sRetryAfter) {
  if (!sRetryAfter) {
    return 500;
  }

  const fSeconds = Number(sRetryAfter);

  if (Number.isFinite(fSeconds)) {
    return Math.max(0, Math.ceil(fSeconds * 1000));
  }

  const iRetryAt = Date.parse(sRetryAfter);

  return Number.isNaN(iRetryAt) ? 500 : Math.max(0, iRetryAt - Date.now());
}

function delay(iMilliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, iMilliseconds);
  });
}

async function writeJson(sPath, oValue) {
  await fs.writeFile(sPath, JSON.stringify(oValue, null, 2) + "\n", "utf8");
}

module.exports = {
  DEFAULT_VIEWER_URL: DEFAULT_VIEWER_URL,
  discover: discover,
  parseCatalogXml: parseCatalogXml,
  parseViewerCatalogId: parseViewerCatalogId
};
