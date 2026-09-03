"use strict";

const { Buffer } = require("node:buffer");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");
const util = require("node:util");
const HttpClient = require("./HttpClient");
const LidlNormalizer = require("./LidlNormalizer");
const LidlOfferCandidateParser = require("./LidlOfferCandidateParser");
const LidlOfferPromoter = require("./LidlOfferPromoter");
const LidlPdfLayoutParser = require("./LidlPdfLayoutParser");

const execFile = util.promisify(childProcess.execFile);
const DEFAULT_DISCOVERY_URL = "https://www.lidl.de/c/online-prospekte/s10005610";
const DEFAULT_FLYER_API_URL = "https://endpoints.leaflets.schwarz/v4/flyer";
const DEFAULT_STORE_ID = "lidl-gronauerstrasse-48599";
const DEFAULT_DISCOVERY_CACHE_MS = 6 * 60 * 60 * 1000;
const USER_AGENT = "Shoppingtool/0.1 private local Lidl offer pipeline";

class LidlPipelineError extends Error {
  constructor(sStep, sCode, sMessage, oOriginalError) {
    super("Lidl pipeline " + sStep + " failed: " + sMessage);
    this.name = "LidlPipelineError";
    this.step = sStep;
    this.code = sCode;
    this.originalError = oOriginalError || null;
  }
}

async function run(oOptions, oDependencies) {
  const oConfig = createConfig(oOptions, oDependencies);
  const oPaths = createPaths(oConfig.rootDir);
  const oDiscovery = await loadDiscovery(oConfig, oPaths);
  const oSelection = selectFlyerSource(oDiscovery.body, oDiscovery.contentType, oConfig.referenceDate);
  const sFlyerIdentifier = oSelection.flyerIdentifier;
  const sSafeIdentifier = safeFileName(sFlyerIdentifier);
  const oFlyerPaths = createFlyerPaths(oPaths, sSafeIdentifier);
  const oSource = await loadFlyerSource(oConfig, oFlyerPaths, oDiscovery, oSelection);
  const oFlyer = validateFlyerSource(oSource.document, oSource.sourceUrl);

  validateFlyerSelection(
    oFlyer,
    oSelection,
    oConfig.referenceDate,
    relativePath(oConfig.rootDir, oSource.sourceFile)
  );

  const oPdf = await loadPdf(oConfig, oFlyerPaths, oFlyer, oSource);
  const oExtraction = await extractPdf(oConfig, oPaths, sSafeIdentifier, oPdf);
  const aPages = await parseLayout(oExtraction.bboxPath);
  const oNormalizedFlyer = LidlNormalizer.normalizeFlyer(oSource.document, {
    storeId: oConfig.storeId,
    fetchedAt: oSource.retrievedAt,
    pdfUrl: oFlyer.pdfUrl,
    provenance: createProvenance(oConfig, oDiscovery, oSelection, oSource, oPdf, oExtraction)
  });
  const oOutputPaths = createOutputPaths(oPaths, sSafeIdentifier);
  const sGeneratedAt = oConfig.now().toISOString();
  const oCandidateDocument = createCandidateDocument(
    oNormalizedFlyer,
    aPages,
    sGeneratedAt
  );

  await Promise.all([
    writeJson(oOutputPaths.normalizedFlyer, oNormalizedFlyer),
    writeJson(oOutputPaths.candidates, oCandidateDocument),
    fs.rm(oOutputPaths.review, { force: true }),
    fs.rm(oOutputPaths.optimizer, { force: true }),
    fs.rm(oOutputPaths.qualityReport, { force: true })
  ]);

  const aStores = await readStores(oConfig.rootDir);
  let oPromotionDocuments;

  try {
    oPromotionDocuments = LidlOfferPromoter.promoteDocument(oCandidateDocument, aStores, {
      referenceDate: oConfig.referenceDate,
      generatedAt: sGeneratedAt
    });
  } catch (oError) {
    throw pipelineError("promotion", "promotion-failed", oError);
  }

  const oQualityReport = createQualityReport({
    generatedAt: sGeneratedAt,
    discovery: oDiscovery,
    selection: oSelection,
    source: oSource,
    flyer: oNormalizedFlyer,
    pdf: oPdf,
    extraction: oExtraction,
    pages: aPages,
    candidateDocument: oCandidateDocument,
    promotionDocuments: oPromotionDocuments,
    outputPaths: oOutputPaths,
    rootDir: oConfig.rootDir
  });

  await Promise.all([
    writeJson(oOutputPaths.review, oPromotionDocuments.review),
    writeJson(oOutputPaths.optimizer, oPromotionDocuments.optimizer),
    writeJson(oOutputPaths.qualityReport, oQualityReport)
  ]);

  return {
    qualityReport: oQualityReport,
    paths: oOutputPaths
  };
}

