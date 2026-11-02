"use strict";

const timers = require("node:timers");

const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

class NetworkRequestError extends Error {
  constructor(sMessage, oDetails) {
    super(sMessage);
    this.name = "NetworkRequestError";
    this.code = "network-request-failed";
    this.attempts = oDetails.attempts;
    this.url = oDetails.url;
    this.status = oDetails.status || null;
    this.originalError = oDetails.originalError || null;
  }
}

async function fetchWithRetry(sUrl, oOptions) {
  const oConfig = oOptions || {};
  const fnFetch = oConfig.fetch || fetch;
  const fnSleep = oConfig.sleep || sleep;
  const iMaxAttempts = positiveInteger(oConfig.maxAttempts, 3);
  const iTimeoutMs = positiveInteger(oConfig.timeoutMs, 10000);
  const iRetryDelayMs = nonNegativeNumber(oConfig.retryDelayMs, 750);
  let oLastError;
  let iLastStatus = null;

  for (let iAttempt = 1; iAttempt <= iMaxAttempts; iAttempt += 1) {
    const oController = new global.AbortController();
    const iTimeout = timers.setTimeout(function () {
      oController.abort();
    }, iTimeoutMs);

    try {
      const oResponse = await fnFetch(sUrl, {
        headers: oConfig.headers,
        signal: oController.signal
      });

      iLastStatus = oResponse.status;

      if (oResponse.ok) {
        if (oConfig.readBody) {
          return {
            response: oResponse,
            body: await oConfig.readBody(oResponse)
          };
        }

        return oResponse;
      }

      const sResponseHint = await readResponseHint(oResponse);
      oLastError = new Error(
        "HTTP " + oResponse.status + (oResponse.statusText ? " " + oResponse.statusText : "") + sResponseHint
      );

      if (!DEFAULT_RETRYABLE_STATUS_CODES.has(oResponse.status)) {
        throw createFinalError(sUrl, iAttempt, oLastError, oResponse.status);
      }
    } catch (oError) {
      if (oError instanceof NetworkRequestError) {
        throw oError;
      }

      oLastError = normalizeAbortError(oError, iTimeoutMs);
    } finally {
      timers.clearTimeout(iTimeout);
    }

    if (iAttempt < iMaxAttempts) {
      await fnSleep(iRetryDelayMs * iAttempt);
    }
  }

  throw createFinalError(sUrl, iMaxAttempts, oLastError, iLastStatus);
}

function createFinalError(sUrl, iAttempts, oError, iStatus) {
  return new NetworkRequestError(
    "Request failed after " + iAttempts + " attempt" + (iAttempts === 1 ? "" : "s") +
      " for " + sUrl + ": " + (oError ? oError.message : "unknown network error"),
    {
      attempts: iAttempts,
      url: sUrl,
      status: iStatus,
      originalError: oError
    }
  );
}

function normalizeAbortError(oError, iTimeoutMs) {
  if (oError && oError.name === "AbortError") {
    return new Error("request timed out after " + iTimeoutMs + " ms");
  }

  return oError instanceof Error ? oError : new Error(String(oError));
}

async function readResponseHint(oResponse) {
  try {
    const sText = (await oResponse.text()).replace(/\s+/g, " ").trim().slice(0, 200);

    return sText ? ": " + sText : "";
  } catch {
    return "";
  }
}

function positiveInteger(vValue, iFallback) {
  const iValue = Number(vValue);

  return Number.isInteger(iValue) && iValue > 0 ? iValue : iFallback;
}

function nonNegativeNumber(vValue, iFallback) {
  const iValue = Number(vValue);

  return Number.isFinite(iValue) && iValue >= 0 ? iValue : iFallback;
}

function sleep(iMilliseconds) {
  return new Promise(function (fnResolve) {
    timers.setTimeout(fnResolve, iMilliseconds);
  });
}

module.exports = {
  NetworkRequestError: NetworkRequestError,
  fetchWithRetry: fetchWithRetry
};
