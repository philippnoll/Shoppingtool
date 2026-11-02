"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const SOURCE_URL = "https://www.aldi-nord.de/angebote.html";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

async function getSnapshot(oOptions) {
  const oConfig = oOptions || {};
  const sDirectory = oConfig.directory || path.join("data", "raw", "offers", "aldi-nord");
  const fNow = oConfig.now || function () {
    return new Date();
  };
  const fValidate = oConfig.validate || function () {};
  const nCacheMaxAgeMs = oConfig.cacheMaxAgeMs === undefined
    ? DEFAULT_CACHE_MAX_AGE_MS
    : oConfig.cacheMaxAgeMs;

  await fs.mkdir(sDirectory, { recursive: true });

  if (!oConfig.forceRefresh) {
    const oCached = await findReusableSnapshot(sDirectory, fNow(), nCacheMaxAgeMs, fValidate);

    if (oCached) {
      return oCached;
    }
  }

  const sHtml = await fetchHtml(oConfig);
  const oFetchedAtDate = fNow();
  const sFetchedAt = oFetchedAtDate.toISOString();
  const sFileStem = await createUniqueFileStem(sDirectory, sFetchedAt);
  const sHtmlPath = path.join(sDirectory, sFileStem + ".html");
  const sMetadataPath = path.join(sDirectory, sFileStem + ".meta.json");
  const sSha256 = sha256(sHtml);
  const oMetadata = {
    sourceUrl: SOURCE_URL,
    fetchedAt: sFetchedAt,
    sha256: sSha256,
    byteLength: global.Buffer.byteLength(sHtml, "utf8"),
    validation: "pending"
  };

  await fs.writeFile(sHtmlPath, sHtml, { encoding: "utf8", flag: "wx" });

  try {
    fValidate(sHtml);
    oMetadata.validation = "passed";
  } catch (oError) {
    oMetadata.validation = "failed";
    oMetadata.validationError = oError.message;
    await writeMetadata(sMetadataPath, oMetadata);
    oError.message += "; raw response preserved at " + sHtmlPath;
    throw oError;
  }

  await writeMetadata(sMetadataPath, oMetadata);

  return {
    html: sHtml,
    metadata: oMetadata,
    htmlPath: sHtmlPath,
    reused: false
  };
}

async function fetchHtml(oOptions) {
  const oConfig = oOptions || {};
  const fFetch = oConfig.fetchImpl || globalThis.fetch;
  const fSleep = oConfig.sleep || delay;
  const nTimeoutMs = oConfig.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : oConfig.timeoutMs;
  const nMaxRetries = oConfig.maxRetries === undefined ? DEFAULT_MAX_RETRIES : oConfig.maxRetries;

  if (typeof fFetch !== "function") {
    throw new Error("ALDI Nord offers fetch failed: Node.js fetch is unavailable");
  }

  for (let iAttempt = 0; iAttempt <= nMaxRetries; iAttempt += 1) {
    try {
      const oController = new global.AbortController();
      const oTimeout = global.setTimeout(function () {
        oController.abort();
      }, nTimeoutMs);
      let oResponse;

      try {
        oResponse = await fFetch(SOURCE_URL, {
          method: "GET",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "Shoppingtool personal offer research (respectful, public-page fetch)"
          },
          signal: oController.signal
        });

        if (!oResponse || !oResponse.ok) {
          const nStatus = oResponse && oResponse.status;
          const oError = new Error("ALDI Nord offers request returned HTTP " + (nStatus || "unknown"));
          oError.retryable = nStatus === 429 || (Number(nStatus) >= 500 && Number(nStatus) <= 599);
          throw oError;
        }

        const sHtml = await oResponse.text();

        if (!sHtml.trim()) {
          const oError = new Error("ALDI Nord offers request returned an empty page");
          oError.retryable = true;
          throw oError;
        }

        return sHtml;
      } finally {
        global.clearTimeout(oTimeout);
      }
    } catch (oError) {
      const bRetryable = oError.retryable !== false;

      if (!bRetryable || iAttempt >= nMaxRetries) {
        const sKind = oError.name === "AbortError" ? "timed out" : "failed";
        throw new Error(
          "ALDI Nord offers request " + sKind + " after " + (iAttempt + 1) +
          " attempt(s): " + oError.message
        );
      }

      const nDelayMs = Math.min(500 * (2 ** iAttempt), 2000);
      await fSleep(nDelayMs);
    }
  }

  throw new Error("ALDI Nord offers request failed without a result");
}

async function findReusableSnapshot(sDirectory, oNow, nMaxAgeMs, fValidate) {
  const aNames = await fs.readdir(sDirectory);
  const aCandidates = aNames.filter(function (sName) {
    return sName.endsWith(".html");
  }).sort().reverse();

  for (const sName of aCandidates) {
    const sHtmlPath = path.join(sDirectory, sName);
    const sMetadataPath = path.join(sDirectory, sName.replace(/\.html$/, ".meta.json"));

    try {
      const [sHtml, sMetadataJson] = await Promise.all([
        fs.readFile(sHtmlPath, "utf8"),
        fs.readFile(sMetadataPath, "utf8")
      ]);
      const oMetadata = JSON.parse(sMetadataJson);
      const nAgeMs = oNow.getTime() - Date.parse(oMetadata.fetchedAt);

      if (oMetadata.sourceUrl !== SOURCE_URL || oMetadata.validation !== "passed" ||
        !Number.isFinite(nAgeMs) || nAgeMs < 0 || nAgeMs > nMaxAgeMs ||
        sha256(sHtml) !== oMetadata.sha256) {
        continue;
      }

      fValidate(sHtml);

      return {
        html: sHtml,
        metadata: oMetadata,
        htmlPath: sHtmlPath,
        reused: true
      };
    } catch {
      // Keep corrupt or outdated evidence for inspection; only skip it as a cache entry.
    }
  }

  return null;
}

async function createUniqueFileStem(sDirectory, sFetchedAt) {
  const sBaseStem = sFetchedAt.replace(/[-:.]/g, "").replace(/Z$/, "Z");

  for (let iSuffix = 0; iSuffix < 100; iSuffix += 1) {
    const sStem = iSuffix ? sBaseStem + "-" + iSuffix : sBaseStem;

    try {
      await fs.access(path.join(sDirectory, sStem + ".html"));
    } catch {
      return sStem;
    }
  }

  throw new Error("Could not create a unique ALDI Nord snapshot filename");
}

async function writeMetadata(sFilePath, oMetadata) {
  await fs.writeFile(sFilePath, JSON.stringify(oMetadata, null, 2) + "\n", "utf8");
}

function sha256(sValue) {
  return crypto.createHash("sha256").update(sValue, "utf8").digest("hex");
}

function delay(nMilliseconds) {
  return new Promise(function (resolve) {
    global.setTimeout(resolve, nMilliseconds);
  });
}

module.exports = {
  SOURCE_URL: SOURCE_URL,
  DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES: DEFAULT_MAX_RETRIES,
  DEFAULT_CACHE_MAX_AGE_MS: DEFAULT_CACHE_MAX_AGE_MS,
  getSnapshot: getSnapshot,
  fetchHtml: fetchHtml
};