function createConfig(oOptions, oDependencies) {
  const oInput = oOptions || {};
  const oDeps = oDependencies || {};
  const fnNow = oDeps.now || function () {
    return new Date();
  };
  const sReferenceDate = oInput.referenceDate || fnNow().toISOString().slice(0, 10);

  if (!isIsoDate(sReferenceDate)) {
    throw new LidlPipelineError("configuration", "invalid-reference-date", "--as-of must use YYYY-MM-DD");
  }

  return {
    rootDir: path.resolve(oInput.rootDir || process.cwd()),
    discoveryUrl: oInput.discoveryUrl || DEFAULT_DISCOVERY_URL,
    flyerApiUrl: oInput.flyerApiUrl || DEFAULT_FLYER_API_URL,
    storeId: oInput.storeId || DEFAULT_STORE_ID,
    referenceDate: sReferenceDate,
    force: Boolean(oInput.force),
    discoveryCacheMs: numberOption(oInput.discoveryCacheMs, DEFAULT_DISCOVERY_CACHE_MS),
    timeoutMs: numberOption(oInput.timeoutMs, 10000),
    maxAttempts: numberOption(oInput.maxAttempts, 3),
    retryDelayMs: numberOption(oInput.retryDelayMs, 750),
    fetch: oDeps.fetch || fetch,
    sleep: oDeps.sleep,
    now: fnNow,
    extractPdf: oDeps.extractPdf || defaultExtractPdf
  };
}

function createPaths(sRootDir) {
  return {
    rawRoot: path.join(sRootDir, "data", "raw", "offers", "lidl"),
    normalizedFlyers: path.join(sRootDir, "data", "normalized", "flyers", "lidl"),
    normalizedOffers: path.join(sRootDir, "data", "normalized", "offers", "lidl")
  };
}

function createFlyerPaths(oPaths, sIdentifier) {
  const sFlyerDirectory = path.join(oPaths.rawRoot, "flyers", sIdentifier);

  return {
    directory: sFlyerDirectory,
    sourceMetadata: path.join(sFlyerDirectory, "source.metadata.json")
  };
}

function createOutputPaths(oPaths, sIdentifier) {
  return {
    normalizedFlyer: path.join(oPaths.normalizedFlyers, sIdentifier + ".normalized.json"),
    candidates: path.join(oPaths.normalizedOffers, sIdentifier + ".candidates.json"),
    review: path.join(oPaths.normalizedOffers, sIdentifier + ".review.json"),
    optimizer: path.join(oPaths.normalizedOffers, sIdentifier + ".optimizer-ready.json"),
    qualityReport: path.join(oPaths.normalizedOffers, sIdentifier + ".quality-report.json")
  };
}

async function loadDiscovery(oConfig, oPaths) {
  const sMetadataPath = path.join(oPaths.rawRoot, "discovery.metadata.json");
  const oCachedMetadata = oConfig.force ? null : await readJsonIfPresent(sMetadataPath);

  if (canReuseDiscovery(oCachedMetadata, oConfig)) {
    const sRawPath = path.resolve(oConfig.rootDir, oCachedMetadata.sourceFile);
    const sBody = await readTextIfPresent(sRawPath);

    if (sBody !== null && sha256(Buffer.from(sBody, "utf8")) === oCachedMetadata.sourceSha256) {
      return {
        body: sBody,
        contentType: oCachedMetadata.contentType,
        finalUrl: oCachedMetadata.finalUrl,
        retrievedAt: oCachedMetadata.retrievedAt,
        sourceFile: sRawPath,
        sha256: oCachedMetadata.sourceSha256,
        reused: true
      };
    }
  }

  let oResponse;

  try {
    oResponse = await request(oConfig.discoveryUrl, oConfig, "text");
  } catch (oError) {
    throw pipelineError("discovery", "discovery-request-failed", oError);
  }

  const sBody = oResponse.body;
  const sContentType = oResponse.response.headers.get("content-type") || "";
  const sExtension = looksLikeJson(sBody, sContentType) ? ".json" : ".html";
  const sSourceHash = sha256(Buffer.from(sBody, "utf8"));
  const sRawPath = path.join(oPaths.rawRoot, "discovery-" + sSourceHash.slice(0, 16) + ".response" + sExtension);
  const sRetrievedAt = oConfig.now().toISOString();
  const oMetadata = {
    kind: "lidl-discovery-source",
    requestedUrl: oConfig.discoveryUrl,
    finalUrl: oResponse.response.url || oConfig.discoveryUrl,
    status: oResponse.response.status,
    contentType: sContentType,
    retrievedAt: sRetrievedAt,
    sourceFile: relativePath(oConfig.rootDir, sRawPath),
    sourceSha256: sSourceHash
  };

  await Promise.all([
    writeFile(sRawPath, sBody),
    writeJson(sMetadataPath, oMetadata)
  ]);

  return {
    body: sBody,
    contentType: sContentType,
    finalUrl: oMetadata.finalUrl,
    retrievedAt: sRetrievedAt,
    sourceFile: sRawPath,
    sha256: sSourceHash,
    reused: false
  };
}

function canReuseDiscovery(oMetadata, oConfig) {
  if (!oMetadata || oMetadata.requestedUrl !== oConfig.discoveryUrl || !oMetadata.retrievedAt) {
    return false;
  }

  const iAge = oConfig.now().getTime() - new Date(oMetadata.retrievedAt).getTime();

  return Number.isFinite(iAge) && iAge >= 0 && iAge <= oConfig.discoveryCacheMs;
}

function selectFlyerSource(sBody, sContentType, sReferenceDate) {
  const oJson = parseJson(sBody);

  if (oJson && oJson.flyer) {
    const sIdentifier = String(oJson.flyer.id || "").trim();

    if (!sIdentifier) {
      throw new LidlPipelineError("discovery", "changed-source-shape", "direct flyer JSON has no flyer.id");
    }

    return {
      kind: "direct-json",
      flyerIdentifier: sIdentifier,
      sourceUrl: null,
      selection: "direct",
      document: oJson
    };
  }

  if (looksLikeJson(sBody, sContentType)) {
    throw new LidlPipelineError("discovery", "changed-source-shape", "JSON response does not contain a flyer object");
  }

  const aEvents = extractSaleEvents(sBody).filter(function (oEvent) {
    return /aktionsprospekt/i.test(oEvent.name || "") && isIsoDate(datePart(oEvent.startDate)) && isIsoDate(datePart(oEvent.endDate));
  });
  const oSelected = chooseEvent(aEvents, sReferenceDate);

  if (!oSelected) {
    throw new LidlPipelineError(
      "discovery",
      "no-current-flyer",
      "no active or upcoming dated Aktionsprospekt was found in Lidl JSON-LD for " + sReferenceDate +
        "; Lidl may not have published a current flyer or the discovery page shape may have changed"
    );
  }

  const sIdentifier = extractFlyerIdentifier(oSelected.url);

  if (!sIdentifier) {
    throw new LidlPipelineError(
      "discovery",
      "changed-source-shape",
      "selected Aktionsprospekt URL does not contain /prospekte/<identifier>: " + oSelected.url
    );
  }

  return {
    kind: "discovered-event",
    flyerIdentifier: sIdentifier,
    sourceUrl: oSelected.url,
    selection: oSelected.selection,
    validFrom: datePart(oSelected.startDate),
    validTo: datePart(oSelected.endDate),
    document: null
  };
}

function extractSaleEvents(sHtml) {
  const aMatches = Array.from(sHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  return aMatches.flatMap(function (oMatch) {
    const oJson = parseJson(decodeHtmlEntities(oMatch[1]));

    if (!oJson || oJson["@type"] !== "OfferCatalog") {
      return [];
    }

    return Array.isArray(oJson.itemListElement) ? oJson.itemListElement : [];
  }).filter(function (oItem) {
    return oItem && oItem["@type"] === "SaleEvent" && typeof oItem.url === "string";
  });
}

function chooseEvent(aEvents, sReferenceDate) {
  const aActive = aEvents.filter(function (oEvent) {
    return datePart(oEvent.startDate) <= sReferenceDate && datePart(oEvent.endDate) >= sReferenceDate;
  }).sort(function (oLeft, oRight) {
    return datePart(oRight.startDate).localeCompare(datePart(oLeft.startDate));
  });
  const aUpcoming = aEvents.filter(function (oEvent) {
    return datePart(oEvent.startDate) > sReferenceDate;
  }).sort(function (oLeft, oRight) {
    return datePart(oLeft.startDate).localeCompare(datePart(oRight.startDate));
  });
  const oSelected = aActive[0] || aUpcoming[0];

  if (!oSelected) {
    return null;
  }

  return Object.assign({}, oSelected, {
    selection: aActive[0] === oSelected ? "active" : "upcoming"
  });
}

async function loadFlyerSource(oConfig, oFlyerPaths, oDiscovery, oSelection) {
  const sSourceUrl = oSelection.kind === "direct-json"
    ? oDiscovery.finalUrl
    : createFlyerApiUrl(oConfig.flyerApiUrl, oSelection.flyerIdentifier);
  const oCachedMetadata = oConfig.force ? null : await readJsonIfPresent(oFlyerPaths.sourceMetadata);

  if (oCachedMetadata && oCachedMetadata.sourceUrl === sSourceUrl && oCachedMetadata.sourceFile) {
    const sCachedSourcePath = path.resolve(oConfig.rootDir, oCachedMetadata.sourceFile);
    const oCachedDocument = await readJsonIfPresent(sCachedSourcePath);

    if (oCachedDocument) {
      validateFlyerSource(oCachedDocument, sSourceUrl);

      return {
        document: oCachedDocument,
        sourceUrl: sSourceUrl,
        sourceFile: sCachedSourcePath,
        retrievedAt: oCachedMetadata.retrievedAt,
        reused: true,
        metadata: oCachedMetadata
      };
    }
  }

  let oDocument;
  let sRawSource;
  let sRetrievedAt;
  let sContentType;

  if (oSelection.kind === "direct-json") {
    oDocument = oSelection.document;
    sRawSource = oDiscovery.body;
    sRetrievedAt = oDiscovery.retrievedAt;
    sContentType = oDiscovery.contentType;
  } else {
    let oResponse;

    try {
      oResponse = await request(sSourceUrl, oConfig, "text");
    } catch (oError) {
      throw pipelineError("source download", "source-request-failed", oError);
    }

    sContentType = oResponse.response.headers.get("content-type") || "";
    sRawSource = oResponse.body;

    try {
      oDocument = JSON.parse(sRawSource);
    } catch (oError) {
      const sInvalidHash = sha256(Buffer.from(sRawSource, "utf8"));
      const sInvalidPath = path.join(oFlyerPaths.directory, "source-" + sInvalidHash.slice(0, 16) + ".json");

      await writeFile(sInvalidPath, sRawSource);
      throw new LidlPipelineError(
        "source validation",
        "invalid-source-json",
        "flyer endpoint did not return valid JSON from " + sSourceUrl + ": " + oError.message +
          "; raw response preserved at " + relativePath(oConfig.rootDir, sInvalidPath),
        oError
      );
    }

    sRetrievedAt = oConfig.now().toISOString();
  }

  const sSourceHash = sha256(Buffer.from(sRawSource, "utf8"));
  const sSourcePath = path.join(oFlyerPaths.directory, "source-" + sSourceHash.slice(0, 16) + ".json");

  await writeFile(sSourcePath, sRawSource);

  let oFlyer;

  try {
    oFlyer = validateFlyerSource(oDocument, sSourceUrl);
  } catch (oError) {
    oError.message += "; raw response preserved at " + relativePath(oConfig.rootDir, sSourcePath);
    throw oError;
  }

  const oMetadata = {
    kind: "lidl-flyer-source",
    flyerIdentifier: oSelection.flyerIdentifier,
    flyerId: oFlyer.id,
    sourceUrl: sSourceUrl,
    discoveryUrl: oConfig.discoveryUrl,
    discoveredFlyerUrl: oSelection.sourceUrl,
    contentType: sContentType,
    retrievedAt: sRetrievedAt,
    sourceFile: relativePath(oConfig.rootDir, sSourcePath),
    sourceSha256: sSourceHash,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo,
    pdfUrl: oFlyer.pdfUrl
  };

  await writeJson(oFlyerPaths.sourceMetadata, oMetadata);

  return {
    document: oDocument,
    sourceUrl: sSourceUrl,
    sourceFile: sSourcePath,
    retrievedAt: sRetrievedAt,
    reused: false,
    metadata: oMetadata
  };
}

function validateFlyerSource(oDocument, sSourceUrl) {
  if (!oDocument || typeof oDocument !== "object" || Array.isArray(oDocument)) {
    throw changedSourceError("flyer source is not a JSON object", sSourceUrl);
  }

  if (oDocument.success === false) {
    throw changedSourceError("flyer endpoint reported success=false: " + (oDocument.message || "no message"), sSourceUrl);
  }

  const oFlyer = oDocument.flyer;

  if (!oFlyer || typeof oFlyer !== "object" || Array.isArray(oFlyer)) {
    throw changedSourceError("flyer source has no flyer object", sSourceUrl);
  }

  if (!String(oFlyer.id || "").trim()) {
    throw changedSourceError("flyer source has no flyer.id", sSourceUrl);
  }

  if (!Array.isArray(oFlyer.pages) || !oFlyer.pages.length) {
    throw changedSourceError("flyer.pages must be a non-empty array", sSourceUrl);
  }

  const sValidFrom = oFlyer.offerStartDate || oFlyer.startDate;
  const sValidTo = oFlyer.offerEndDate || oFlyer.endDate;

  if (!isIsoDate(sValidFrom) || !isIsoDate(sValidTo) || sValidFrom > sValidTo) {
    throw changedSourceError("flyer validity dates are missing or invalid", sSourceUrl);
  }

  if (typeof oFlyer.pdfUrl !== "string" || !/^https?:\/\//i.test(oFlyer.pdfUrl)) {
    throw new LidlPipelineError(
      "source validation",
      "missing-pdf-url",
      "flyer " + oFlyer.id + " has no usable pdfUrl; Lidl may have changed the source shape (source: " + sSourceUrl + ")"
    );
  }

  return {
    id: String(oFlyer.id),
    validFrom: sValidFrom,
    validTo: sValidTo,
    pdfUrl: oFlyer.pdfUrl,
    pageCount: oFlyer.pages.length
  };
}

function changedSourceError(sMessage, sSourceUrl) {
  return new LidlPipelineError(
    "source validation",
    "changed-source-shape",
    sMessage + "; inspect the preserved source at " + sSourceUrl
  );
}

function validateFlyerSelection(oFlyer, oSelection, sReferenceDate, sSourceFile) {
  if (oFlyer.validTo < sReferenceDate) {
    throw new LidlPipelineError(
      "source validation",
      "no-current-flyer",
      "flyer " + oFlyer.id + " expired on " + oFlyer.validTo + " before reference date " + sReferenceDate +
        "; inspect preserved source at " + sSourceFile
    );
  }

  if (oSelection.kind === "discovered-event" &&
      (oFlyer.validFrom !== oSelection.validFrom || oFlyer.validTo !== oSelection.validTo)) {
    throw new LidlPipelineError(
      "source validation",
      "selected-flyer-date-mismatch",
      "selected " + oSelection.selection + " Aktionsprospekt " + oSelection.flyerIdentifier + " is valid from " +
        oSelection.validFrom + " to " + oSelection.validTo + ", but source flyer " + oFlyer.id + " is valid from " +
        oFlyer.validFrom + " to " + oFlyer.validTo + "; inspect preserved source at " + sSourceFile
    );
  }
}

async function loadPdf(oConfig, oFlyerPaths, oFlyer, oSource) {
  const oMetadata = oSource.metadata || {};

  if (!oConfig.force && oMetadata.pdfUrl === oFlyer.pdfUrl && oMetadata.pdfSha256 && oMetadata.pdfFile) {
    const sCachedPdfPath = path.resolve(oConfig.rootDir, oMetadata.pdfFile);
    const oBytes = await readBufferIfPresent(sCachedPdfPath);

    if (oBytes && isPdf(oBytes) && sha256(oBytes) === oMetadata.pdfSha256) {
      return {
        path: sCachedPdfPath,
        url: oFlyer.pdfUrl,
        retrievedAt: oMetadata.pdfRetrievedAt,
        sha256: oMetadata.pdfSha256,
        reused: true
      };
    }
  }

  let oResponse;

  try {
    oResponse = await request(oFlyer.pdfUrl, oConfig, "arrayBuffer");
  } catch (oError) {
    throw pipelineError("PDF download", "pdf-request-failed", oError);
  }

  const oBytes = Buffer.from(oResponse.body);
  const sHash = sha256(oBytes);

  if (!isPdf(oBytes)) {
    const sInvalidPath = path.join(oFlyerPaths.directory, "download-" + sHash.slice(0, 16) + ".invalid");

    await writeFile(sInvalidPath, oBytes);
    throw new LidlPipelineError(
      "PDF validation",
      "invalid-pdf",
      "download from " + oFlyer.pdfUrl + " is not a PDF (content-type: " +
        (oResponse.response.headers.get("content-type") || "unknown") + ", bytes: " + oBytes.length +
        "); raw response preserved at " + relativePath(oConfig.rootDir, sInvalidPath)
    );
  }

  const sRetrievedAt = oConfig.now().toISOString();
  const sPdfPath = path.join(oFlyerPaths.directory, "flyer-" + sHash.slice(0, 16) + ".pdf");
  const oUpdatedMetadata = Object.assign({}, oMetadata, {
    pdfUrl: oFlyer.pdfUrl,
    pdfFile: relativePath(oConfig.rootDir, sPdfPath),
    pdfRetrievedAt: sRetrievedAt,
    pdfSha256: sHash
  });

  await Promise.all([
    writeFile(sPdfPath, oBytes),
    writeJson(oFlyerPaths.sourceMetadata, oUpdatedMetadata)
  ]);
  oSource.metadata = oUpdatedMetadata;

  return {
    path: sPdfPath,
    url: oFlyer.pdfUrl,
    retrievedAt: sRetrievedAt,
    sha256: sHash,
    reused: false
  };
}

async function extractPdf(oConfig, oPaths, sIdentifier, oPdf) {
  const sOutputDirectory = path.join(oPaths.rawRoot, "pdf-text");
  const sExtractionStem = sIdentifier + "-" + oPdf.sha256.slice(0, 16);
  const sTextPath = path.join(sOutputDirectory, sExtractionStem + ".txt");
  const sBboxPath = path.join(sOutputDirectory, sExtractionStem + ".bbox.html");
  const sMetadataPath = path.join(sOutputDirectory, sIdentifier + ".metadata.json");
  const oMetadata = oConfig.force ? null : await readJsonIfPresent(sMetadataPath);

  if (oMetadata && oMetadata.pdfSha256 === oPdf.sha256 &&
      await isNonEmptyFile(sTextPath) && await isNonEmptyFile(sBboxPath)) {
    try {
      const sBbox = await fs.readFile(sBboxPath, "utf8");
      const aPages = LidlPdfLayoutParser.parseLayout(sBbox);

      if (aPages.length) {
        return {
          textPath: sTextPath,
          bboxPath: sBboxPath,
          extractedAt: oMetadata.extractedAt,
          reused: true
        };
      }
    } catch {
      // Corrupt cached extraction is replaced below from the preserved PDF.
    }
  }

  await fs.mkdir(sOutputDirectory, { recursive: true });

  try {
    await oConfig.extractPdf({
      pdfPath: oPdf.path,
      textPath: sTextPath,
      bboxPath: sBboxPath
    });
  } catch (oError) {
    throw new LidlPipelineError(
      "PDF extraction",
      "extraction-failed",
      "pdftotext could not extract " + oPdf.path + ". Ensure poppler-utils is installed. " + oError.message,
      oError
    );
  }

  if (!await isNonEmptyFile(sTextPath) || !await isNonEmptyFile(sBboxPath)) {
    throw new LidlPipelineError(
      "PDF extraction",
      "extraction-failed",
      "pdftotext completed without non-empty layout and bbox outputs for " + oPdf.path
    );
  }

  const sExtractedAt = oConfig.now().toISOString();

  await writeJson(sMetadataPath, {
    kind: "lidl-pdf-extraction",
    pdfFile: relativePath(oConfig.rootDir, oPdf.path),
    pdfSha256: oPdf.sha256,
    extractedAt: sExtractedAt,
    layoutTextFile: relativePath(oConfig.rootDir, sTextPath),
    positionedTextFile: relativePath(oConfig.rootDir, sBboxPath)
  });

  return {
    textPath: sTextPath,
    bboxPath: sBboxPath,
    extractedAt: sExtractedAt,
    reused: false
  };
}

async function defaultExtractPdf(oInput) {
  await execFile("pdftotext", ["-layout", oInput.pdfPath, oInput.textPath], { timeout: 120000 });
  await execFile("pdftotext", ["-bbox-layout", oInput.pdfPath, oInput.bboxPath], { timeout: 120000 });
}

async function parseLayout(sBboxPath) {
  let sXhtml;

  try {
    sXhtml = await fs.readFile(sBboxPath, "utf8");
    const aPages = LidlPdfLayoutParser.parseLayout(sXhtml);

    if (!aPages.length) {
      throw new Error("no PDF pages were found");
    }

    return aPages;
  } catch (oError) {
    throw new LidlPipelineError(
      "positioned text parsing",
      "layout-parse-failed",
      "cannot parse " + sBboxPath + ": " + oError.message,
      oError
    );
  }
}

function createProvenance(oConfig, oDiscovery, oSelection, oSource, oPdf, oExtraction) {
  return {
    flyerIdentifier: oSelection.flyerIdentifier,
    discoveryUrl: oConfig.discoveryUrl,
    discoverySourceFile: relativePath(oConfig.rootDir, oDiscovery.sourceFile),
    discoveryRetrievedAt: oDiscovery.retrievedAt,
    discoverySha256: oDiscovery.sha256,
    sourceUrl: oSource.sourceUrl,
    sourceFile: relativePath(oConfig.rootDir, oSource.sourceFile),
    sourceRetrievedAt: oSource.retrievedAt,
    sourceSha256: oSource.metadata.sourceSha256 || null,
    pdfUrl: oPdf.url,
    pdfFile: relativePath(oConfig.rootDir, oPdf.path),
    pdfRetrievedAt: oPdf.retrievedAt,
    pdfSha256: oPdf.sha256,
    positionedTextFile: relativePath(oConfig.rootDir, oExtraction.bboxPath),
    extractedAt: oExtraction.extractedAt
  };
}

function createCandidateDocument(oFlyer, aPages, sGeneratedAt) {
  const oContext = {
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo
  };
  const aCandidates = aPages.flatMap(function (oPage) {
    return LidlOfferCandidateParser.parsePage(oPage, oContext);
  });

  return {
    kind: "lidl-offer-candidates",
    source: "lidl-pdf",
    flyerId: oFlyer.flyerId,
    storeId: oFlyer.storeId,
    validFrom: oFlyer.validFrom,
    validTo: oFlyer.validTo,
    generatedAt: sGeneratedAt,
    provenance: oFlyer.provenance,
    candidateCount: aCandidates.length,
    candidates: aCandidates
  };
}

function createQualityReport(oInput) {
  const oSummary = oInput.promotionDocuments.review.summary;
  const aWarnings = normalizeWarnings(oInput.source.document && oInput.source.document.warnings);
  const iNormalizedPages = (oInput.flyer.pages || []).length;
  const iProcessedPages = oInput.pages.length;

  if (iNormalizedPages !== iProcessedPages) {
    aWarnings.push("Source lists " + iNormalizedPages + " pages but positioned PDF text contains " + iProcessedPages + " pages");
  }

  if (!oInput.candidateDocument.candidateCount) {
    aWarnings.push("No offer candidates were parsed; inspect the PDF text and parser layout assumptions");
  }

  if (!oInput.promotionDocuments.optimizer.offerCount && oInput.candidateDocument.candidateCount) {
    aWarnings.push("No candidates were promoted for reference date " + oInput.promotionDocuments.review.referenceDate);
  }

  return {
    kind: "lidl-offer-quality-report",
    status: "completed",
    generatedAt: oInput.generatedAt,
    referenceDate: oInput.promotionDocuments.review.referenceDate,
    source: {
      flyerIdentifier: oInput.selection.flyerIdentifier,
      flyerId: oInput.flyer.flyerId,
      selection: oInput.selection.selection,
      discoveryUrl: oInput.flyer.provenance.discoveryUrl,
      discoverySourceFile: oInput.flyer.provenance.discoverySourceFile,
      discoveryRetrievedAt: oInput.discovery.retrievedAt,
      discoverySha256: oInput.discovery.sha256 || null,
      flyerSourceUrl: oInput.source.sourceUrl,
      flyerSourceFile: relativePath(oInput.rootDir, oInput.source.sourceFile),
      flyerRetrievedAt: oInput.source.retrievedAt,
      flyerSourceSha256: oInput.source.metadata && oInput.source.metadata.sourceSha256 || null,
      pdfUrl: oInput.pdf.url,
      pdfFile: relativePath(oInput.rootDir, oInput.pdf.path),
      pdfRetrievedAt: oInput.pdf.retrievedAt,
      pdfSha256: oInput.pdf.sha256,
      validFrom: oInput.flyer.validFrom,
      validTo: oInput.flyer.validTo
    },
    artifactReuse: {
      discovery: oInput.discovery.reused,
      flyerSource: oInput.source.reused,
      pdf: oInput.pdf.reused,
      extraction: oInput.extraction.reused
    },
    pagesProcessed: iProcessedPages,
    sourcePageCount: iNormalizedPages,
    candidateCount: oInput.candidateDocument.candidateCount,
    matchOutcomes: oSummary.matchTypeCounts,
    matchedCount: oInput.promotionDocuments.review.entries.filter(function (oEntry) {
      return Boolean(oEntry.match.productKey);
    }).length,
    promotionCount: oInput.promotionDocuments.optimizer.offerCount,
    reviewCount: oSummary.reviewCount,
    reviewReasons: oSummary.reasonCounts,
    warnings: Array.from(new Set(aWarnings)),
    outputs: {
      normalizedFlyer: relativePath(oInput.rootDir, oInput.outputPaths.normalizedFlyer),
      candidates: relativePath(oInput.rootDir, oInput.outputPaths.candidates),
      review: relativePath(oInput.rootDir, oInput.outputPaths.review),
      optimizerReady: relativePath(oInput.rootDir, oInput.outputPaths.optimizer),
      qualityReport: relativePath(oInput.rootDir, oInput.outputPaths.qualityReport)
    }
  };
}

async function request(sUrl, oConfig, sBodyType) {
  return HttpClient.fetchWithRetry(sUrl, {
    fetch: oConfig.fetch,
    sleep: oConfig.sleep,
    timeoutMs: oConfig.timeoutMs,
    maxAttempts: oConfig.maxAttempts,
    retryDelayMs: oConfig.retryDelayMs,
    readBody: sBodyType === "arrayBuffer" ? function (oResponse) {
      return oResponse.arrayBuffer();
    } : function (oResponse) {
      return oResponse.text();
    },
    headers: {
      "accept": "text/html,application/json,application/pdf;q=0.9,*/*;q=0.8",
      "accept-language": "de-DE,de;q=0.9,en;q=0.7",
      "user-agent": USER_AGENT
    }
  });
}

function createFlyerApiUrl(sApiUrl, sIdentifier) {
  const oUrl = new URL(sApiUrl);

  oUrl.searchParams.set("flyer_identifier", sIdentifier);
  oUrl.searchParams.set("region_id", "0");

  return oUrl.toString();
}

function extractFlyerIdentifier(sUrl) {
  try {
    const aParts = new URL(sUrl).pathname.split("/").filter(Boolean);
    const iIndex = aParts.indexOf("prospekte");

    return iIndex >= 0 && aParts[iIndex + 1] ? decodeURIComponent(aParts[iIndex + 1]) : null;
  } catch {
    return null;
  }
}

function parseJson(sValue) {
  try {
    return JSON.parse(sValue);
  } catch {
    return null;
  }
}

function looksLikeJson(sBody, sContentType) {
  return /json/i.test(sContentType || "") || /^[\s\n\r]*[\[{]/.test(sBody);
}

function decodeHtmlEntities(sText) {
  return String(sText)
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function datePart(sValue) {
  return String(sValue || "").slice(0, 10);
}

function isIsoDate(sValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sValue || ""))) {
    return false;
  }

  const oDate = new Date(sValue + "T00:00:00.000Z");

  return !Number.isNaN(oDate.getTime()) && oDate.toISOString().slice(0, 10) === sValue;
}

function isPdf(oBytes) {
  return oBytes.length >= 5 && oBytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

function sha256(oBytes) {
  return crypto.createHash("sha256").update(oBytes).digest("hex");
}

function safeFileName(sValue) {
  const sSafe = String(sValue || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  if (!sSafe || sSafe === "." || sSafe === "..") {
    throw new LidlPipelineError("discovery", "invalid-flyer-identifier", "flyer identifier cannot be used as a file name");
  }

  return sSafe;
}

function relativePath(sRootDir, sFilePath) {
  return path.relative(sRootDir, sFilePath).split(path.sep).join("/");
}

function normalizeWarnings(vWarnings) {
  if (!Array.isArray(vWarnings)) {
    return [];
  }

  return vWarnings.map(function (vWarning) {
    return typeof vWarning === "string" ? vWarning : JSON.stringify(vWarning);
  });
}

async function readStores(sRootDir) {
  const sStoresPath = path.join(sRootDir, "data", "stores.json");

  try {
    const aStores = JSON.parse(await fs.readFile(sStoresPath, "utf8"));

    if (!Array.isArray(aStores)) {
      throw new Error("root value is not an array");
    }

    return aStores;
  } catch (oError) {
    throw new LidlPipelineError("promotion", "invalid-store-data", "cannot read " + sStoresPath + ": " + oError.message, oError);
  }
}

async function readJsonIfPresent(sFilePath) {
  try {
    return JSON.parse(await fs.readFile(sFilePath, "utf8"));
  } catch (oError) {
    if (oError.code === "ENOENT" || oError instanceof SyntaxError) {
      return null;
    }

    throw oError;
  }
}

async function readTextIfPresent(sFilePath) {
  try {
    return await fs.readFile(sFilePath, "utf8");
  } catch (oError) {
    if (oError.code === "ENOENT") {
      return null;
    }

    throw oError;
  }
}

async function readBufferIfPresent(sFilePath) {
  try {
    return await fs.readFile(sFilePath);
  } catch (oError) {
    if (oError.code === "ENOENT") {
      return null;
    }

    throw oError;
  }
}

async function isNonEmptyFile(sFilePath) {
  try {
    return (await fs.stat(sFilePath)).size > 0;
  } catch {
    return false;
  }
}

async function writeJson(sFilePath, oValue) {
  return writeFile(sFilePath, JSON.stringify(oValue, null, 2) + "\n");
}

async function writeFile(sFilePath, vContent) {
  await fs.mkdir(path.dirname(sFilePath), { recursive: true });
  const sTemporaryPath = sFilePath + ".tmp-" + process.pid + "-" + Math.random().toString(16).slice(2);

  try {
    await fs.writeFile(sTemporaryPath, vContent);
    await fs.rename(sTemporaryPath, sFilePath);
  } catch (oError) {
    await fs.rm(sTemporaryPath, { force: true });
    throw oError;
  }
}

function pipelineError(sStep, sCode, oError) {
  if (oError instanceof LidlPipelineError) {
    return oError;
  }

  return new LidlPipelineError(sStep, sCode, oError.message || String(oError), oError);
}

function numberOption(vValue, iFallback) {
  const iNumber = Number(vValue);

  return Number.isFinite(iNumber) && iNumber >= 0 ? iNumber : iFallback;
}

module.exports = {
  LidlPipelineError: LidlPipelineError,
  createQualityReport: createQualityReport,
  extractSaleEvents: extractSaleEvents,
  run: run,
  selectFlyerSource: selectFlyerSource
};
